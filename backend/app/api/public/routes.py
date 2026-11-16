from flask import Blueprint, Response, current_app, request
from sqlalchemy import or_

from app.extensions import db, limiter
from app.models.competition import Category, Competition, Round
from app.models.elimination import EliminationRun
from app.models.nominee import Nominee
from app.models.operations import ModerationReport, PlatformSetting, SupportTicket
from app.policies.rbac import get_current_user
from app.schemas import DomainError
from app.services.voting_service import (
    compute_round_standings,
    get_incident_banner,
    get_nominee_round_votes,
    get_votes_map_for_round,
    resolve_voting_target,
)
from app.utils.pagination import paginate_query
from app.utils.responses import api_success
from app.utils.security import generate_qr_png_bytes, generate_reference

public_bp = Blueprint("public", __name__)

DEFAULT_FAQS = [
    {
        "q": "How do I enter the StageLight Talent Hunt?",
        "a": "Create a free account, choose an open competition and category, upload your original video/audio demo (or approved YouTube/Vimeo link), and accept the competition rules.",
    },
    {
        "q": "How does paid voting work and when are votes counted?",
        "a": "Select a nominee's official voting link, pick a vote package in GHS, and pay via Mobile Money or Bank Card. Votes are credited to the immutable vote ledger ONLY after the payment provider confirms settlement via signed server verification.",
    },
    {
        "q": "Can I vote without creating an account?",
        "a": "Yes! Guest voters can vote directly using a nominee's unique voting link and receive an official StageLight receipt code (e.g. TH-2026-XXXXXXXX) upon payment confirmation.",
    },
    {
        "q": "How are eliminations and ties decided?",
        "a": "Each round publishes its elimination rule (such as Top N) before voting opens. At round close, votes freeze, pending payments are reconciled, and ties are resolved strictly by the published tie-breakers.",
    },
    {
        "q": "Are voters' phone numbers or payment details shown to nominees?",
        "a": "Never. Nominees see only aggregate verified vote counts and trends. Voter personal data and payment credentials remain strictly private.",
    },
]


@public_bp.get("/public/home")
def public_home():
    comp = (
        Competition.query.filter(Competition.status != "DRAFT", Competition.status != "ARCHIVED")
        .order_by(Competition.created_at.desc())
        .first()
    )

    featured_nominees = []
    leaderboard = None
    active_round = None

    if comp:
        active_round = (
            Round.query.filter_by(competition_id=comp.id, status="OPEN")
            .order_by(Round.sequence_no.asc())
            .first()
        )
        votes_map = get_votes_map_for_round(active_round.id) if (active_round and comp.public_leaderboard) else {}

        noms = (
            Nominee.query.filter(
                Nominee.competition_id == comp.id,
                Nominee.status.in_(["ACTIVE", "QUALIFIED", "WINNER"]),
            )
            .order_by(Nominee.is_featured.desc(), Nominee.nominated_at.desc())
            .limit(8)
            .all()
        )
        for n in noms:
            pub_v = votes_map.get(n.id) if comp.public_leaderboard and active_round else None
            featured_nominees.append(n.to_public_dict(public_votes=pub_v))

        if comp.public_leaderboard and active_round:
            standings = compute_round_standings(active_round)
            leaderboard = {
                "round": active_round.to_dict(),
                "entries": standings[:10],
            }

    ann_setting = PlatformSetting.query.filter_by(key="announcements").first()
    announcements = (ann_setting.value_json or {}).get("items", []) if ann_setting else []

    return api_success(
        {
            "platform_name": current_app.config.get("PLATFORM_NAME", "StageLight"),
            "currency": current_app.config.get("PLATFORM_CURRENCY", "GHS"),
            "incident_banner": get_incident_banner(),
            "active_competition": comp.to_dict(include_details=True) if comp else None,
            "active_round": active_round.to_dict() if active_round else None,
            "featured_nominees": featured_nominees,
            "leaderboard": leaderboard,
            "announcements": announcements,
            "faqs": DEFAULT_FAQS,
        }
    )


@public_bp.get("/public/info")
def public_info():
    ann_setting = PlatformSetting.query.filter_by(key="announcements").first()
    comp = Competition.query.filter(Competition.status != "DRAFT").order_by(Competition.created_at.desc()).first()
    return api_success(
        {
            "platform_name": current_app.config.get("PLATFORM_NAME", "StageLight"),
            "incident_banner": get_incident_banner(),
            "faqs": DEFAULT_FAQS,
            "announcements": (ann_setting.value_json or {}).get("items", []) if ann_setting else [],
            "active_rules": comp.rules if comp else None,
            "active_eligibility": comp.eligibility if comp else None,
        }
    )


@public_bp.get("/competitions")
def list_public_competitions():
    q = Competition.query.filter(Competition.status.notin_(["DRAFT", "ARCHIVED"]))
    status = request.args.get("status")
    if status:
        q = q.filter(Competition.status == status.upper())
    q = q.order_by(Competition.created_at.desc())
    items, meta = paginate_query(q, lambda c: c.to_dict(include_details=True))
    return api_success(items, meta)


@public_bp.get("/competitions/<slug>")
def get_public_competition(slug: str):
    comp = Competition.query.filter_by(slug=slug).first()
    if not comp or comp.status == "DRAFT":
        raise DomainError("NOT_FOUND", "Competition not found.", 404)

    published_rounds = []
    for r in comp.rounds:
        if r.results_published:
            published_rounds.append(r.to_dict())

    data = comp.to_dict(include_details=True)
    data["published_result_rounds"] = published_rounds
    return api_success(data)


@public_bp.get("/competitions/<slug>/nominees")
def list_competition_nominees(slug: str):
    comp = Competition.query.filter_by(slug=slug).first()
    if not comp or comp.status == "DRAFT":
        raise DomainError("NOT_FOUND", "Competition not found.", 404)
    return _query_public_nominees(competition=comp)


@public_bp.get("/nominees")
def list_all_public_nominees():
    comp_slug = request.args.get("competition")
    comp = None
    if comp_slug:
        comp = Competition.query.filter_by(slug=comp_slug).first()
    return _query_public_nominees(competition=comp)


def _query_public_nominees(competition: Competition | None = None):
    q = Nominee.query.join(Competition, Nominee.competition_id == Competition.id).filter(
        Competition.status.notin_(["DRAFT", "ARCHIVED"]),
        Nominee.status.notin_(["PENDING", "SUSPENDED"]),
    )
    if competition:
        q = q.filter(Nominee.competition_id == competition.id)

    category_id = request.args.get("category_id")
    category_slug = request.args.get("category")
    if category_id:
        q = q.filter(Nominee.category_id == category_id)
    elif category_slug:
        q = q.join(Category, Nominee.category_id == Category.id).filter(Category.slug == category_slug)

    status = request.args.get("status")
    if status:
        q = q.filter(Nominee.status == status.upper())

    search = (request.args.get("q") or "").strip()
    if search:
        like_pat = f"%{search}%"
        q = q.filter(
            or_(
                Nominee.public_name.ilike(like_pat),
                Nominee.tagline.ilike(like_pat),
                Nominee.location.ilike(like_pat),
            )
        )

    q = q.order_by(Nominee.is_featured.desc(), Nominee.public_name.asc())

    def _serialize_nom(n: Nominee):
        c = n.competition
        pub_votes = None
        if c and c.public_leaderboard:
            ae = n.get_active_round_entry()
            if ae:
                pub_votes = get_nominee_round_votes(n.id, ae.round_id)
        return n.to_public_dict(public_votes=pub_votes)

    items, meta = paginate_query(q, _serialize_nom, default_per_page=12)
    return api_success(items, meta)


@public_bp.get("/nominees/<slug>")
def get_public_nominee_profile(slug: str):
    nominee = Nominee.query.filter_by(public_slug=slug).first()
    if not nominee or nominee.status in ("PENDING", "SUSPENDED"):
        raise DomainError("NOT_FOUND", "Nominee profile not found.", 404)

    comp = nominee.competition
    active_entry = nominee.get_active_round_entry()
    pub_votes = None
    if comp and comp.public_leaderboard and active_entry:
        pub_votes = get_nominee_round_votes(nominee.id, active_entry.round_id)

    profile = nominee.to_public_dict(public_votes=pub_votes)
    # Include historical published round outcomes
    published_history = []
    for re_item in sorted(nominee.round_entries, key=lambda e: e.round.sequence_no if e.round else 0):
        if re_item.round and re_item.round.results_published:
            published_history.append(
                {
                    "round_id": re_item.round_id,
                    "round_name": re_item.round.name,
                    "outcome": re_item.status,
                    "final_votes": re_item.final_total_snapshot,
                }
            )
    profile["published_round_history"] = published_history
    return api_success(profile)


@public_bp.get("/vote-links/<slug>")
def resolve_vote_link(slug: str):
    comp_slug = request.args.get("competition")
    resolved = resolve_voting_target(slug, competition_slug=comp_slug)
    return api_success(resolved)


@public_bp.get("/vote-links/<slug>/qr.png")
def vote_link_qr_png(slug: str):
    resolved = resolve_voting_target(slug)
    comp_slug = resolved["competition"]["slug"] if resolved.get("competition") else "vote"
    target_slug = resolved["round_entry"]["voting_slug"] if resolved.get("round_entry") else slug
    full_url = request.host_url.rstrip("/") + f"/vote/{comp_slug}/{target_slug}"
    png_bytes = generate_qr_png_bytes(full_url)
    return Response(
        png_bytes,
        mimetype="image/png",
        headers={"Cache-Control": "public, max-age=300"},
    )


@public_bp.get("/competitions/<slug>/results")
def list_competition_published_results(slug: str):
    comp = Competition.query.filter_by(slug=slug).first()
    if not comp or comp.status == "DRAFT":
        raise DomainError("NOT_FOUND", "Competition not found.", 404)

    rounds_out = []
    for r in comp.rounds:
        if r.results_published:
            latest_run = (
                EliminationRun.query.filter_by(round_id=r.id)
                .order_by(EliminationRun.executed_at.desc())
                .first()
            )
            rounds_out.append(
                {
                    "round": r.to_dict(),
                    "snapshot": latest_run.to_dict(include_results=True) if latest_run else None,
                }
            )
        elif comp.public_leaderboard and r.status == "OPEN":
            rounds_out.append(
                {
                    "round": r.to_dict(),
                    "live_leaderboard": compute_round_standings(r),
                }
            )

    return api_success(
        {
            "competition": comp.to_dict(include_details=False),
            "rounds": rounds_out,
        }
    )


@public_bp.get("/competitions/<slug>/results/<round_id>")
def get_round_published_results(slug: str, round_id: str):
    comp = Competition.query.filter_by(slug=slug).first()
    if not comp or comp.status == "DRAFT":
        raise DomainError("NOT_FOUND", "Competition not found.", 404)

    round_obj = Round.query.filter_by(id=round_id, competition_id=comp.id).first()
    if not round_obj:
        raise DomainError("NOT_FOUND", "Round not found.", 404)

    if round_obj.results_published:
        latest_run = (
            EliminationRun.query.filter_by(round_id=round_obj.id)
            .order_by(EliminationRun.executed_at.desc())
            .first()
        )
        return api_success(
            {
                "competition": comp.to_dict(include_details=False),
                "round": round_obj.to_dict(),
                "is_final_snapshot": True,
                "snapshot": latest_run.to_dict(include_results=True) if latest_run else None,
            }
        )

    if comp.public_leaderboard:
        return api_success(
            {
                "competition": comp.to_dict(include_details=False),
                "round": round_obj.to_dict(),
                "is_final_snapshot": False,
                "live_leaderboard": compute_round_standings(round_obj),
            }
        )

    raise DomainError("RESULTS_NOT_PUBLISHED", "Results for this round have not been published yet.", 403)


@public_bp.post("/public/support")
@limiter.limit("10 per minute")
def submit_support_ticket():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("contact_name") or "").strip()
    subject = (payload.get("subject") or "").strip()
    message = (payload.get("message") or "").strip()
    email = (payload.get("contact_email") or "").strip() or None
    phone = (payload.get("contact_phone") or "").strip() or None

    if not name or not subject or len(message) < 10 or (not email and not phone):
        raise DomainError(
            "VALIDATION_ERROR",
            "Name, email or phone, subject, and a message (min 10 characters) are required.",
            422,
        )

    user = get_current_user()
    ref = generate_reference("SUP")
    ticket = SupportTicket(
        ticket_reference=ref,
        user_id=user.id if user else None,
        order_reference=(payload.get("order_reference") or "").strip() or None,
        contact_name=name,
        contact_email=email,
        contact_phone=phone,
        category=(payload.get("category") or "GENERAL").upper(),
        subject=subject,
        message=message,
        status="OPEN",
    )
    db.session.add(ticket)
    db.session.commit()
    return api_success(ticket.to_dict(), status_code=201)


@public_bp.post("/public/report")
@limiter.limit("10 per minute")
def submit_abuse_report():
    payload = request.get_json(silent=True) or {}
    entity_type = (payload.get("entity_type") or "NOMINEE").upper()
    entity_id = (payload.get("entity_id") or "").strip()
    reason = (payload.get("reason") or "").strip()
    if entity_type not in ("SUBMISSION", "NOMINEE") or not entity_id or not reason:
        raise DomainError("VALIDATION_ERROR", "Entity, entity_id, and reason are required.", 422)

    user = get_current_user()
    rep = ModerationReport(
        reporter_user_id=user.id if user else None,
        entity_type=entity_type,
        entity_id=entity_id,
        reason=reason[:120],
        details=(payload.get("details") or "").strip() or None,
        status="OPEN",
    )
    db.session.add(rep)
    db.session.commit()
    return api_success({"report_id": rep.id, "status": rep.status}, status_code=201)
