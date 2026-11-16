import csv
import io
from flask import Blueprint, Response, request
from sqlalchemy import func

from app.extensions import db
from app.models.application import Application
from app.models.competition import COMPETITION_STATUSES, ROUND_STATUSES, Category, Competition, Round, VotePackage
from app.models.elimination import EliminationRun
from app.models.nominee import NOMINEE_STATUSES, Nominee, RoundEntry
from app.models.operations import AuditLog, ModerationReport, PlatformSetting, SupportTicket
from app.models.user import ROLE_DEFINITIONS, User
from app.models.voting import Order, Payment, VoteLedger, WebhookEvent
from app.policies.rbac import get_current_user, roles_required
from app.schemas import DomainError
from app.services.audit_service import log_audit
from app.services.auth_service import set_user_roles
from app.services.elimination_service import finalise_round_elimination, preview_round_elimination
from app.services.nomination_service import (
    decide_application,
    ensure_nominee_in_round,
    manage_nominee_voting_link,
    record_review,
)
from app.services.payment_service import reconcile_payment, refund_payment
from app.services.submission_service import moderate_submission_content
from app.services.voting_service import create_vote_adjustment, get_incident_banner, get_nominee_round_votes, get_nominee_total_votes
from app.tasks.jobs import reconcile_all_pending_payments
from app.utils.pagination import paginate_query
from app.utils.responses import api_success
from app.utils.security import slugify
from app.utils.time_utils import parse_iso_utc, utcnow

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


@admin_bp.get("/dashboard")
@roles_required("COMPETITION_MANAGER", "REVIEWER", "MODERATOR", "FINANCE_OFFICER")
def admin_dashboard():
    total_apps = Application.query.count()
    pending_reviews = Application.query.filter(Application.status.in_(["SUBMITTED", "UNDER_REVIEW"])).count()
    total_nominees = Nominee.query.filter(Nominee.status.in_(["ACTIVE", "QUALIFIED", "WINNER"])).count()
    total_votes = int(db.session.query(func.coalesce(func.sum(VoteLedger.quantity), 0)).scalar() or 0)
    gross_minor = int(
        db.session.query(func.coalesce(func.sum(Payment.amount_minor), 0))
        .filter(Payment.status == "SUCCESS")
        .scalar()
        or 0
    )
    refunded_minor = int(
        db.session.query(func.coalesce(func.sum(Payment.amount_minor), 0))
        .filter(Payment.status == "REFUNDED")
        .scalar()
        or 0
    )
    quarantined_payments = Payment.query.filter_by(status="QUARANTINED").count()
    pending_payments = Payment.query.filter(Payment.status.in_(["INITIALIZED", "PENDING"])).count()
    open_moderation = ModerationReport.query.filter(ModerationReport.status.in_(["OPEN", "INVESTIGATING"])).count()
    open_tickets = SupportTicket.query.filter(SupportTicket.status.in_(["OPEN", "IN_PROGRESS"])).count()
    active_rounds = Round.query.filter_by(status="OPEN").all()
    competitions = Competition.query.order_by(Competition.created_at.desc()).limit(5).all()
    recent_audits = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(10).all()

    return api_success(
        {
            "kpis": {
                "total_applications": total_apps,
                "pending_reviews": pending_reviews,
                "active_nominees": total_nominees,
                "total_valid_votes": total_votes,
                "gross_collections_minor": gross_minor,
                "gross_collections_major": round(gross_minor / 100.0, 2),
                "refunded_minor": refunded_minor,
                "refunded_major": round(refunded_minor / 100.0, 2),
                "net_collections_minor": gross_minor,
                "net_collections_major": round(gross_minor / 100.0, 2),
                "quarantined_payments": quarantined_payments,
                "pending_payments": pending_payments,
                "open_moderation_cases": open_moderation,
                "open_support_tickets": open_tickets,
                "active_rounds_count": len(active_rounds),
            },
            "incident_banner": get_incident_banner(),
            "active_rounds": [r.to_dict() for r in active_rounds],
            "competitions": [c.to_dict(include_details=False) for c in competitions],
            "recent_audit_logs": [a.to_dict() for a in recent_audits],
        }
    )


# --- Competitions ---
@admin_bp.get("/competitions")
@roles_required("COMPETITION_MANAGER", "REVIEWER", "FINANCE_OFFICER")
def admin_list_competitions():
    comps = Competition.query.order_by(Competition.created_at.desc()).all()
    return api_success([c.to_dict(include_details=True) for c in comps])


@admin_bp.post("/competitions")
@roles_required("COMPETITION_MANAGER")
def admin_create_competition():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    if len(title) < 3:
        raise DomainError("VALIDATION_ERROR", "Competition title is required.", 422)

    slug = slugify(payload.get("slug") or title)
    if Competition.query.filter_by(slug=slug).first():
        raise DomainError("DUPLICATE_SLUG", f"Slug '{slug}' is already in use.", 409)

    status = (payload.get("status") or "DRAFT").upper()
    if status not in COMPETITION_STATUSES:
        raise DomainError("INVALID_STATUS", "Invalid competition status.", 422)

    comp = Competition(
        title=title,
        slug=slug,
        tagline=(payload.get("tagline") or "").strip() or None,
        description=(payload.get("description") or "").strip() or None,
        status=status,
        applications_open_at=parse_iso_utc(payload.get("applications_open_at")),
        applications_close_at=parse_iso_utc(payload.get("applications_close_at")),
        starts_at=parse_iso_utc(payload.get("starts_at")),
        ends_at=parse_iso_utc(payload.get("ends_at")),
        timezone=(payload.get("timezone") or "Africa/Accra").strip(),
        currency=(payload.get("currency") or "GHS").upper().strip(),
        rules=payload.get("rules"),
        eligibility=payload.get("eligibility"),
        prize_summary=payload.get("prize_summary"),
        public_leaderboard=bool(payload.get("public_leaderboard", False)),
        nominee_see_rank=bool(payload.get("nominee_see_rank", True)),
        allow_custom_quantity=bool(payload.get("allow_custom_quantity", True)),
        unit_vote_price_minor=int(payload.get("unit_vote_price_minor", 100)),
        min_vote_quantity=int(payload.get("min_vote_quantity", 1)),
        max_vote_quantity_per_order=int(payload.get("max_vote_quantity_per_order", 500)),
        max_votes_per_day_per_contact=int(payload["max_votes_per_day_per_contact"]) if payload.get("max_votes_per_day_per_contact") else None,
        require_guardian_for_minors=bool(payload.get("require_guardian_for_minors", True)),
    )
    db.session.add(comp)
    db.session.flush()

    log_audit(
        actor_user_id=actor.id,
        action="COMPETITION_CREATED",
        entity_type="competition",
        entity_id=comp.id,
        after={"title": comp.title, "slug": comp.slug, "status": comp.status},
    )
    db.session.commit()
    return api_success(comp.to_dict(include_details=True), status_code=201)


@admin_bp.patch("/competitions/<comp_id>")
@roles_required("COMPETITION_MANAGER")
def admin_update_competition(comp_id: str):
    actor = get_current_user()
    comp = db.session.get(Competition, comp_id)
    if not comp:
        raise DomainError("NOT_FOUND", "Competition not found.", 404)

    payload = request.get_json(silent=True) or {}
    before = {"title": comp.title, "status": comp.status, "voting_paused": comp.voting_paused, "public_leaderboard": comp.public_leaderboard}

    for field in ("title", "tagline", "description", "timezone", "rules", "eligibility", "prize_summary"):
        if field in payload:
            setattr(comp, field, payload[field])
    if "status" in payload:
        st = (payload["status"] or "").upper()
        if st not in COMPETITION_STATUSES:
            raise DomainError("INVALID_STATUS", "Invalid competition status.", 422)
        comp.status = st
    for dt_field in ("applications_open_at", "applications_close_at", "starts_at", "ends_at"):
        if dt_field in payload:
            setattr(comp, dt_field, parse_iso_utc(payload[dt_field]))
    for bool_field in ("public_leaderboard", "nominee_see_rank", "voting_paused", "allow_custom_quantity", "require_guardian_for_minors"):
        if bool_field in payload:
            setattr(comp, bool_field, bool(payload[bool_field]))
    for int_field in ("unit_vote_price_minor", "min_vote_quantity", "max_vote_quantity_per_order"):
        if int_field in payload and payload[int_field] is not None:
            setattr(comp, int_field, int(payload[int_field]))
    if "max_votes_per_day_per_contact" in payload:
        val = payload["max_votes_per_day_per_contact"]
        comp.max_votes_per_day_per_contact = int(val) if val else None

    log_audit(
        actor_user_id=actor.id,
        action="COMPETITION_UPDATED",
        entity_type="competition",
        entity_id=comp.id,
        before=before,
        after={"title": comp.title, "status": comp.status, "voting_paused": comp.voting_paused, "public_leaderboard": comp.public_leaderboard},
    )
    db.session.commit()
    return api_success(comp.to_dict(include_details=True))


# --- Categories ---
@admin_bp.get("/categories")
@roles_required("COMPETITION_MANAGER", "REVIEWER")
def admin_list_categories():
    comp_id = request.args.get("competition_id")
    q = Category.query
    if comp_id:
        q = q.filter_by(competition_id=comp_id)
    return api_success([c.to_dict() for c in q.order_by(Category.name.asc()).all()])


@admin_bp.post("/categories")
@roles_required("COMPETITION_MANAGER")
def admin_create_category():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    comp = db.session.get(Competition, payload.get("competition_id") or "")
    if not comp:
        raise DomainError("NOT_FOUND", "Competition not found.", 404)
    name = (payload.get("name") or "").strip()
    if len(name) < 2:
        raise DomainError("VALIDATION_ERROR", "Category name is required.", 422)
    slug = slugify(payload.get("slug") or name)
    if Category.query.filter_by(competition_id=comp.id, slug=slug).first():
        raise DomainError("DUPLICATE_CATEGORY", "Category slug already exists in this competition.", 409)

    cat = Category(
        competition_id=comp.id,
        name=name,
        slug=slug,
        description=(payload.get("description") or "").strip() or None,
        icon=(payload.get("icon") or "star").strip(),
        status=(payload.get("status") or "ACTIVE").upper(),
    )
    db.session.add(cat)
    db.session.flush()
    log_audit(actor_user_id=actor.id, action="CATEGORY_CREATED", entity_type="category", entity_id=cat.id, after=cat.to_dict())
    db.session.commit()
    return api_success(cat.to_dict(), status_code=201)


@admin_bp.patch("/categories/<cat_id>")
@roles_required("COMPETITION_MANAGER")
def admin_update_category(cat_id: str):
    actor = get_current_user()
    cat = db.session.get(Category, cat_id)
    if not cat:
        raise DomainError("NOT_FOUND", "Category not found.", 404)
    payload = request.get_json(silent=True) or {}
    for f in ("name", "description", "icon", "status"):
        if f in payload and payload[f] is not None:
            setattr(cat, f, payload[f])
    log_audit(actor_user_id=actor.id, action="CATEGORY_UPDATED", entity_type="category", entity_id=cat.id, after=cat.to_dict())
    db.session.commit()
    return api_success(cat.to_dict())


# --- Rounds ---
@admin_bp.get("/rounds")
@roles_required("COMPETITION_MANAGER", "REVIEWER", "FINANCE_OFFICER")
def admin_list_rounds():
    comp_id = request.args.get("competition_id")
    q = Round.query
    if comp_id:
        q = q.filter_by(competition_id=comp_id)
    return api_success([r.to_dict() for r in q.order_by(Round.competition_id, Round.sequence_no.asc()).all()])


@admin_bp.post("/rounds")
@roles_required("COMPETITION_MANAGER")
def admin_create_round():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    comp = db.session.get(Competition, payload.get("competition_id") or "")
    if not comp:
        raise DomainError("NOT_FOUND", "Competition not found.", 404)
    name = (payload.get("name") or "").strip()
    if len(name) < 2:
        raise DomainError("VALIDATION_ERROR", "Round name is required.", 422)

    seq = int(payload.get("sequence_no") or (len(comp.rounds) + 1))
    if Round.query.filter_by(competition_id=comp.id, sequence_no=seq).first():
        raise DomainError("DUPLICATE_SEQUENCE", f"Sequence #{seq} already exists in this competition.", 409)

    status = (payload.get("status") or "DRAFT").upper()
    if status not in ROUND_STATUSES:
        raise DomainError("INVALID_STATUS", "Invalid round status.", 422)

    elim_cfg = payload.get("elimination_config") or {
        "method": "top_n",
        "advance_count": 5,
        "tie_breakers": ["judge_score_desc", "earliest_qualifying_vote_timestamp"],
        "exclude_disqualified": True,
        "publish_rankings": True,
        "pending_payment_grace_minutes": 30,
    }
    rnd = Round(
        competition_id=comp.id,
        name=name,
        sequence_no=seq,
        description=(payload.get("description") or "").strip() or None,
        status=status,
        voting_opens_at=parse_iso_utc(payload.get("voting_opens_at")),
        voting_closes_at=parse_iso_utc(payload.get("voting_closes_at")),
        elimination_config=elim_cfg,
        is_finale=bool(payload.get("is_finale", False)),
        results_published=bool(payload.get("results_published", False)),
    )
    db.session.add(rnd)
    db.session.flush()
    log_audit(actor_user_id=actor.id, action="ROUND_CREATED", entity_type="round", entity_id=rnd.id, after=rnd.to_dict())
    db.session.commit()
    return api_success(rnd.to_dict(), status_code=201)


@admin_bp.patch("/rounds/<round_id>")
@roles_required("COMPETITION_MANAGER")
def admin_update_round(round_id: str):
    actor = get_current_user()
    rnd = db.session.get(Round, round_id)
    if not rnd:
        raise DomainError("NOT_FOUND", "Round not found.", 404)
    payload = request.get_json(silent=True) or {}
    before = {"status": rnd.status, "elimination_config": rnd.elimination_config}

    if "name" in payload:
        rnd.name = (payload["name"] or "").strip() or rnd.name
    if "description" in payload:
        rnd.description = payload["description"]
    if "status" in payload:
        st = (payload["status"] or "").upper()
        if st not in ROUND_STATUSES:
            raise DomainError("INVALID_STATUS", "Invalid round status.", 422)
        rnd.status = st
    if "voting_opens_at" in payload:
        rnd.voting_opens_at = parse_iso_utc(payload["voting_opens_at"])
    if "voting_closes_at" in payload:
        rnd.voting_closes_at = parse_iso_utc(payload["voting_closes_at"])
    if "elimination_config" in payload and isinstance(payload["elimination_config"], dict):
        rnd.elimination_config = {**(rnd.elimination_config or {}), **payload["elimination_config"]}
    if "is_finale" in payload:
        rnd.is_finale = bool(payload["is_finale"])
    if "results_published" in payload:
        rnd.results_published = bool(payload["results_published"])

    log_audit(
        actor_user_id=actor.id,
        action="ROUND_UPDATED",
        entity_type="round",
        entity_id=rnd.id,
        before=before,
        after={"status": rnd.status, "results_published": rnd.results_published},
    )
    db.session.commit()
    return api_success(rnd.to_dict())


# --- Vote Packages ---
@admin_bp.get("/packages")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_list_packages():
    comp_id = request.args.get("competition_id")
    q = VotePackage.query
    if comp_id:
        q = q.filter_by(competition_id=comp_id)
    return api_success([p.to_dict() for p in q.order_by(VotePackage.sort_order.asc(), VotePackage.vote_quantity.asc()).all()])


@admin_bp.post("/packages")
@roles_required("COMPETITION_MANAGER")
def admin_create_package():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    comp = db.session.get(Competition, payload.get("competition_id") or "")
    if not comp:
        raise DomainError("NOT_FOUND", "Competition not found.", 404)

    name = (payload.get("name") or "").strip()
    qty = int(payload.get("vote_quantity") or 0)
    price_minor = int(payload.get("price_minor") or 0)
    if not name or qty < 1 or price_minor < 1:
        raise DomainError("VALIDATION_ERROR", "Package name, positive vote_quantity, and positive price_minor are required.", 422)

    pkg = VotePackage(
        competition_id=comp.id,
        name=name,
        description=(payload.get("description") or "").strip() or None,
        vote_quantity=qty,
        price_minor=price_minor,
        currency=comp.currency,
        is_featured=bool(payload.get("is_featured", False)),
        sort_order=int(payload.get("sort_order", 0)),
        status=(payload.get("status") or "ACTIVE").upper(),
    )
    db.session.add(pkg)
    db.session.flush()
    log_audit(actor_user_id=actor.id, action="VOTE_PACKAGE_CREATED", entity_type="vote_package", entity_id=pkg.id, after=pkg.to_dict())
    db.session.commit()
    return api_success(pkg.to_dict(), status_code=201)


@admin_bp.patch("/packages/<pkg_id>")
@roles_required("COMPETITION_MANAGER")
def admin_update_package(pkg_id: str):
    actor = get_current_user()
    pkg = db.session.get(VotePackage, pkg_id)
    if not pkg:
        raise DomainError("NOT_FOUND", "Vote package not found.", 404)
    payload = request.get_json(silent=True) or {}
    before = pkg.to_dict()
    for field in ("name", "description", "status"):
        if field in payload and payload[field] is not None:
            setattr(pkg, field, payload[field])
    for int_field in ("vote_quantity", "price_minor", "sort_order"):
        if int_field in payload and payload[int_field] is not None:
            setattr(pkg, int_field, int(payload[int_field]))
    if "is_featured" in payload:
        pkg.is_featured = bool(payload["is_featured"])

    log_audit(actor_user_id=actor.id, action="VOTE_PACKAGE_UPDATED", entity_type="vote_package", entity_id=pkg.id, before=before, after=pkg.to_dict())
    db.session.commit()
    return api_success(pkg.to_dict())


# --- Submissions & Review Queue ---
@admin_bp.get("/submissions")
@roles_required("COMPETITION_MANAGER", "REVIEWER", "MODERATOR")
def admin_list_submissions():
    q = Application.query
    if request.args.get("competition_id"):
        q = q.filter_by(competition_id=request.args["competition_id"])
    if request.args.get("category_id"):
        q = q.filter_by(category_id=request.args["category_id"])
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].upper())

    q = q.order_by(Application.submitted_at.desc())
    items, meta = paginate_query(q, lambda a: a.to_dict(include_internal=True), default_per_page=20)
    return api_success(items, meta)


@admin_bp.get("/submissions/<app_id>")
@roles_required("COMPETITION_MANAGER", "REVIEWER", "MODERATOR")
def admin_get_submission(app_id: str):
    app_rec = db.session.get(Application, app_id)
    if not app_rec:
        raise DomainError("NOT_FOUND", "Submission not found.", 404)
    return api_success(app_rec.to_dict(include_internal=True))


@admin_bp.post("/submissions/<app_id>/review")
@roles_required("COMPETITION_MANAGER", "REVIEWER")
def admin_review_submission(app_id: str):
    reviewer = get_current_user()
    payload = request.get_json(silent=True) or {}
    rev = record_review(reviewer, app_id, payload)
    app_rec = db.session.get(Application, app_id)
    return api_success({"review": rev.to_dict(), "application": app_rec.to_dict(include_internal=True)}, status_code=201)


@admin_bp.post("/submissions/<app_id>/decision")
@roles_required("COMPETITION_MANAGER")
def admin_decide_submission(app_id: str):
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    result = decide_application(actor, app_id, payload)
    return api_success(result)


@admin_bp.post("/submissions/<app_id>/moderate")
@roles_required("COMPETITION_MANAGER", "MODERATOR")
def admin_moderate_submission(app_id: str):
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    updated = moderate_submission_content(
        actor,
        app_id,
        (payload.get("moderation_status") or "HIDDEN").upper(),
        payload.get("reason") or "",
    )
    return api_success(updated.to_dict(include_internal=True))


# --- Nominees Management ---
@admin_bp.get("/nominees")
@roles_required("COMPETITION_MANAGER", "MODERATOR", "FINANCE_OFFICER")
def admin_list_nominees():
    q = Nominee.query
    if request.args.get("competition_id"):
        q = q.filter_by(competition_id=request.args["competition_id"])
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].upper())

    q = q.order_by(Nominee.nominated_at.desc())

    def _serialize(n: Nominee):
        ae = n.get_active_round_entry()
        d = n.to_public_dict()
        d["total_votes"] = get_nominee_total_votes(n.id)
        d["current_round_votes"] = get_nominee_round_votes(n.id, ae.round_id) if ae else 0
        d["round_entries"] = [re_item.to_dict() for re_item in n.round_entries]
        d["disqualification_reason"] = n.disqualification_reason
        return d

    items, meta = paginate_query(q, _serialize, default_per_page=25)
    return api_success(items, meta)


@admin_bp.patch("/nominees/<nominee_id>")
@roles_required("COMPETITION_MANAGER")
def admin_update_nominee(nominee_id: str):
    actor = get_current_user()
    nom = db.session.get(Nominee, nominee_id)
    if not nom:
        raise DomainError("NOT_FOUND", "Nominee not found.", 404)
    payload = request.get_json(silent=True) or {}
    before = {"status": nom.status, "is_featured": nom.is_featured, "voting_paused": nom.voting_paused}

    if "public_name" in payload and (payload["public_name"] or "").strip():
        nom.public_name = payload["public_name"].strip()
    if "is_featured" in payload:
        nom.is_featured = bool(payload["is_featured"])
    if "voting_paused" in payload:
        nom.voting_paused = bool(payload["voting_paused"])
    if "status" in payload:
        new_st = (payload["status"] or "").upper()
        if new_st not in NOMINEE_STATUSES:
            raise DomainError("INVALID_STATUS", "Invalid nominee status.", 422)
        if new_st == "DISQUALIFIED" and not (payload.get("reason") or nom.disqualification_reason):
            raise DomainError("REASON_REQUIRED", "Disqualification requires a documented reason.", 422)
        nom.status = new_st
        if new_st == "DISQUALIFIED":
            nom.disqualification_reason = (payload.get("reason") or nom.disqualification_reason or "").strip()
            for re_item in nom.round_entries:
                if re_item.round and re_item.round.status != "FINALIZED":
                    re_item.status = "DISQUALIFIED"

    if payload.get("enroll_round_id"):
        rnd = db.session.get(Round, payload["enroll_round_id"])
        if rnd and rnd.competition_id == nom.competition_id:
            ensure_nominee_in_round(nom, rnd, judge_score=float(payload.get("judge_score", 0.0)))

    if "judge_score" in payload and payload.get("round_id"):
        entry = RoundEntry.query.filter_by(nominee_id=nom.id, round_id=payload["round_id"]).first()
        if entry:
            entry.judge_score = float(payload["judge_score"])

    log_audit(
        actor_user_id=actor.id,
        action="NOMINEE_UPDATED",
        entity_type="nominee",
        entity_id=nom.id,
        before=before,
        after={"status": nom.status, "is_featured": nom.is_featured, "voting_paused": nom.voting_paused},
    )
    db.session.commit()
    return api_success(nom.to_public_dict())


@admin_bp.post("/nominees/<nominee_id>/voting-link")
@roles_required("COMPETITION_MANAGER")
def admin_manage_voting_link(nominee_id: str):
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    entry = manage_nominee_voting_link(
        actor,
        nominee_id,
        payload.get("action") or "",
        round_id=payload.get("round_id"),
        reason=payload.get("reason") or "",
    )
    return api_success(entry.to_dict())


# --- Vote Ledger & Adjustments ---
@admin_bp.get("/votes")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_list_vote_ledger():
    q = VoteLedger.query
    if request.args.get("round_id"):
        q = q.filter_by(round_id=request.args["round_id"])
    if request.args.get("nominee_id"):
        q = q.filter_by(nominee_id=request.args["nominee_id"])
    if request.args.get("entry_type"):
        q = q.filter_by(entry_type=request.args["entry_type"].upper())
    q = q.order_by(VoteLedger.created_at.desc())
    items, meta = paginate_query(q, lambda le: le.to_dict(), default_per_page=30)
    return api_success(items, meta)


@admin_bp.post("/votes/adjustments")
@roles_required("SUPER_ADMIN")
def admin_create_vote_adjustment():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    entry = create_vote_adjustment(
        actor,
        nominee_id=payload.get("nominee_id") or "",
        round_id=payload.get("round_id") or "",
        quantity=int(payload.get("quantity") or 0),
        reason=payload.get("reason") or "",
        approval_reference=payload.get("approval_reference") or "",
    )
    return api_success(entry.to_dict(), status_code=201)


# --- Orders, Payments, Reconciliation & Refunds ---
@admin_bp.get("/orders")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_list_orders():
    q = Order.query
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].upper())
    if request.args.get("round_id"):
        q = q.filter_by(round_id=request.args["round_id"])
    if request.args.get("nominee_id"):
        q = q.filter_by(nominee_id=request.args["nominee_id"])
    q = q.order_by(Order.created_at.desc())
    items, meta = paginate_query(q, lambda o: o.to_dict(include_finance=True), default_per_page=25)
    return api_success(items, meta)


@admin_bp.get("/payments")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_list_payments():
    q = Payment.query
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].upper())
    q = q.order_by(Payment.created_at.desc())
    items, meta = paginate_query(q, lambda p: p.to_dict(), default_per_page=25)
    webhooks = [w.to_dict() for w in WebhookEvent.query.order_by(WebhookEvent.received_at.desc()).limit(15).all()]
    meta["recent_webhooks"] = webhooks
    return api_success(items, meta)


@admin_bp.post("/payments/<payment_id>/reconcile")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_reconcile_payment(payment_id: str):
    actor = get_current_user()
    res = reconcile_payment(actor, payment_id)
    return api_success(res)


@admin_bp.post("/payments/reconcile-pending")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_reconcile_all_pending():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    summary = reconcile_all_pending_payments(actor, round_id=payload.get("round_id"))
    return api_success(summary)


@admin_bp.post("/payments/<payment_id>/refund")
@roles_required("FINANCE_OFFICER")
def admin_refund_payment(payment_id: str):
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    res = refund_payment(actor, payment_id, payload.get("reason") or "")
    return api_success(res)


# --- Eliminations ---
@admin_bp.get("/eliminations/<round_id>/preview")
@roles_required("COMPETITION_MANAGER")
def admin_preview_elimination(round_id: str):
    method = request.args.get("method")
    override = {}
    if method:
        override["method"] = method
    if request.args.get("advance_count"):
        override["advance_count"] = int(request.args["advance_count"])
    if request.args.get("advance_percentage"):
        override["advance_percentage"] = float(request.args["advance_percentage"])
    if request.args.get("min_votes_threshold"):
        override["min_votes_threshold"] = int(request.args["min_votes_threshold"])

    preview = preview_round_elimination(round_id, override_config=override or None)
    runs = [r.to_dict(include_results=True) for r in EliminationRun.query.filter_by(round_id=round_id).order_by(EliminationRun.executed_at.desc()).all()]
    preview["historical_runs"] = runs
    return api_success(preview)


@admin_bp.post("/eliminations/<round_id>/finalise")
@roles_required("COMPETITION_MANAGER")
def admin_finalise_elimination(round_id: str):
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    if not payload.get("confirmed"):
        raise DomainError("CONFIRMATION_REQUIRED", "Explicit manager confirmation ('confirmed': true) is required to finalise round results.", 422)

    run = finalise_round_elimination(
        actor,
        round_id,
        manual_qualifiers=payload.get("manual_qualifiers"),
        notes=payload.get("notes"),
        publish_results=bool(payload.get("publish_results", True)),
        is_correction=bool(payload.get("is_correction", False)),
        override_config=payload.get("override_config"),
    )
    return api_success(run.to_dict(include_results=True), status_code=201)


# --- Users & Roles ---
@admin_bp.get("/users")
@roles_required("SUPER_ADMIN")
def admin_list_users():
    q = User.query.order_by(User.created_at.desc())
    items, meta = paginate_query(q, lambda u: u.to_dict(include_private=True), default_per_page=25)
    meta["available_roles"] = list(ROLE_DEFINITIONS.keys())
    return api_success(items, meta)


@admin_bp.patch("/users/<user_id>/roles")
@roles_required("SUPER_ADMIN")
def admin_update_user_roles(user_id: str):
    actor = get_current_user()
    target = db.session.get(User, user_id)
    if not target:
        raise DomainError("NOT_FOUND", "User not found.", 404)
    payload = request.get_json(silent=True) or {}
    roles = payload.get("roles") or []
    if target.id == actor.id and "SUPER_ADMIN" not in roles:
        raise DomainError("SELF_LOCKOUT_PREVENTED", "You cannot remove your own SUPER_ADMIN role.", 400)
    set_user_roles(target, roles, actor.id)
    db.session.commit()
    return api_success(target.to_dict(include_private=True))


@admin_bp.patch("/users/<user_id>/status")
@roles_required("SUPER_ADMIN")
def admin_update_user_status(user_id: str):
    actor = get_current_user()
    target = db.session.get(User, user_id)
    if not target:
        raise DomainError("NOT_FOUND", "User not found.", 404)
    payload = request.get_json(silent=True) or {}
    new_status = (payload.get("status") or "").upper()
    if new_status not in ("ACTIVE", "SUSPENDED", "DEACTIVATED"):
        raise DomainError("INVALID_STATUS", "Status must be ACTIVE, SUSPENDED, or DEACTIVATED.", 422)
    if target.id == actor.id and new_status != "ACTIVE":
        raise DomainError("SELF_LOCKOUT_PREVENTED", "You cannot suspend your own account.", 400)
    before = {"status": target.status}
    target.status = new_status
    if new_status != "ACTIVE":
        target.token_version += 1
    log_audit(actor_user_id=actor.id, action="USER_STATUS_CHANGED", entity_type="user", entity_id=target.id, before=before, after={"status": new_status})
    db.session.commit()
    return api_success(target.to_dict(include_private=True))


# --- Moderation & Support Tickets ---
@admin_bp.get("/moderation")
@roles_required("COMPETITION_MANAGER", "MODERATOR")
def admin_list_moderation():
    q = ModerationReport.query
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].upper())
    q = q.order_by(ModerationReport.created_at.desc())
    items, meta = paginate_query(q, lambda m: m.to_dict())
    return api_success(items, meta)


@admin_bp.patch("/moderation/<report_id>")
@roles_required("COMPETITION_MANAGER", "MODERATOR")
def admin_resolve_moderation(report_id: str):
    actor = get_current_user()
    rep = db.session.get(ModerationReport, report_id)
    if not rep:
        raise DomainError("NOT_FOUND", "Moderation report not found.", 404)
    payload = request.get_json(silent=True) or {}
    st = (payload.get("status") or rep.status).upper()
    if st not in ("OPEN", "INVESTIGATING", "ACTIONED", "DISMISSED"):
        raise DomainError("INVALID_STATUS", "Invalid moderation status.", 422)
    rep.status = st
    rep.resolution_notes = (payload.get("resolution_notes") or "").strip() or rep.resolution_notes
    if st in ("ACTIONED", "DISMISSED"):
        rep.resolved_by = actor.id
        rep.resolved_at = utcnow()
    log_audit(actor_user_id=actor.id, action="MODERATION_REPORT_UPDATED", entity_type="moderation_report", entity_id=rep.id, after={"status": st})
    db.session.commit()
    return api_success(rep.to_dict())


@admin_bp.get("/support-tickets")
@roles_required("COMPETITION_MANAGER", "MODERATOR", "FINANCE_OFFICER")
def admin_list_support_tickets():
    q = SupportTicket.query.order_by(SupportTicket.created_at.desc())
    items, meta = paginate_query(q, lambda t: t.to_dict())
    return api_success(items, meta)


@admin_bp.patch("/support-tickets/<ticket_id>")
@roles_required("COMPETITION_MANAGER", "MODERATOR", "FINANCE_OFFICER")
def admin_update_support_ticket(ticket_id: str):
    actor = get_current_user()
    ticket = db.session.get(SupportTicket, ticket_id)
    if not ticket:
        raise DomainError("NOT_FOUND", "Support ticket not found.", 404)
    payload = request.get_json(silent=True) or {}
    if "status" in payload:
        ticket.status = payload["status"].upper()
    if "resolution_notes" in payload:
        ticket.resolution_notes = payload["resolution_notes"]
    log_audit(actor_user_id=actor.id, action="SUPPORT_TICKET_UPDATED", entity_type="support_ticket", entity_id=ticket.id, after={"status": ticket.status})
    db.session.commit()
    return api_success(ticket.to_dict())


# --- Reports & CSV Exports ---
@admin_bp.get("/reports/<report_type>")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_generate_report(report_type: str):
    actor = get_current_user()
    rtype = report_type.lower().strip()
    export_format = (request.args.get("format") or "json").lower()

    # Finance Officers can access finance, orders, and votes reconciliation reports;
    # Competition Managers / Super Admins can access all competition reports.
    if rtype in ("applications", "nominees", "eliminations") and not actor.has_role("SUPER_ADMIN", "COMPETITION_MANAGER"):
        raise DomainError("FORBIDDEN", "Finance role is restricted to financial and vote-reconciliation reports.", 403)

    rows = []
    columns = []

    if rtype == "applications":
        columns = ["reference_no", "applicant_name", "stage_name", "competition_title", "category_name", "status", "submitted_at"]
        for a in Application.query.order_by(Application.submitted_at.desc()).all():
            d = a.to_dict(include_internal=True)
            rows.append({c: d.get(c) for c in columns})
    elif rtype == "nominees":
        columns = ["public_name", "public_slug", "competition_title", "category_name", "status", "total_votes", "nominated_at"]
        for n in Nominee.query.order_by(Nominee.nominated_at.desc()).all():
            d = n.to_public_dict()
            d["total_votes"] = get_nominee_total_votes(n.id)
            rows.append({c: d.get(c) for c in columns})
    elif rtype == "votes":
        columns = ["created_at", "entry_type", "nominee_name", "round_name", "quantity", "order_reference", "reason"]
        for le in VoteLedger.query.order_by(VoteLedger.created_at.desc()).limit(1000).all():
            d = le.to_dict()
            rows.append({c: d.get(c) for c in columns})
    elif rtype in ("finance", "orders"):
        columns = ["public_reference", "receipt_code", "nominee_name", "round_name", "vote_quantity", "amount_major", "currency", "payment_channel", "status", "created_at", "paid_at"]
        for o in Order.query.order_by(Order.created_at.desc()).limit(1000).all():
            d = o.to_dict(include_finance=True)
            rows.append({c: d.get(c) for c in columns})
    elif rtype == "eliminations":
        columns = ["round_name", "method", "nominee_name", "category_name", "final_votes", "judge_score", "final_rank", "outcome", "executed_at"]
        for run in EliminationRun.query.order_by(EliminationRun.executed_at.desc()).all():
            rd = run.to_dict(include_results=True)
            for res in rd.get("results", []):
                rows.append(
                    {
                        "round_name": rd["round_name"],
                        "method": rd["method"],
                        "nominee_name": res["nominee_name"],
                        "category_name": res["category_name"],
                        "final_votes": res["final_votes"],
                        "judge_score": res["judge_score"],
                        "final_rank": res["final_rank"],
                        "outcome": res["outcome"],
                        "executed_at": rd["executed_at"],
                    }
                )
    else:
        raise DomainError("INVALID_REPORT", f"Unknown report type '{report_type}'.", 404)

    log_audit(
        actor_user_id=actor.id,
        action="REPORT_EXPORTED",
        entity_type="report",
        entity_id=rtype,
        after={"format": export_format, "row_count": len(rows)},
    )
    db.session.commit()

    if export_format == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
        return Response(
            buf.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f'attachment; filename="stagelight-{rtype}-report.csv"'},
        )

    # Summary totals for finance report
    summary = {"row_count": len(rows)}
    if rtype == "finance":
        paid_total = sum(r["amount_major"] for r in rows if r["status"] == "PAID")
        refunded_total = sum(r["amount_major"] for r in rows if r["status"] == "REFUNDED")
        summary.update(
            {
                "gross_collections_ghs": round(paid_total + refunded_total, 2),
                "refunds_ghs": round(refunded_total, 2),
                "net_collections_ghs": round(paid_total, 2),
            }
        )

    return api_success({"report_type": rtype, "columns": columns, "summary": summary, "rows": rows})


# --- Audit Logs & Settings & Incident Pause ---
@admin_bp.get("/audit-logs")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_list_audit_logs():
    q = AuditLog.query
    if request.args.get("action"):
        q = q.filter_by(action=request.args["action"].upper())
    if request.args.get("entity_type"):
        q = q.filter_by(entity_type=request.args["entity_type"].lower())
    q = q.order_by(AuditLog.created_at.desc())
    items, meta = paginate_query(q, lambda a: a.to_dict(), default_per_page=30)
    return api_success(items, meta)


@admin_bp.get("/settings")
@roles_required("COMPETITION_MANAGER")
def admin_get_settings():
    settings = {s.key: s.value_json for s in PlatformSetting.query.all()}
    return api_success(settings)


@admin_bp.patch("/settings")
@roles_required("COMPETITION_MANAGER")
def admin_update_settings():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    for key, val in payload.items():
        rec = PlatformSetting.query.filter_by(key=key).first()
        if not rec:
            rec = PlatformSetting(key=key, value_json=val, updated_by=actor.id)
            db.session.add(rec)
        else:
            rec.value_json = val
            rec.updated_by = actor.id

    log_audit(actor_user_id=actor.id, action="PLATFORM_SETTINGS_UPDATED", entity_type="settings", after={"keys": list(payload.keys())})
    db.session.commit()
    return api_success({s.key: s.value_json for s in PlatformSetting.query.all()})


@admin_bp.post("/pause-voting")
@roles_required("COMPETITION_MANAGER")
def admin_pause_voting():
    """FR-ADM-012: Pause or resume voting globally, per competition, or per nominee."""
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    scope = (payload.get("scope") or "global").lower()
    paused = bool(payload.get("paused", True))
    message = (payload.get("incident_message") or "").strip()

    if scope == "global":
        rec = PlatformSetting.query.filter_by(key="voting_control").first()
        val = {"global_voting_paused": paused, "incident_message": message}
        if not rec:
            rec = PlatformSetting(key="voting_control", value_json=val, updated_by=actor.id)
            db.session.add(rec)
        else:
            rec.value_json = val
            rec.updated_by = actor.id
    elif scope == "competition":
        comp = db.session.get(Competition, payload.get("target_id") or "")
        if not comp:
            raise DomainError("NOT_FOUND", "Competition not found.", 404)
        comp.voting_paused = paused
    elif scope == "nominee":
        nom = db.session.get(Nominee, payload.get("target_id") or "")
        if not nom:
            raise DomainError("NOT_FOUND", "Nominee not found.", 404)
        nom.voting_paused = paused
    else:
        raise DomainError("INVALID_SCOPE", "Scope must be global, competition, or nominee.", 422)

    log_audit(
        actor_user_id=actor.id,
        action="VOTING_PAUSE_CHANGED",
        entity_type=scope,
        entity_id=payload.get("target_id") or "global",
        after={"paused": paused, "incident_message": message},
    )
    db.session.commit()
    return api_success({"scope": scope, "paused": paused, "incident_banner": get_incident_banner()})
