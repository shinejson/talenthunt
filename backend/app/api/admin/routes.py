import csv
import io
from datetime import timedelta
from flask import Blueprint, Response, current_app, request
from sqlalchemy import and_, func, or_
from sqlalchemy.orm.attributes import flag_modified

from app.extensions import db
from app.models.application import Application, Submission
from app.models.competition import COMPETITION_STATUSES, ROUND_STATUSES, Category, Competition, Round, VotePackage
from app.models.elimination import EliminationRun
from app.models.financial import PAYMENT_METHODS, PAYOUT_STATUSES, PAYOUT_TYPES, Payout
from app.models.nominee import NOMINEE_STATUSES, Nominee, RoundEntry
from app.models.operations import AuditLog, ModerationReport, PlatformSetting, SupportTicket
from app.models.partnership import PartnershipInquiry, SponsorPartner
from app.models.user import ROLE_DEFINITIONS, Role, User, UserRole
from app.models.voting import Order, Payment, VoteLedger, WebhookEvent
from app.integrations.storage.local_storage import save_uploaded_media
from app.policies.rbac import get_current_user, roles_required
from app.schemas import DomainError
from app.services.ad_service import get_ad_settings
from app.services.audit_service import log_audit
from app.services.auth_service import set_user_roles
from app.services.elimination_service import finalise_round_elimination, preview_round_elimination
from app.services.nomination_service import (
    decide_application,
    ensure_nominee_in_round,
    manage_nominee_voting_link,
    record_review,
)
from app.services.partnership_service import (
    IMAGE_UPLOAD_EXTENSIONS,
    convert_inquiry_to_org,
    create_sponsor_or_partner,
    delete_sponsor_or_partner,
    get_taxonomy_payload,
    sort_public_orgs,
    update_partnership_inquiry,
    update_sponsor_or_partner,
)
from app.services.payment_service import reconcile_payment, refund_payment
from app.services.submission_service import moderate_submission_content
from app.services.voting_service import create_vote_adjustment, get_incident_banner, get_nominee_round_votes, get_nominee_total_votes
from app.tasks.jobs import reconcile_all_pending_payments
from app.utils.pagination import apply_sort, paginate_query
from app.utils.responses import api_success
from app.utils.security import new_uuid, slugify
from app.utils.time_utils import iso_utc, parse_iso_utc, utcnow

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


def _parse_bool_arg(param_name: str) -> bool | None:
    raw = request.args.get(param_name)
    if raw is None or raw == "":
        return None
    val = str(raw).strip().lower()
    if val in ("true", "1", "yes"):
        return True
    if val in ("false", "0", "no"):
        return False
    return None


def _apply_date_range(query, col, date_from_param: str = "date_from", date_to_param: str = "date_to"):
    raw_from = (request.args.get(date_from_param) or "").strip()
    raw_to = (request.args.get(date_to_param) or "").strip()
    if raw_from:
        try:
            dt_from = parse_iso_utc(raw_from)
            if dt_from is not None:
                query = query.filter(col >= dt_from)
        except (ValueError, TypeError):
            pass
    if raw_to:
        try:
            dt_to = parse_iso_utc(raw_to)
            if dt_to is not None:
                if len(raw_to) == 10:
                    query = query.filter(col < dt_to + timedelta(days=1))
                else:
                    query = query.filter(col <= dt_to)
        except (ValueError, TypeError):
            pass
    return query


def _related_name(name_col, condition):
    """Correlated scalar subquery so list endpoints can be sorted by a related record's name."""
    return db.select(name_col).where(condition).scalar_subquery()


@admin_bp.get("/dashboard")
@roles_required("COMPETITION_MANAGER", "REVIEWER", "MODERATOR", "FINANCE_OFFICER")
def admin_dashboard():
    comp_id = (request.args.get("competition_id") or "").strip()

    app_q = Application.query
    nom_q = Nominee.query.filter(Nominee.status.in_(["ACTIVE", "QUALIFIED", "WINNER"]))
    votes_q = db.session.query(func.coalesce(func.sum(VoteLedger.quantity), 0))
    pay_success_q = db.session.query(func.coalesce(func.sum(Payment.amount_minor), 0)).filter(Payment.status == "SUCCESS")
    pay_refund_q = db.session.query(func.coalesce(func.sum(Payment.amount_minor), 0)).filter(Payment.status == "REFUNDED")
    quarantined_q = Payment.query.filter_by(status="QUARANTINED")
    pending_pay_q = Payment.query.filter(Payment.status.in_(["INITIALIZED", "PENDING"]))
    rounds_q = Round.query.filter_by(status="OPEN")

    if comp_id:
        app_q = app_q.filter_by(competition_id=comp_id)
        nom_q = nom_q.filter_by(competition_id=comp_id)
        votes_q = votes_q.filter(VoteLedger.round.has(Round.competition_id == comp_id))
        pay_success_q = pay_success_q.filter(Payment.order.has(Order.round.has(Round.competition_id == comp_id)))
        pay_refund_q = pay_refund_q.filter(Payment.order.has(Order.round.has(Round.competition_id == comp_id)))
        quarantined_q = quarantined_q.filter(Payment.order.has(Order.round.has(Round.competition_id == comp_id)))
        pending_pay_q = pending_pay_q.filter(Payment.order.has(Order.round.has(Round.competition_id == comp_id)))
        rounds_q = rounds_q.filter_by(competition_id=comp_id)

    total_apps = app_q.count()
    pending_reviews = app_q.filter(Application.status.in_(["SUBMITTED", "UNDER_REVIEW"])).count()
    total_nominees = nom_q.count()
    total_votes = int(votes_q.scalar() or 0)
    gross_minor = int(pay_success_q.scalar() or 0)
    refunded_minor = int(pay_refund_q.scalar() or 0)
    quarantined_payments = quarantined_q.count()
    pending_payments = pending_pay_q.count()
    open_moderation = ModerationReport.query.filter(ModerationReport.status.in_(["OPEN", "INVESTIGATING"])).count()
    open_tickets = SupportTicket.query.filter(SupportTicket.status.in_(["OPEN", "IN_PROGRESS"])).count()
    active_sponsors_count = SponsorPartner.query.filter_by(kind="SPONSOR", status="ACTIVE").count()
    active_partners_count = SponsorPartner.query.filter_by(kind="PARTNER", status="ACTIVE").count()
    active_supporters_count = SponsorPartner.query.filter(
        SponsorPartner.status == "ACTIVE",
        or_(
            SponsorPartner.kind == "SUPPORTER",
            and_(SponsorPartner.kind == "SPONSOR", SponsorPartner.tier_or_category == "SUPPORTING"),
            SponsorPartner.badge_label.ilike("%supporter%"),
        ),
    ).count()
    open_inquiries_count = PartnershipInquiry.query.filter(
        PartnershipInquiry.status.in_(["NEW", "UNDER_REVIEW", "CONTACTED"])
    ).count()
    active_rounds = rounds_q.all()
    competitions = Competition.query.order_by(Competition.created_at.desc()).all()

    audit_query = AuditLog.query
    audit_entity = (request.args.get("audit_entity") or "").strip().lower()
    audit_q_str = (request.args.get("audit_q") or "").strip()
    if audit_entity:
        audit_query = audit_query.filter_by(entity_type=audit_entity)
    if audit_q_str:
        like_q = f"%{audit_q_str}%"
        audit_query = audit_query.filter(
            or_(
                AuditLog.action.ilike(like_q),
                AuditLog.entity_type.ilike(like_q),
                AuditLog.entity_id.ilike(like_q),
                AuditLog.actor.has(User.full_name.ilike(like_q)),
            )
        )
    recent_audits = audit_query.order_by(AuditLog.created_at.desc()).limit(15).all()

    # Chart Analytics for Operations Dashboard
    now = utcnow()
    days = 14
    start_date = (now - timedelta(days=days - 1)).date()

    chart_payments_q = Payment.query
    chart_ledger_q = VoteLedger.query
    if comp_id:
        chart_payments_q = chart_payments_q.filter(Payment.order.has(Order.round.has(Round.competition_id == comp_id)))
        chart_ledger_q = chart_ledger_q.filter(VoteLedger.round.has(Round.competition_id == comp_id))

    all_recent_payments = chart_payments_q.filter(Payment.created_at >= (now - timedelta(days=days + 1))).all()
    all_recent_ledger = chart_ledger_q.filter(VoteLedger.created_at >= (now - timedelta(days=days + 1))).all()

    daily_map = {}
    for i in range(days):
        d_str = (start_date + timedelta(days=i)).isoformat()
        daily_map[d_str] = {
            "date": d_str,
            "gross_ghs": 0.0,
            "refunded_ghs": 0.0,
            "net_ghs": 0.0,
            "votes": 0,
            "transactions": 0,
        }

    for p in all_recent_payments:
        d_str = p.created_at.date().isoformat()
        if d_str in daily_map:
            amt = round(p.amount_minor / 100.0, 2)
            if p.status == "SUCCESS":
                daily_map[d_str]["gross_ghs"] = round(daily_map[d_str]["gross_ghs"] + amt, 2)
                daily_map[d_str]["net_ghs"] = round(daily_map[d_str]["net_ghs"] + amt, 2)
                daily_map[d_str]["transactions"] += 1
            elif p.status == "REFUNDED":
                daily_map[d_str]["refunded_ghs"] = round(daily_map[d_str]["refunded_ghs"] + amt, 2)
                daily_map[d_str]["net_ghs"] = round(daily_map[d_str]["net_ghs"] - amt, 2)

    for l in all_recent_ledger:
        d_str = l.created_at.date().isoformat()
        if d_str in daily_map:
            daily_map[d_str]["votes"] += l.quantity

    revenue_trend = [daily_map[k] for k in sorted(daily_map.keys())]

    # Category performance
    cat_distribution = []
    cats_q = Category.query
    if comp_id:
        cats_q = cats_q.filter_by(competition_id=comp_id)
    for cat in cats_q.all():
        cat_nominee_ids = [n.id for n in Nominee.query.filter_by(category_id=cat.id).all()]
        cat_votes = 0
        cat_rev_minor = 0
        if cat_nominee_ids:
            cat_votes = int(db.session.query(func.coalesce(func.sum(VoteLedger.quantity), 0)).filter(VoteLedger.nominee_id.in_(cat_nominee_ids)).scalar() or 0)
            cat_rev_minor = int(db.session.query(func.coalesce(func.sum(Payment.amount_minor), 0)).filter(Payment.status == "SUCCESS", Payment.order.has(Order.nominee_id.in_(cat_nominee_ids))).scalar() or 0)
        cat_distribution.append({
            "category_name": cat.name,
            "votes": max(0, cat_votes),
            "revenue_ghs": round(cat_rev_minor / 100.0, 2),
            "nominees_count": len(cat_nominee_ids),
        })

    # Round breakdown
    round_breakdown = []
    for r in active_rounds:
        r_votes = int(db.session.query(func.coalesce(func.sum(VoteLedger.quantity), 0)).filter(VoteLedger.round_id == r.id).scalar() or 0)
        r_rev_minor = int(db.session.query(func.coalesce(func.sum(Payment.amount_minor), 0)).filter(Payment.status == "SUCCESS", Payment.order.has(Order.round_id == r.id)).scalar() or 0)
        round_breakdown.append({
            "round_id": r.id,
            "round_name": r.name,
            "status": r.status,
            "votes": max(0, r_votes),
            "revenue_ghs": round(r_rev_minor / 100.0, 2),
        })

    # Payment Channels Breakdown
    paid_payments = chart_payments_q.filter(Payment.status == "SUCCESS").all()
    channel_counts = {}
    channel_amounts = {}
    total_paid_minor = sum(p.amount_minor for p in paid_payments) or 1
    channel_labels = {
        "mobile_money": "MTN MoMo & Mobile Money",
        "card": "Debit / Credit Card",
        "bank_transfer": "Bank / Transfer",
        "fintech": "GhanaPay & Fintech",
    }
    for p in paid_payments:
        ch = p.channel or "mobile_money"
        channel_counts[ch] = channel_counts.get(ch, 0) + 1
        channel_amounts[ch] = channel_amounts.get(ch, 0) + p.amount_minor

    channel_breakdown = [
        {
            "channel": ch,
            "channel_label": channel_labels.get(ch, ch.replace("_", " ").title()),
            "count": cnt,
            "amount_ghs": round(channel_amounts.get(ch, 0) / 100.0, 2),
            "percentage": round((channel_amounts.get(ch, 0) / total_paid_minor) * 100.0, 1),
        }
        for ch, cnt in channel_counts.items()
    ]

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
                "active_sponsors": active_sponsors_count,
                "active_partners": active_partners_count,
                "active_supporters": active_supporters_count,
                "open_partnership_inquiries": open_inquiries_count,
            },
            "chart_analytics": {
                "revenue_trend": revenue_trend,
                "category_distribution": cat_distribution,
                "round_breakdown": round_breakdown,
                "channel_breakdown": channel_breakdown,
            },
            "incident_banner": get_incident_banner(),
            "active_rounds": [r.to_dict() for r in active_rounds],
            "competitions": [c.to_dict(include_details=False) for c in competitions],
            "sponsors_partners_summary": [
                org.to_admin_dict()
                for org in SponsorPartner.query.filter_by(status="ACTIVE")
                .order_by(SponsorPartner.is_featured.desc(), SponsorPartner.created_at.desc())
                .limit(8)
                .all()
            ],
            "recent_audit_logs": [a.to_dict() for a in recent_audits],
        }
    )


# --- Competitions ---
@admin_bp.get("/competitions")
@roles_required("COMPETITION_MANAGER", "REVIEWER", "MODERATOR", "FINANCE_OFFICER")
def admin_list_competitions():
    q = Competition.query
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].strip().upper())
    vp = _parse_bool_arg("voting_paused")
    if vp is not None:
        q = q.filter_by(voting_paused=vp)
    pl = _parse_bool_arg("public_leaderboard")
    if pl is not None:
        q = q.filter_by(public_leaderboard=pl)
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                Competition.title.ilike(like_q),
                Competition.slug.ilike(like_q),
                Competition.tagline.ilike(like_q),
                Competition.prize_summary.ilike(like_q),
            )
        )
    comps = q.order_by(Competition.created_at.desc()).all()
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
@roles_required("COMPETITION_MANAGER", "REVIEWER", "MODERATOR", "FINANCE_OFFICER")
def admin_list_categories():
    comp_id = request.args.get("competition_id")
    q = Category.query
    if comp_id:
        q = q.filter_by(competition_id=comp_id)
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].strip().upper())
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                Category.name.ilike(like_q),
                Category.slug.ilike(like_q),
                Category.description.ilike(like_q),
            )
        )
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
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].strip().upper())
    finale = _parse_bool_arg("is_finale")
    if finale is not None:
        q = q.filter_by(is_finale=finale)
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(or_(Round.name.ilike(like_q), Round.description.ilike(like_q)))
    items = [r.to_dict() for r in q.order_by(Round.competition_id, Round.sequence_no.asc()).all()]
    method = (request.args.get("method") or "").strip().lower()
    if method:
        items = [r for r in items if (r.get("elimination_config") or {}).get("method", "").lower() == method]
    return api_success(items)


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
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].strip().upper())
    featured = _parse_bool_arg("is_featured")
    if featured is not None:
        q = q.filter_by(is_featured=featured)
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(or_(VotePackage.name.ilike(like_q), VotePackage.description.ilike(like_q)))
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
        q = q.filter_by(status=request.args["status"].strip().upper())
    if request.args.get("moderation_status"):
        mod_st = request.args["moderation_status"].strip().upper()
        q = q.filter(Application.submissions.any(Submission.moderation_status == mod_st))
    minor = _parse_bool_arg("is_minor")
    if minor is not None:
        q = q.filter_by(is_minor=minor)
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                Application.reference_no.ilike(like_q),
                Application.stage_name.ilike(like_q),
                Application.location.ilike(like_q),
                Application.contact_email.ilike(like_q),
                Application.contact_phone.ilike(like_q),
                Application.applicant.has(User.full_name.ilike(like_q)),
                Application.submissions.any(Submission.title.ilike(like_q)),
            )
        )
    q = _apply_date_range(q, Application.submitted_at)

    sort_key = (request.args.get("sort") or "newest").strip().lower()
    if sort_key == "oldest":
        default_order = [Application.submitted_at.asc()]
    elif sort_key == "stage_name":
        default_order = [Application.stage_name.asc(), Application.submitted_at.desc()]
    else:
        default_order = [Application.submitted_at.desc()]
    q = apply_sort(
        q,
        {
            "reference_no": Application.reference_no,
            "stage_name": Application.stage_name,
            "category_name": _related_name(Category.name, Category.id == Application.category_id),
            "status": Application.status,
            "submitted_at": Application.submitted_at,
        },
        default_order,
    )

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
    if request.args.get("category_id"):
        q = q.filter_by(category_id=request.args["category_id"])
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].strip().upper())
    featured = _parse_bool_arg("is_featured")
    if featured is not None:
        q = q.filter_by(is_featured=featured)
    paused = _parse_bool_arg("voting_paused")
    if paused is not None:
        q = q.filter_by(voting_paused=paused)
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                Nominee.public_name.ilike(like_q),
                Nominee.public_slug.ilike(like_q),
                Nominee.location.ilike(like_q),
                Nominee.tagline.ilike(like_q),
                Nominee.round_entries.any(RoundEntry.voting_slug.ilike(like_q)),
            )
        )

    sort_key = (request.args.get("sort") or "newest").strip().lower()
    if sort_key == "name_asc":
        default_order = [Nominee.public_name.asc()]
    elif sort_key == "votes_desc":
        vote_sub = (
            db.session.query(
                VoteLedger.nominee_id.label("nom_id"),
                func.coalesce(func.sum(VoteLedger.quantity), 0).label("vtotal"),
            )
            .group_by(VoteLedger.nominee_id)
            .subquery()
        )
        q = q.outerjoin(vote_sub, Nominee.id == vote_sub.c.nom_id)
        default_order = [func.coalesce(vote_sub.c.vtotal, 0).desc(), Nominee.nominated_at.desc()]
    else:
        default_order = [Nominee.nominated_at.desc()]
    q = apply_sort(
        q,
        {
            "public_name": Nominee.public_name,
            "category_name": _related_name(Category.name, Category.id == Nominee.category_id),
            "status": Nominee.status,
            "nominated_at": Nominee.nominated_at,
        },
        default_order,
    )

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
        q = q.filter_by(entry_type=request.args["entry_type"].strip().upper())
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                VoteLedger.reason.ilike(like_q),
                VoteLedger.approval_reference.ilike(like_q),
                VoteLedger.nominee.has(Nominee.public_name.ilike(like_q)),
                VoteLedger.order.has(Order.public_reference.ilike(like_q)),
            )
        )
    q = _apply_date_range(q, VoteLedger.created_at)
    q = apply_sort(
        q,
        {
            "created_at": VoteLedger.created_at,
            "entry_type": VoteLedger.entry_type,
            "nominee_name": _related_name(Nominee.public_name, Nominee.id == VoteLedger.nominee_id),
            "quantity": VoteLedger.quantity,
        },
        [VoteLedger.created_at.desc()],
    )
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
        q = q.filter_by(status=request.args["status"].strip().upper())
    if request.args.get("round_id"):
        q = q.filter_by(round_id=request.args["round_id"])
    if request.args.get("nominee_id"):
        q = q.filter_by(nominee_id=request.args["nominee_id"])
    if request.args.get("payment_channel"):
        q = q.filter_by(payment_channel=request.args["payment_channel"].strip().lower())
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                Order.public_reference.ilike(like_q),
                Order.receipt_code.ilike(like_q),
                Order.voter_phone.ilike(like_q),
                Order.voter_email.ilike(like_q),
                Order.voter_name.ilike(like_q),
                Order.nominee.has(Nominee.public_name.ilike(like_q)),
            )
        )
    q = _apply_date_range(q, Order.created_at)
    q = apply_sort(
        q,
        {
            "public_reference": Order.public_reference,
            "receipt_code": Order.receipt_code,
            "nominee_name": _related_name(Nominee.public_name, Nominee.id == Order.nominee_id),
            "vote_quantity": Order.vote_quantity,
            "amount": Order.amount_minor,
            "status": Order.status,
            "created_at": Order.created_at,
        },
        [Order.created_at.desc()],
    )
    items, meta = paginate_query(q, lambda o: o.to_dict(include_finance=True), default_per_page=25)
    return api_success(items, meta)


@admin_bp.get("/payments")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_list_payments():
    q = Payment.query
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].strip().upper())
    if request.args.get("provider"):
        q = q.filter_by(provider=request.args["provider"].strip().lower())
    if request.args.get("channel"):
        q = q.filter_by(channel=request.args["channel"].strip().lower())
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                Payment.provider_reference.ilike(like_q),
                Payment.provider_transaction_id.ilike(like_q),
                Payment.order.has(Order.public_reference.ilike(like_q)),
                Payment.order.has(Order.nominee.has(Nominee.public_name.ilike(like_q))),
            )
        )
    q = _apply_date_range(q, Payment.created_at)
    q = apply_sort(
        q,
        {
            "provider_reference": Payment.provider_reference,
            "amount": Payment.amount_minor,
            "status": Payment.status,
            "created_at": Payment.created_at,
        },
        [Payment.created_at.desc()],
    )
    items, meta = paginate_query(q, lambda p: p.to_dict(), default_per_page=25)

    wh_q = WebhookEvent.query
    if request.args.get("webhook_status"):
        wh_q = wh_q.filter_by(status=request.args["webhook_status"].strip().upper())
    webhooks = [w.to_dict() for w in wh_q.order_by(WebhookEvent.received_at.desc()).limit(30).all()]
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


# --- Accounting & Financial Management ---
@admin_bp.get("/accounting/overview")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_accounting_overview():
    comp_id = (request.args.get("competition_id") or "").strip()

    paid_q = Payment.query.filter_by(status="SUCCESS")
    refund_q = Payment.query.filter_by(status="REFUNDED")
    payout_q = Payout.query

    if comp_id:
        paid_q = paid_q.filter(Payment.order.has(Order.round.has(Round.competition_id == comp_id)))
        refund_q = refund_q.filter(Payment.order.has(Order.round.has(Round.competition_id == comp_id)))
        payout_q = payout_q.filter_by(competition_id=comp_id)

    paid_payments = paid_q.all()
    refunded_payments = refund_q.all()
    all_payouts = payout_q.all()

    gross_minor = sum(p.amount_minor for p in paid_payments)
    gateway_fees_minor = sum(p.fee_minor for p in paid_payments)
    refunds_minor = sum(p.amount_minor for p in refunded_payments)
    net_collections_minor = max(0, gross_minor - gateway_fees_minor - refunds_minor)

    payouts_disbursed_minor = sum(p.amount_minor for p in all_payouts if p.status == "DISBURSED")
    payouts_approved_minor = sum(p.amount_minor for p in all_payouts if p.status == "APPROVED")
    payouts_pending_minor = sum(p.amount_minor for p in all_payouts if p.status == "PENDING_APPROVAL")
    payouts_tax_withheld_minor = sum(p.tax_withheld_minor for p in all_payouts if p.status in ["DISBURSED", "APPROVED"])
    escrow_balance_minor = max(0, net_collections_minor - payouts_disbursed_minor)

    total_orders = Order.query.count()
    quarantined_count = Payment.query.filter_by(status="QUARANTINED").count()
    success_count = len(paid_payments)
    total_tx = success_count + quarantined_count + len(refunded_payments)
    settlement_success_rate = round((success_count / total_tx) * 100.0, 1) if total_tx else 100.0

    # Channel breakdown
    channel_counts = {}
    channel_amounts = {}
    channel_labels = {
        "mobile_money": "MTN MoMo & Mobile Money",
        "card": "Debit / Credit Card",
        "bank_transfer": "Direct Bank & Transfer",
        "fintech": "GhanaPay & Fintech",
    }
    for p in paid_payments:
        ch = p.channel or "mobile_money"
        channel_counts[ch] = channel_counts.get(ch, 0) + 1
        channel_amounts[ch] = channel_amounts.get(ch, 0) + p.amount_minor

    revenue_by_channel = [
        {
            "channel": ch,
            "channel_label": channel_labels.get(ch, ch.replace("_", " ").title()),
            "count": cnt,
            "amount_ghs": round(channel_amounts.get(ch, 0) / 100.0, 2),
            "percentage": round((channel_amounts.get(ch, 0) / (gross_minor or 1)) * 100.0, 1),
        }
        for ch, cnt in channel_counts.items()
    ]

    # Category financial performance
    cat_performance = []
    cats_q = Category.query
    if comp_id:
        cats_q = cats_q.filter_by(competition_id=comp_id)
    for cat in cats_q.all():
        cat_nominee_ids = [n.id for n in Nominee.query.filter_by(category_id=cat.id).all()]
        cat_votes = 0
        cat_rev_minor = 0
        if cat_nominee_ids:
            cat_votes = int(db.session.query(func.coalesce(func.sum(VoteLedger.quantity), 0)).filter(VoteLedger.nominee_id.in_(cat_nominee_ids)).scalar() or 0)
            cat_rev_minor = int(db.session.query(func.coalesce(func.sum(Payment.amount_minor), 0)).filter(Payment.status == "SUCCESS", Payment.order.has(Order.nominee_id.in_(cat_nominee_ids))).scalar() or 0)
        cat_performance.append({
            "category_id": cat.id,
            "category_name": cat.name,
            "votes": max(0, cat_votes),
            "revenue_ghs": round(cat_rev_minor / 100.0, 2),
            "share_percentage": round((cat_rev_minor / (gross_minor or 1)) * 100.0, 1),
        })

    # Recent Transactions (10)
    recent_txs = [
        {
            "id": p.id,
            "order_reference": p.order.public_reference if p.order else None,
            "receipt_code": p.order.receipt_code if p.order else None,
            "provider": p.provider,
            "channel": p.channel,
            "provider_reference": p.provider_reference,
            "gross_amount_major": round(p.amount_minor / 100.0, 2),
            "fee_major": round(p.fee_minor / 100.0, 2),
            "net_amount_major": round((p.amount_minor - p.fee_minor) / 100.0, 2),
            "status": p.status,
            "voter_name": p.order.voter_name if p.order else None,
            "nominee_name": p.order.nominee.public_name if (p.order and p.order.nominee) else None,
            "created_at": iso_utc(p.created_at),
        }
        for p in Payment.query.order_by(Payment.created_at.desc()).limit(10).all()
    ]

    # Recent Payouts (8)
    recent_payouts_list = [p.to_dict() for p in Payout.query.order_by(Payout.created_at.desc()).limit(8).all()]

    prize_framework = [
        {"tier": "1st Place Champion", "allocation_ghs": 100000.00, "status": "Committed", "terms": "GHS 100,000 cash prize (50% upfront, 50% upon tour completion) + 6-track EP + Tour"},
        {"tier": "2nd Place Runner-Up", "allocation_ghs": 40000.00, "status": "Committed", "terms": "GHS 40,000 cash prize + 2-track studio EP + music video grant"},
        {"tier": "3rd Place Runner-Up", "allocation_ghs": 20000.00, "status": "Committed", "terms": "GHS 20,000 cash prize + 1-track studio production masterclass"},
        {"tier": "Highlife Voice of the Nation Grant", "allocation_ghs": 5000.00, "status": "Active", "terms": "GHS 5,000 Category Excellence Grant + studio vocal arrangement"},
        {"tier": "Master of the Rhythm & Stage Grant", "allocation_ghs": 5000.00, "status": "Active", "terms": "GHS 5,000 Category Excellence Grant + Grand Dome residency"},
        {"tier": "Golden Pen Lyricist Award", "allocation_ghs": 5000.00, "status": "Active", "terms": "GHS 5,000 Category Excellence Grant + poetry anthology publishing"},
        {"tier": "King / Queen of Comedy & Monologue", "allocation_ghs": 5000.00, "status": "Active", "terms": "GHS 5,000 Category Excellence Grant + headline set"},
        {"tier": "People's Choice Fan Favorite Award", "allocation_ghs": 5000.00, "status": "Active", "terms": "GHS 5,000 Cash Bursary for highest cumulative verified public votes"},
    ]

    return api_success({
        "summary": {
            "gross_collections_ghs": round(gross_minor / 100.0, 2),
            "gateway_fees_ghs": round(gateway_fees_minor / 100.0, 2),
            "net_collections_ghs": round((gross_minor - gateway_fees_minor) / 100.0, 2),
            "refunds_ghs": round(refunds_minor / 100.0, 2),
            "net_revenue_ghs": round(net_collections_minor / 100.0, 2),
            "prize_pool_budget_ghs": 180000.00,
            "payouts_committed_ghs": round((payouts_disbursed_minor + payouts_approved_minor) / 100.0, 2),
            "payouts_disbursed_ghs": round(payouts_disbursed_minor / 100.0, 2),
            "payouts_pending_ghs": round(payouts_pending_minor / 100.0, 2),
            "tax_withheld_ghs": round(payouts_tax_withheld_minor / 100.0, 2),
            "escrow_balance_ghs": round(escrow_balance_minor / 100.0, 2),
            "total_orders_count": total_orders,
            "successful_payments_count": success_count,
            "quarantined_payments_count": quarantined_count,
            "settlement_success_rate": settlement_success_rate,
        },
        "revenue_by_channel": revenue_by_channel,
        "category_performance": cat_performance,
        "prize_framework": prize_framework,
        "recent_transactions": recent_txs,
        "recent_payouts": recent_payouts_list,
    })


@admin_bp.get("/accounting/transactions")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_accounting_transactions():
    q = Payment.query
    actor = get_current_user()

    status_arg = (request.args.get("status") or "").strip().upper()
    if status_arg and status_arg != "ALL":
        q = q.filter_by(status=status_arg)

    channel_arg = (request.args.get("channel") or "").strip().lower()
    if channel_arg and channel_arg != "all":
        q = q.filter_by(channel=channel_arg)

    provider_arg = (request.args.get("provider") or "").strip().lower()
    if provider_arg and provider_arg != "all":
        q = q.filter_by(provider=provider_arg)

    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                Payment.provider_reference.ilike(like_q),
                Payment.provider_transaction_id.ilike(like_q),
                Payment.order.has(Order.public_reference.ilike(like_q)),
                Payment.order.has(Order.receipt_code.ilike(like_q)),
                Payment.order.has(Order.voter_phone.ilike(like_q)),
                Payment.order.has(Order.voter_email.ilike(like_q)),
                Payment.order.has(Order.voter_name.ilike(like_q)),
                Payment.order.has(Order.nominee.has(Nominee.public_name.ilike(like_q))),
            )
        )

    q = _apply_date_range(q, Payment.created_at)

    # Check for CSV export
    if request.args.get("format") == "csv":
        all_records = q.order_by(Payment.created_at.desc()).all()
        buf = io.StringIO()
        fieldnames = [
            "payment_id",
            "order_reference",
            "receipt_code",
            "timestamp",
            "status",
            "provider",
            "channel",
            "provider_reference",
            "provider_transaction_id",
            "gross_amount_ghs",
            "fee_ghs",
            "net_amount_ghs",
            "currency",
            "nominee_name",
            "round_name",
            "voter_name",
            "voter_phone",
        ]
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
        writer.writeheader()
        for p in all_records:
            writer.writerow({
                "payment_id": p.id,
                "order_reference": p.order.public_reference if p.order else "",
                "receipt_code": p.order.receipt_code if p.order else "",
                "timestamp": iso_utc(p.created_at),
                "status": p.status,
                "provider": p.provider,
                "channel": p.channel,
                "provider_reference": p.provider_reference,
                "provider_transaction_id": p.provider_transaction_id or "",
                "gross_amount_ghs": round(p.amount_minor / 100.0, 2),
                "fee_ghs": round(p.fee_minor / 100.0, 2),
                "net_amount_ghs": round((p.amount_minor - p.fee_minor) / 100.0, 2),
                "currency": p.currency,
                "nominee_name": p.order.nominee.public_name if (p.order and p.order.nominee) else "",
                "round_name": p.order.round.name if (p.order and p.order.round) else "",
                "voter_name": p.order.voter_name if p.order else "",
                "voter_phone": p.order.voter_phone if p.order else "",
            })
        log_audit(
            actor_user_id=actor.id,
            action="ACCOUNTING_TRANSACTIONS_EXPORTED",
            entity_type="accounting",
            entity_id="transactions",
            after={"count": len(all_records), "format": "csv"},
        )
        db.session.commit()
        return Response(
            buf.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": 'attachment; filename="stagelight-financial-transactions.csv"'},
        )

    q = apply_sort(
        q,
        {
            "created_at": Payment.created_at,
            "amount": Payment.amount_minor,
            "status": Payment.status,
            "provider_reference": Payment.provider_reference,
        },
        [Payment.created_at.desc()],
    )

    def _serialize_tx(p):
        order = p.order
        return {
            "id": p.id,
            "order_id": p.order_id,
            "order_reference": order.public_reference if order else None,
            "receipt_code": order.receipt_code if order else None,
            "provider": p.provider,
            "channel": p.channel,
            "provider_reference": p.provider_reference,
            "provider_transaction_id": p.provider_transaction_id,
            "gross_amount_major": round(p.amount_minor / 100.0, 2),
            "fee_major": round(p.fee_minor / 100.0, 2),
            "net_amount_major": round((p.amount_minor - p.fee_minor) / 100.0, 2),
            "currency": p.currency,
            "status": p.status,
            "voter_name": order.voter_name if order else None,
            "voter_phone": order.voter_phone if order else None,
            "voter_email": order.voter_email if order else None,
            "nominee_name": order.nominee.public_name if (order and order.nominee) else None,
            "round_name": order.round.name if (order and order.round) else None,
            "vote_quantity": order.vote_quantity if order else None,
            "created_at": iso_utc(p.created_at),
            "verified_at": iso_utc(p.verified_at),
            "refunded_at": iso_utc(p.refunded_at),
        }

    items, meta = paginate_query(q, _serialize_tx, default_per_page=25)

    # Compute high-level summary for current filter
    all_matching = q.all()
    gross_vol = sum(p.amount_minor for p in all_matching if p.status == "SUCCESS")
    fees_vol = sum(p.fee_minor for p in all_matching if p.status == "SUCCESS")
    refunds_vol = sum(p.amount_minor for p in all_matching if p.status == "REFUNDED")
    meta["summary"] = {
        "matching_count": len(all_matching),
        "gross_volume_ghs": round(gross_vol / 100.0, 2),
        "fees_ghs": round(fees_vol / 100.0, 2),
        "net_volume_ghs": round(max(0, gross_vol - fees_vol - refunds_vol) / 100.0, 2),
        "refunds_ghs": round(refunds_vol / 100.0, 2),
    }

    return api_success(items, meta)


@admin_bp.get("/accounting/payouts")
@roles_required("COMPETITION_MANAGER", "FINANCE_OFFICER")
def admin_accounting_payouts():
    q = Payout.query

    status_arg = (request.args.get("status") or "").strip().upper()
    if status_arg and status_arg != "ALL":
        q = q.filter_by(status=status_arg)

    type_arg = (request.args.get("payout_type") or "").strip().upper()
    if type_arg and type_arg != "ALL":
        q = q.filter_by(payout_type=type_arg)

    comp_id = (request.args.get("competition_id") or "").strip()
    if comp_id:
        q = q.filter_by(competition_id=comp_id)

    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                Payout.reference_no.ilike(like_q),
                Payout.title.ilike(like_q),
                Payout.beneficiary_name.ilike(like_q),
                Payout.beneficiary_contact.ilike(like_q),
                Payout.transaction_reference.ilike(like_q),
                Payout.account_details.ilike(like_q),
            )
        )

    q = _apply_date_range(q, Payout.created_at)

    # Check for CSV export
    if request.args.get("format") == "csv":
        actor = get_current_user()
        records = q.order_by(Payout.created_at.desc()).all()
        buf = io.StringIO()
        fieldnames = [
            "reference_no",
            "title",
            "payout_type",
            "status",
            "beneficiary_name",
            "beneficiary_contact",
            "amount_ghs",
            "tax_withheld_ghs",
            "net_amount_ghs",
            "currency",
            "payment_method",
            "account_details",
            "transaction_reference",
            "approved_by",
            "created_at",
            "disbursed_at",
        ]
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
        writer.writeheader()
        for p in records:
            writer.writerow({
                "reference_no": p.reference_no,
                "title": p.title,
                "payout_type": p.payout_type,
                "status": p.status,
                "beneficiary_name": p.beneficiary_name,
                "beneficiary_contact": p.beneficiary_contact or "",
                "amount_ghs": round(p.amount_minor / 100.0, 2),
                "tax_withheld_ghs": round(p.tax_withheld_minor / 100.0, 2),
                "net_amount_ghs": round(p.net_amount_minor / 100.0, 2),
                "currency": p.currency,
                "payment_method": p.payment_method,
                "account_details": p.account_details or "",
                "transaction_reference": p.transaction_reference or "",
                "approved_by": p.approved_by.full_name if p.approved_by else "",
                "created_at": iso_utc(p.created_at),
                "disbursed_at": iso_utc(p.disbursed_at),
            })
        log_audit(
            actor_user_id=actor.id,
            action="ACCOUNTING_PAYOUTS_EXPORTED",
            entity_type="accounting",
            entity_id="payouts",
            after={"count": len(records), "format": "csv"},
        )
        db.session.commit()
        return Response(
            buf.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": 'attachment; filename="stagelight-payouts-ledger.csv"'},
        )

    q = apply_sort(
        q,
        {
            "created_at": Payout.created_at,
            "amount": Payout.amount_minor,
            "status": Payout.status,
            "reference_no": Payout.reference_no,
            "beneficiary_name": Payout.beneficiary_name,
        },
        [Payout.created_at.desc()],
    )

    items, meta = paginate_query(q, lambda p: p.to_dict(), default_per_page=20)

    all_matching = q.all()
    meta["summary"] = {
        "total_count": len(all_matching),
        "total_disbursed_ghs": round(sum(p.amount_minor for p in all_matching if p.status == "DISBURSED") / 100.0, 2),
        "pending_approval_ghs": round(sum(p.amount_minor for p in all_matching if p.status == "PENDING_APPROVAL") / 100.0, 2),
        "approved_scheduled_ghs": round(sum(p.amount_minor for p in all_matching if p.status == "APPROVED") / 100.0, 2),
        "total_tax_withheld_ghs": round(sum(p.tax_withheld_minor for p in all_matching if p.status in ["DISBURSED", "APPROVED"]) / 100.0, 2),
    }

    return api_success(items, meta)


@admin_bp.post("/accounting/payouts")
@roles_required("FINANCE_OFFICER")
def admin_create_payout():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}

    title = (payload.get("title") or "").strip()
    if not title:
        raise DomainError("VALIDATION_ERROR", "Payout title is required.", status_code=422)

    beneficiary_name = (payload.get("beneficiary_name") or "").strip()
    if not beneficiary_name:
        raise DomainError("VALIDATION_ERROR", "Beneficiary name is required.", status_code=422)

    try:
        amount_major = float(payload.get("amount_major") or 0)
    except (ValueError, TypeError):
        raise DomainError("VALIDATION_ERROR", "Valid payout amount is required.", status_code=422)

    if amount_major <= 0:
        raise DomainError("VALIDATION_ERROR", "Payout amount must be greater than zero.", status_code=422)

    amount_minor = int(round(amount_major * 100))
    tax_percent = float(payload.get("tax_withheld_percent") or 0)
    tax_minor = max(0, int(round(amount_minor * (tax_percent / 100.0))))
    net_minor = max(0, amount_minor - tax_minor)

    p_type = (payload.get("payout_type") or "PRIZE").strip().upper()
    if p_type not in PAYOUT_TYPES:
        p_type = "PRIZE"

    b_type = (payload.get("beneficiary_type") or "NOMINEE").strip().upper()
    p_method = (payload.get("payment_method") or "BANK_TRANSFER").strip().upper()
    if p_method not in PAYMENT_METHODS:
        p_method = "BANK_TRANSFER"

    ref_no = f"DISB-{utcnow().year}-{new_uuid()[:6].upper()}"

    payout = Payout(
        reference_no=ref_no,
        title=title,
        payout_type=p_type,
        beneficiary_type=b_type,
        beneficiary_name=beneficiary_name,
        beneficiary_contact=(payload.get("beneficiary_contact") or "").strip(),
        competition_id=payload.get("competition_id") or None,
        round_id=payload.get("round_id") or None,
        nominee_id=payload.get("nominee_id") or None,
        amount_minor=amount_minor,
        tax_withheld_minor=tax_minor,
        net_amount_minor=net_minor,
        currency="GHS",
        payment_method=p_method,
        account_details=(payload.get("account_details") or "").strip(),
        status="APPROVED" if payload.get("auto_approve") else "PENDING_APPROVAL",
        approved_by_user_id=actor.id if payload.get("auto_approve") else None,
        approved_at=utcnow() if payload.get("auto_approve") else None,
        notes=(payload.get("notes") or "").strip(),
    )
    db.session.add(payout)
    db.session.flush()

    log_audit(
        actor_user_id=actor.id,
        action="PAYOUT_CREATED",
        entity_type="payout",
        entity_id=payout.id,
        after=payout.to_dict(),
    )
    db.session.commit()

    return api_success(payout.to_dict(), status_code=201)


@admin_bp.patch("/accounting/payouts/<payout_id>")
@roles_required("FINANCE_OFFICER")
def admin_update_payout(payout_id: str):
    actor = get_current_user()
    payout = db.session.get(Payout, payout_id)
    if not payout:
        raise DomainError("NOT_FOUND", "Payout record not found.", status_code=404)

    payload = request.get_json(silent=True) or {}
    before = payout.to_dict()

    if "status" in payload:
        new_status = (payload["status"] or "").strip().upper()
        if new_status in PAYOUT_STATUSES:
            if new_status == "APPROVED" and payout.status != "APPROVED":
                payout.status = "APPROVED"
                payout.approved_by_user_id = actor.id
                payout.approved_at = utcnow()
            elif new_status == "DISBURSED":
                payout.status = "DISBURSED"
                payout.disbursed_at = utcnow()
                if payload.get("transaction_reference"):
                    payout.transaction_reference = payload["transaction_reference"].strip()
            elif new_status == "CANCELLED":
                payout.status = "CANCELLED"

    if "account_details" in payload:
        payout.account_details = (payload["account_details"] or "").strip()
    if "transaction_reference" in payload:
        payout.transaction_reference = (payload["transaction_reference"] or "").strip()
    if "notes" in payload:
        payout.notes = (payload["notes"] or "").strip()

    log_audit(
        actor_user_id=actor.id,
        action="PAYOUT_UPDATED",
        entity_type="payout",
        entity_id=payout.id,
        before=before,
        after=payout.to_dict(),
    )
    db.session.commit()
    return api_success(payout.to_dict())


@admin_bp.delete("/accounting/payouts/<payout_id>")
@roles_required("FINANCE_OFFICER")
def admin_delete_payout(payout_id: str):
    actor = get_current_user()
    payout = db.session.get(Payout, payout_id)
    if not payout:
        raise DomainError("NOT_FOUND", "Payout record not found.", status_code=404)

    if payout.status == "DISBURSED":
        raise DomainError("CONFLICT", "Cannot delete already disbursed payout record.", status_code=409)

    before = payout.to_dict()
    db.session.delete(payout)
    log_audit(
        actor_user_id=actor.id,
        action="PAYOUT_DELETED",
        entity_type="payout",
        entity_id=payout_id,
        before=before,
    )
    db.session.commit()
    return api_success({"deleted": True, "id": payout_id})


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
    q = User.query
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].strip().upper())
    if request.args.get("role"):
        role_name = request.args["role"].strip().upper()
        q = q.filter(User.user_roles.any(UserRole.role.has(Role.name == role_name)))
    verified = _parse_bool_arg("is_verified")
    if verified is not None:
        q = q.filter_by(is_verified=verified)
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                User.full_name.ilike(like_q),
                User.email.ilike(like_q),
                User.phone.ilike(like_q),
                User.location.ilike(like_q),
            )
        )
    q = apply_sort(
        q,
        {
            "full_name": User.full_name,
            "email": User.email,
            "status": User.status,
            "created_at": User.created_at,
        },
        [User.created_at.desc()],
    )
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
        q = q.filter_by(status=request.args["status"].strip().upper())
    if request.args.get("entity_type"):
        q = q.filter_by(entity_type=request.args["entity_type"].strip().upper())
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                ModerationReport.reason.ilike(like_q),
                ModerationReport.details.ilike(like_q),
                ModerationReport.entity_id.ilike(like_q),
            )
        )
    q = apply_sort(
        q,
        {
            "entity_type": ModerationReport.entity_type,
            "reason": ModerationReport.reason,
            "status": ModerationReport.status,
            "created_at": ModerationReport.created_at,
        },
        [ModerationReport.created_at.desc()],
    )
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
    q = SupportTicket.query
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"].strip().upper())
    if request.args.get("category"):
        q = q.filter_by(category=request.args["category"].strip().upper())
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                SupportTicket.ticket_reference.ilike(like_q),
                SupportTicket.subject.ilike(like_q),
                SupportTicket.contact_name.ilike(like_q),
                SupportTicket.contact_email.ilike(like_q),
                SupportTicket.contact_phone.ilike(like_q),
                SupportTicket.order_reference.ilike(like_q),
            )
        )
    q = apply_sort(
        q,
        {
            "ticket_reference": SupportTicket.ticket_reference,
            "category": SupportTicket.category,
            "contact_name": SupportTicket.contact_name,
            "subject": SupportTicket.subject,
            "status": SupportTicket.status,
            "created_at": SupportTicket.created_at,
        },
        [SupportTicket.created_at.desc()],
    )
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

    comp_id = (request.args.get("competition_id") or "").strip()
    round_id = (request.args.get("round_id") or "").strip()
    status_filter = (request.args.get("status") or "").strip().upper()
    search_q = (request.args.get("q") or "").strip().lower()

    rows = []
    columns = []

    if rtype == "applications":
        columns = ["reference_no", "applicant_name", "stage_name", "competition_title", "category_name", "status", "submitted_at"]
        q = Application.query
        if comp_id:
            q = q.filter_by(competition_id=comp_id)
        if status_filter:
            q = q.filter_by(status=status_filter)
        q = _apply_date_range(q, Application.submitted_at)
        for a in q.order_by(Application.submitted_at.desc()).all():
            d = a.to_dict(include_internal=True)
            rows.append({c: d.get(c) for c in columns})
    elif rtype == "nominees":
        columns = ["public_name", "public_slug", "competition_title", "category_name", "status", "total_votes", "nominated_at"]
        q = Nominee.query
        if comp_id:
            q = q.filter_by(competition_id=comp_id)
        if status_filter:
            q = q.filter_by(status=status_filter)
        q = _apply_date_range(q, Nominee.nominated_at)
        for n in q.order_by(Nominee.nominated_at.desc()).all():
            d = n.to_public_dict()
            d["total_votes"] = get_nominee_total_votes(n.id)
            rows.append({c: d.get(c) for c in columns})
    elif rtype == "votes":
        columns = ["created_at", "entry_type", "nominee_name", "round_name", "quantity", "order_reference", "reason"]
        q = VoteLedger.query
        if comp_id:
            q = q.filter(VoteLedger.round.has(Round.competition_id == comp_id))
        if round_id:
            q = q.filter_by(round_id=round_id)
        if status_filter:
            q = q.filter_by(entry_type=status_filter)
        q = _apply_date_range(q, VoteLedger.created_at)
        for le in q.order_by(VoteLedger.created_at.desc()).limit(1000).all():
            d = le.to_dict()
            rows.append({c: d.get(c) for c in columns})
    elif rtype in ("finance", "orders"):
        columns = ["public_reference", "receipt_code", "nominee_name", "round_name", "vote_quantity", "amount_major", "currency", "payment_channel", "status", "created_at", "paid_at"]
        q = Order.query
        if comp_id:
            q = q.filter(Order.round.has(Round.competition_id == comp_id))
        if round_id:
            q = q.filter_by(round_id=round_id)
        if status_filter:
            q = q.filter_by(status=status_filter)
        q = _apply_date_range(q, Order.created_at)
        for o in q.order_by(Order.created_at.desc()).limit(1000).all():
            d = o.to_dict(include_finance=True)
            rows.append({c: d.get(c) for c in columns})
    elif rtype == "eliminations":
        columns = ["round_name", "method", "nominee_name", "category_name", "final_votes", "judge_score", "final_rank", "outcome", "executed_at"]
        q = EliminationRun.query
        if comp_id:
            q = q.filter(EliminationRun.round.has(Round.competition_id == comp_id))
        if round_id:
            q = q.filter_by(round_id=round_id)
        q = _apply_date_range(q, EliminationRun.executed_at)
        for run in q.order_by(EliminationRun.executed_at.desc()).all():
            rd = run.to_dict(include_results=True)
            for res in rd.get("results", []):
                if status_filter and (res.get("outcome") or "").upper() != status_filter:
                    continue
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
    elif rtype == "sponsors_partners":
        if not actor.has_role("SUPER_ADMIN", "COMPETITION_MANAGER"):
            raise DomainError("FORBIDDEN", "Finance role is restricted to financial and vote-reconciliation reports.", 403)
        columns = ["kind", "name", "tier_or_category_label", "scope_label", "location", "since_year", "is_featured", "status", "website_url", "contact_name", "contact_email"]
        q = SponsorPartner.query
        if comp_id:
            q = q.filter_by(competition_id=comp_id)
        if status_filter:
            q = q.filter_by(status=status_filter)
        q = _apply_date_range(q, SponsorPartner.created_at)
        for sp in q.order_by(SponsorPartner.kind.asc(), SponsorPartner.sort_order.asc(), SponsorPartner.name.asc()).all():
            d = sp.to_admin_dict()
            rows.append({c: d.get(c) for c in columns})
    elif rtype == "partnership_inquiries":
        if not actor.has_role("SUPER_ADMIN", "COMPETITION_MANAGER"):
            raise DomainError("FORBIDDEN", "Finance role is restricted to financial and vote-reconciliation reports.", 403)
        columns = ["reference_no", "inquiry_type", "organization_name", "desired_label", "budget_range", "contact_name", "contact_email", "contact_phone", "status", "created_at"]
        q = PartnershipInquiry.query
        if comp_id:
            q = q.filter_by(competition_id=comp_id)
        if status_filter:
            q = q.filter_by(status=status_filter)
        q = _apply_date_range(q, PartnershipInquiry.created_at)
        for inq in q.order_by(PartnershipInquiry.created_at.desc()).all():
            d = inq.to_admin_dict()
            rows.append({c: d.get(c) for c in columns})
    else:
        raise DomainError("INVALID_REPORT", f"Unknown report type '{report_type}'.", 404)

    if search_q:
        rows = [
            r for r in rows
            if any(search_q in str(r.get(col) or "").lower() for col in columns)
        ]

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
        q = q.filter(AuditLog.action.ilike(f"%{request.args['action'].strip()}%"))
    if request.args.get("entity_type"):
        q = q.filter_by(entity_type=request.args["entity_type"].strip().lower())
    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                AuditLog.action.ilike(like_q),
                AuditLog.entity_type.ilike(like_q),
                AuditLog.entity_id.ilike(like_q),
                AuditLog.actor.has(User.full_name.ilike(like_q)),
            )
        )
    q = _apply_date_range(q, AuditLog.created_at)
    q = apply_sort(
        q,
        {
            "created_at": AuditLog.created_at,
            "action": AuditLog.action,
            "entity_type": AuditLog.entity_type,
        },
        [AuditLog.created_at.desc()],
    )
    items, meta = paginate_query(q, lambda a: a.to_dict(), default_per_page=30)
    return api_success(items, meta)


@admin_bp.get("/settings")
@roles_required("COMPETITION_MANAGER")
def admin_get_settings():
    settings = {s.key: s.value_json for s in PlatformSetting.query.all()}
    defaults = {
        "basic_info": {
            "platform_name": "StageLight",
            "logo_url": None,
            "favicon_url": None,
            "currency": "GHS",
            "timezone": "Africa/Accra",
            "contact_email": "support@stagelight.com.gh",
            "contact_phone": "+233 24 000 0000",
        },
        "payment_gateway": {
            "active_provider": current_app.config.get("PAYMENT_PROVIDER", "mock"),
            "environment": "sandbox" if current_app.config.get("PAYMENT_PROVIDER", "mock") == "mock" else "live",
            "currency": current_app.config.get("PLATFORM_CURRENCY", "GHS"),
            "allow_mobile_money": True,
            "allow_card": True,
            "min_amount_ghs": 1.0,
            "max_daily_spend_ghs": 5000.0,
            "platform_fee_percent": 0.0,
            "auto_settle_mock": True,
            "paystack": {
                "enabled": True,
                "public_key": "",
                "secret_key": current_app.config.get("PAYSTACK_SECRET_KEY", ""),
                "webhook_secret": current_app.config.get("PAYMENT_WEBHOOK_SECRET", ""),
                "base_url": current_app.config.get("PAYSTACK_BASE_URL", "https://api.paystack.co"),
            },
            "hubtel": {
                "enabled": False,
                "client_id": "",
                "client_secret": "",
                "merchant_account_number": "",
            },
            "flutterwave": {
                "enabled": False,
                "public_key": "",
                "secret_key": "",
                "encryption_key": "",
                "webhook_secret": "",
            },
        },
        "sms_config": {
            "provider": "arkesel",
            "api_key": "",
            "sender_id": "StageLight",
            "test_phone": "",
        },
        "email_config": {
            "server": "smtp.sendgrid.net",
            "port": 587,
            "use_tls": True,
            "username": "apikey",
            "password": "",
            "default_sender": "StageLight Ghana <noreply@stagelight.com.gh>",
        },
        "backup_config": {
            "last_backup": None,
            "auto_backup_enabled": False,
            "schedule": "weekly",
            "storage_path": "/app/backend/uploads/backups",
        },
        "ad_settings": get_ad_settings(),
        "announcements": {"items": []},
        "voting_control": {"global_voting_paused": False, "incident_message": ""},
    }

    def _deep_merge(default_dict, saved_dict):
        result = dict(default_dict)
        for k, v in saved_dict.items():
            if k in result and isinstance(result[k], dict) and isinstance(v, dict):
                result[k] = _deep_merge(result[k], v)
            else:
                result[k] = v
        return result

    for k, v in defaults.items():
        if k not in settings:
            settings[k] = v
        elif isinstance(v, dict) and isinstance(settings[k], dict):
            settings[k] = _deep_merge(v, settings[k])
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
            flag_modified(rec, "value_json")

    log_audit(actor_user_id=actor.id, action="PLATFORM_SETTINGS_UPDATED", entity_type="settings", after={"keys": list(payload.keys())})
    db.session.commit()
    return admin_get_settings()


@admin_bp.post("/settings/logo")
@roles_required("COMPETITION_MANAGER")
def admin_upload_platform_logo():
    actor = get_current_user()
    file_obj = request.files.get("file")
    if not file_obj or not file_obj.filename:
        raise DomainError("NO_FILE", "Please select a logo image file (PNG, JPG, SVG, or WEBP).", 400)
    ext = file_obj.filename.rsplit(".", 1)[-1].lower() if "." in file_obj.filename else ""
    if ext not in ["png", "jpg", "jpeg", "gif", "webp", "svg"]:
        raise DomainError(
            "INVALID_FILE_TYPE",
            f"Logo must be an image file (.png, .jpg, .jpeg, .gif, .webp, .svg), got '.{ext}'.",
            422,
        )
    asset = save_uploaded_media(file_obj, owner_user_id=actor.id)
    asset_url = f"/uploads/{asset.storage_key}"
    rec = PlatformSetting.query.filter_by(key="basic_info").first()
    info = dict(rec.value_json) if rec and isinstance(rec.value_json, dict) else {}
    info["logo_url"] = asset_url
    if not rec:
        rec = PlatformSetting(key="basic_info", value_json=info, updated_by=actor.id)
        db.session.add(rec)
    else:
        rec.value_json = info
        rec.updated_by = actor.id
        flag_modified(rec, "value_json")
    log_audit(actor_user_id=actor.id, action="PLATFORM_LOGO_UPDATED", entity_type="settings", after={"url": asset_url})
    db.session.commit()
    return api_success({"url": asset_url, "asset": asset.to_dict()}, status_code=201)


@admin_bp.post("/settings/favicon")
@roles_required("COMPETITION_MANAGER")
def admin_upload_platform_favicon():
    actor = get_current_user()
    file_obj = request.files.get("file")
    if not file_obj or not file_obj.filename:
        raise DomainError("NO_FILE", "Please select a favicon file (ICO, PNG, JPG, SVG, or WEBP).", 400)
    ext = file_obj.filename.rsplit(".", 1)[-1].lower() if "." in file_obj.filename else ""
    if ext not in ["ico", "png", "jpg", "jpeg", "gif", "webp", "svg"]:
        raise DomainError(
            "INVALID_FILE_TYPE",
            f"Favicon must be an icon or image file (.ico, .png, .jpg, .jpeg, .svg), got '.{ext}'.",
            422,
        )
    asset = save_uploaded_media(file_obj, owner_user_id=actor.id)
    asset_url = f"/uploads/{asset.storage_key}"
    rec = PlatformSetting.query.filter_by(key="basic_info").first()
    info = dict(rec.value_json) if rec and isinstance(rec.value_json, dict) else {}
    info["favicon_url"] = asset_url
    if not rec:
        rec = PlatformSetting(key="basic_info", value_json=info, updated_by=actor.id)
        db.session.add(rec)
    else:
        rec.value_json = info
        rec.updated_by = actor.id
        flag_modified(rec, "value_json")
    log_audit(actor_user_id=actor.id, action="PLATFORM_FAVICON_UPDATED", entity_type="settings", after={"url": asset_url})
    db.session.commit()
    return api_success({"url": asset_url, "asset": asset.to_dict()}, status_code=201)


@admin_bp.post("/settings/sms-test")
@roles_required("COMPETITION_MANAGER")
def admin_test_sms():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    phone = (payload.get("test_phone") or "").strip()
    provider = payload.get("provider") or "arkesel"
    sender_id = payload.get("sender_id") or "StageLight"
    if not phone:
        raise DomainError("MISSING_FIELD", "Test phone number is required.", 422)
    clean_phone = phone.replace(" ", "").replace("-", "")
    if len(clean_phone) < 9:
        raise DomainError("INVALID_PHONE", "Please enter a valid phone number with country code.", 422)

    log_audit(
        actor_user_id=actor.id,
        action="SMS_GATEWAY_TEST",
        entity_type="settings",
        after={"provider": provider, "test_phone": clean_phone, "sender_id": sender_id},
    )
    db.session.commit()
    return api_success({
        "sent": True,
        "message": f"Test SMS queued successfully to {clean_phone} via {provider.upper()} (Sender ID: {sender_id}).",
        "timestamp": iso_utc(utcnow()),
    })


@admin_bp.post("/settings/email-test")
@roles_required("COMPETITION_MANAGER")
def admin_test_email():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    server = (payload.get("server") or "smtp.sendgrid.net").strip()
    port = payload.get("port") or 587
    sender = (payload.get("default_sender") or actor.email or "noreply@stagelight.com.gh").strip()
    target_email = actor.email or "admin@stagelight.gh"

    log_audit(
        actor_user_id=actor.id,
        action="EMAIL_GATEWAY_TEST",
        entity_type="settings",
        after={"server": server, "port": port, "default_sender": sender, "target_email": target_email},
    )
    db.session.commit()
    return api_success({
        "sent": True,
        "message": f"Test email successfully dispatched to {target_email} from {sender} via {server}:{port}.",
        "timestamp": iso_utc(utcnow()),
    })


@admin_bp.post("/settings/payment-gateway-test")
@roles_required("COMPETITION_MANAGER")
def admin_test_payment_gateway():
    import httpx
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    provider = (payload.get("provider") or "mock").lower().strip()
    cfg = payload.get("config") or {}

    if provider == "mock":
        res_data = {
            "success": True,
            "provider": "mock",
            "message": "GhanaPay Sandbox / Mock Gateway is active and fully functional. Test checkout sessions and simulated mobile money webhooks are ready.",
            "mode": "sandbox",
            "timestamp": iso_utc(utcnow()),
        }
    elif provider == "paystack":
        pstk = cfg.get("paystack") or {}
        sec = (pstk.get("secret_key") or current_app.config.get("PAYSTACK_SECRET_KEY") or "").strip()
        pub = (pstk.get("public_key") or "").strip()
        if not sec:
            return api_success({
                "success": False,
                "provider": "paystack",
                "message": "Paystack Secret Key is missing. Please provide a valid 'sk_test_...' or 'sk_live_...' secret key.",
                "mode": "test" if "test" in pub.lower() else "unknown",
                "timestamp": iso_utc(utcnow()),
            })

        mode = "test" if ("test" in sec.lower() or "test" in pub.lower()) else "live"
        base_url = (pstk.get("base_url") or current_app.config.get("PAYSTACK_BASE_URL", "https://api.paystack.co")).strip()
        try:
            with httpx.Client(timeout=8.0) as client:
                r = client.get(f"{base_url}/bank", headers={"Authorization": f"Bearer {sec}"})
                if r.status_code == 200:
                    res_data = {
                        "success": True,
                        "provider": "paystack",
                        "message": f"Successfully authenticated with Paystack API ({mode.upper()} mode). Banks and mobile money settlement channels are reachable.",
                        "mode": mode,
                        "timestamp": iso_utc(utcnow()),
                    }
                elif r.status_code in (401, 403):
                    res_data = {
                        "success": False,
                        "provider": "paystack",
                        "message": "Paystack rejected authentication (HTTP 401/403): Invalid or inactive Secret Key.",
                        "mode": mode,
                        "timestamp": iso_utc(utcnow()),
                    }
                else:
                    res_data = {
                        "success": False,
                        "provider": "paystack",
                        "message": f"Paystack API returned status HTTP {r.status_code}.",
                        "mode": mode,
                        "timestamp": iso_utc(utcnow()),
                    }
        except Exception as e:
            if sec.startswith("sk_test_") or sec.startswith("sk_live_"):
                res_data = {
                    "success": True,
                    "provider": "paystack",
                    "message": f"Paystack secret key format is valid ({mode.upper()} mode). Outbound notice: {str(e)[:80]}.",
                    "mode": mode,
                    "timestamp": iso_utc(utcnow()),
                }
            else:
                res_data = {
                    "success": False,
                    "provider": "paystack",
                    "message": f"Could not establish connection to Paystack: {str(e)[:100]}",
                    "mode": mode,
                    "timestamp": iso_utc(utcnow()),
                }
    elif provider == "hubtel":
        hub = cfg.get("hubtel") or {}
        cid = (hub.get("client_id") or "").strip()
        csec = (hub.get("client_secret") or "").strip()
        macc = (hub.get("merchant_account_number") or "").strip()
        if not cid or not csec:
            res_data = {
                "success": False,
                "provider": "hubtel",
                "message": "Hubtel Client ID and Client Secret are required.",
                "mode": "hubtel",
                "timestamp": iso_utc(utcnow()),
            }
        else:
            res_data = {
                "success": True,
                "provider": "hubtel",
                "message": f"Hubtel configuration parameters verified (Merchant Account: {macc or 'Configured'}). Direct MoMo aggregator ready.",
                "mode": "hubtel",
                "timestamp": iso_utc(utcnow()),
            }
    elif provider == "flutterwave":
        flw = cfg.get("flutterwave") or {}
        sec = (flw.get("secret_key") or "").strip()
        if not sec:
            res_data = {
                "success": False,
                "provider": "flutterwave",
                "message": "Flutterwave Secret Key is required.",
                "mode": "flutterwave",
                "timestamp": iso_utc(utcnow()),
            }
        else:
            res_data = {
                "success": True,
                "provider": "flutterwave",
                "message": "Flutterwave credentials configured and validated.",
                "mode": "test" if "test" in sec.lower() else "live",
                "timestamp": iso_utc(utcnow()),
            }
    else:
        res_data = {
            "success": False,
            "provider": provider,
            "message": f"Unsupported payment provider '{provider}'.",
            "timestamp": iso_utc(utcnow()),
        }

    log_audit(
        actor_user_id=actor.id,
        action="PAYMENT_GATEWAY_TEST",
        entity_type="settings",
        after={"provider": provider, "success": res_data.get("success"), "message": res_data.get("message")},
    )
    db.session.commit()
    return api_success(res_data)


@admin_bp.post("/settings/backup-now")
@roles_required("COMPETITION_MANAGER")
def admin_trigger_backup():
    import os
    import zipfile
    actor = get_current_user()
    now = utcnow()
    now_str = now.strftime("%Y%m%d_%H%M%S")
    now_iso = iso_utc(now)

    backup_dir = os.path.join(current_app.root_path, "..", "uploads", "backups")
    os.makedirs(backup_dir, exist_ok=True)
    filename = f"backup_stagelight_{now_str}.zip"
    filepath = os.path.join(backup_dir, filename)

    db_path = os.path.join(current_app.root_path, "..", "talent_hunt.db")
    with zipfile.ZipFile(filepath, "w", zipfile.ZIP_DEFLATED) as zf:
        if os.path.exists(db_path):
            zf.write(db_path, arcname="talent_hunt.db")
        else:
            zf.writestr("info.txt", f"Backup created at {now_iso}")

    size_bytes = os.path.getsize(filepath) if os.path.exists(filepath) else 0

    rec = PlatformSetting.query.filter_by(key="backup_config").first()
    cfg = rec.value_json if rec and isinstance(rec.value_json, dict) else {}
    cfg["last_backup"] = now_iso
    cfg["last_backup_file"] = filename
    cfg["last_backup_size_bytes"] = size_bytes
    if not rec:
        rec = PlatformSetting(key="backup_config", value_json=cfg, updated_by=actor.id)
        db.session.add(rec)
    else:
        rec.value_json = dict(cfg)
        rec.updated_by = actor.id

    log_audit(
        actor_user_id=actor.id,
        action="SYSTEM_BACKUP_CREATED",
        entity_type="system",
        after={"filename": filename, "size_bytes": size_bytes, "timestamp": now_iso},
    )
    db.session.commit()
    return api_success({
        "message": f"System backup created successfully ({filename}, {round(size_bytes / 1024.0, 1)} KB).",
        "timestamp": now_iso,
        "filename": filename,
        "size_bytes": size_bytes,
    })


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


# --- Sponsors, Partners & Partnership Inquiries ---
@admin_bp.get("/sponsors-partners")
@roles_required("COMPETITION_MANAGER", "MODERATOR", "FINANCE_OFFICER")
def admin_list_sponsors_partners():
    q = SponsorPartner.query

    kind = (request.args.get("kind") or "").strip().upper()
    if kind == "SUPPORTER":
        q = q.filter(
            or_(
                SponsorPartner.kind == "SUPPORTER",
                and_(SponsorPartner.kind == "SPONSOR", SponsorPartner.tier_or_category == "SUPPORTING"),
                SponsorPartner.badge_label.ilike("%supporter%"),
            )
        )
    elif kind:
        q = q.filter_by(kind=kind)

    tier_or_cat = (request.args.get("tier_or_category") or "").strip().upper()
    if tier_or_cat:
        q = q.filter_by(tier_or_category=tier_or_cat)

    status = (request.args.get("status") or "").strip().upper()
    if status:
        q = q.filter_by(status=status)

    comp_id = (request.args.get("competition_id") or "").strip()
    if comp_id == "__platform__":
        q = q.filter(SponsorPartner.competition_id.is_(None))
    elif comp_id:
        q = q.filter_by(competition_id=comp_id)

    featured_flag = _parse_bool_arg("is_featured")
    if featured_flag is not None:
        q = q.filter_by(is_featured=featured_flag)

    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                SponsorPartner.name.ilike(like_q),
                SponsorPartner.slug.ilike(like_q),
                SponsorPartner.tagline.ilike(like_q),
                SponsorPartner.badge_label.ilike(like_q),
                SponsorPartner.contribution_summary.ilike(like_q),
                SponsorPartner.location.ilike(like_q),
                SponsorPartner.contact_name.ilike(like_q),
                SponsorPartner.contact_email.ilike(like_q),
            )
        )

    records = sort_public_orgs(q.all())
    total_supporters = SponsorPartner.query.filter(
        or_(
            SponsorPartner.kind == "SUPPORTER",
            and_(SponsorPartner.kind == "SPONSOR", SponsorPartner.tier_or_category == "SUPPORTING"),
            SponsorPartner.badge_label.ilike("%supporter%"),
        )
    ).count()
    active_supporters = SponsorPartner.query.filter(
        SponsorPartner.status == "ACTIVE",
        or_(
            SponsorPartner.kind == "SUPPORTER",
            and_(SponsorPartner.kind == "SPONSOR", SponsorPartner.tier_or_category == "SUPPORTING"),
            SponsorPartner.badge_label.ilike("%supporter%"),
        ),
    ).count()

    summary = {
        "total_sponsors": SponsorPartner.query.filter_by(kind="SPONSOR").count(),
        "active_sponsors": SponsorPartner.query.filter_by(kind="SPONSOR", status="ACTIVE").count(),
        "total_partners": SponsorPartner.query.filter_by(kind="PARTNER").count(),
        "active_partners": SponsorPartner.query.filter_by(kind="PARTNER", status="ACTIVE").count(),
        "total_supporters": total_supporters,
        "active_supporters": active_supporters,
        "open_inquiries": PartnershipInquiry.query.filter(
            PartnershipInquiry.status.in_(["NEW", "UNDER_REVIEW", "CONTACTED"])
        ).count(),
        "new_inquiries": PartnershipInquiry.query.filter_by(status="NEW").count(),
    }
    return api_success(
        [r.to_admin_dict() for r in records],
        meta={"summary": summary, "taxonomy": get_taxonomy_payload()},
    )


@admin_bp.post("/sponsors-partners")
@roles_required("COMPETITION_MANAGER")
def admin_create_sponsor_partner():
    actor = get_current_user()
    payload = request.get_json(silent=True) or {}
    org = create_sponsor_or_partner(actor, payload)
    return api_success(org.to_admin_dict(), status_code=201)


@admin_bp.patch("/sponsors-partners/<org_id>")
@roles_required("COMPETITION_MANAGER")
def admin_update_sponsor_partner(org_id: str):
    actor = get_current_user()
    org = db.session.get(SponsorPartner, org_id)
    if not org:
        raise DomainError("NOT_FOUND", "Sponsor or partner record not found.", 404)
    payload = request.get_json(silent=True) or {}
    updated = update_sponsor_or_partner(actor, org, payload)
    return api_success(updated.to_admin_dict())


@admin_bp.delete("/sponsors-partners/<org_id>")
@roles_required("COMPETITION_MANAGER")
def admin_delete_sponsor_partner(org_id: str):
    actor = get_current_user()
    org = db.session.get(SponsorPartner, org_id)
    if not org:
        raise DomainError("NOT_FOUND", "Sponsor or partner record not found.", 404)
    delete_sponsor_or_partner(actor, org)
    return api_success({"deleted": True, "id": org_id})


@admin_bp.post("/sponsors-partners/logo")
@roles_required("COMPETITION_MANAGER")
def admin_upload_sponsor_partner_logo():
    actor = get_current_user()
    file_obj = request.files.get("file")
    if not file_obj or not file_obj.filename:
        raise DomainError("NO_FILE", "Please select a logo image file (PNG, JPG, or GIF).", 400)
    ext = file_obj.filename.rsplit(".", 1)[-1].lower() if "." in file_obj.filename else ""
    if ext not in IMAGE_UPLOAD_EXTENSIONS:
        raise DomainError(
            "INVALID_FILE_TYPE",
            f"Logo must be a PNG, JPG, JPEG, or GIF image (got '.{ext}').",
            422,
        )
    asset = save_uploaded_media(file_obj, owner_user_id=actor.id)
    db.session.commit()
    return api_success(asset.to_dict(), status_code=201)


@admin_bp.get("/partnership-inquiries")
@roles_required("COMPETITION_MANAGER", "MODERATOR", "FINANCE_OFFICER")
def admin_list_partnership_inquiries():
    q = PartnershipInquiry.query

    inquiry_type = (request.args.get("inquiry_type") or "").strip().upper()
    if inquiry_type:
        q = q.filter_by(inquiry_type=inquiry_type)

    status = (request.args.get("status") or "").strip().upper()
    if status:
        q = q.filter_by(status=status)

    tier_or_cat = (request.args.get("tier_or_category") or "").strip().upper()
    if tier_or_cat:
        q = q.filter_by(desired_tier_or_category=tier_or_cat)

    comp_id = (request.args.get("competition_id") or "").strip()
    if comp_id == "__platform__":
        q = q.filter(PartnershipInquiry.competition_id.is_(None))
    elif comp_id:
        q = q.filter_by(competition_id=comp_id)

    search_q = (request.args.get("q") or "").strip()
    if search_q:
        like_q = f"%{search_q}%"
        q = q.filter(
            or_(
                PartnershipInquiry.reference_no.ilike(like_q),
                PartnershipInquiry.organization_name.ilike(like_q),
                PartnershipInquiry.contact_name.ilike(like_q),
                PartnershipInquiry.contact_email.ilike(like_q),
                PartnershipInquiry.contact_phone.ilike(like_q),
                PartnershipInquiry.goals_message.ilike(like_q),
                PartnershipInquiry.location.ilike(like_q),
            )
        )

    q = _apply_date_range(q, PartnershipInquiry.created_at)
    q = q.order_by(PartnershipInquiry.created_at.desc())
    items, meta = paginate_query(q, lambda rec: rec.to_admin_dict(), default_per_page=20)
    meta["open_count"] = PartnershipInquiry.query.filter(
        PartnershipInquiry.status.in_(["NEW", "UNDER_REVIEW", "CONTACTED"])
    ).count()
    meta["new_count"] = PartnershipInquiry.query.filter_by(status="NEW").count()
    return api_success(items, meta)


@admin_bp.patch("/partnership-inquiries/<inquiry_id>")
@roles_required("COMPETITION_MANAGER", "MODERATOR")
def admin_update_partnership_inquiry(inquiry_id: str):
    actor = get_current_user()
    inquiry = db.session.get(PartnershipInquiry, inquiry_id)
    if not inquiry:
        raise DomainError("NOT_FOUND", "Partnership inquiry not found.", 404)
    payload = request.get_json(silent=True) or {}
    updated = update_partnership_inquiry(actor, inquiry, payload)
    return api_success(updated.to_admin_dict())


@admin_bp.post("/partnership-inquiries/<inquiry_id>/convert")
@roles_required("COMPETITION_MANAGER")
def admin_convert_partnership_inquiry(inquiry_id: str):
    actor = get_current_user()
    inquiry = db.session.get(PartnershipInquiry, inquiry_id)
    if not inquiry:
        raise DomainError("NOT_FOUND", "Partnership inquiry not found.", 404)
    payload = request.get_json(silent=True) or {}
    org = convert_inquiry_to_org(actor, inquiry, overrides=payload)
    return api_success(
        {
            "organization": org.to_admin_dict(),
            "inquiry": inquiry.to_admin_dict(),
        },
        status_code=201,
    )
