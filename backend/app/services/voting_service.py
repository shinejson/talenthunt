from collections import defaultdict
from sqlalchemy import func

from app.extensions import db
from app.models.competition import Competition, Round, VotePackage
from app.models.nominee import Nominee, RoundEntry
from app.models.operations import PlatformSetting
from app.models.user import User
from app.models.voting import Order, VoteLedger
from app.schemas import DomainError
from app.services.audit_service import log_audit
from app.utils.time_utils import iso_utc, utcnow


def is_global_voting_paused() -> tuple[bool, str | None]:
    setting = PlatformSetting.query.filter_by(key="voting_control").first()
    if setting and isinstance(setting.value_json, dict):
        if setting.value_json.get("global_voting_paused"):
            return True, setting.value_json.get("incident_message") or "Voting is temporarily paused for maintenance."
    return False, None


def get_incident_banner() -> dict | None:
    setting = PlatformSetting.query.filter_by(key="voting_control").first()
    if setting and isinstance(setting.value_json, dict):
        banner = setting.value_json.get("incident_message")
        paused = bool(setting.value_json.get("global_voting_paused"))
        if banner or paused:
            return {
                "global_voting_paused": paused,
                "message": banner or "Voting is temporarily paused across the platform.",
            }
    return None


def get_nominee_round_votes(nominee_id: str, round_id: str) -> int:
    total = (
        db.session.query(func.coalesce(func.sum(VoteLedger.quantity), 0))
        .filter(VoteLedger.nominee_id == nominee_id, VoteLedger.round_id == round_id)
        .scalar()
    )
    return int(total or 0)


def get_nominee_total_votes(nominee_id: str) -> int:
    total = (
        db.session.query(func.coalesce(func.sum(VoteLedger.quantity), 0))
        .filter(VoteLedger.nominee_id == nominee_id)
        .scalar()
    )
    return int(total or 0)


def get_votes_map_for_round(round_id: str) -> dict[str, int]:
    rows = (
        db.session.query(VoteLedger.nominee_id, func.coalesce(func.sum(VoteLedger.quantity), 0))
        .filter(VoteLedger.round_id == round_id)
        .group_by(VoteLedger.nominee_id)
        .all()
    )
    return {nid: int(qty or 0) for nid, qty in rows}


def get_earliest_vote_map_for_round(round_id: str) -> dict[str, object]:
    rows = (
        db.session.query(VoteLedger.nominee_id, func.min(VoteLedger.created_at))
        .filter(VoteLedger.round_id == round_id, VoteLedger.entry_type == "CREDIT")
        .group_by(VoteLedger.nominee_id)
        .all()
    )
    return {nid: ts for nid, ts in rows}


def compute_round_standings(round_obj: Round, exclude_disqualified: bool = True) -> list[dict]:
    entries = RoundEntry.query.filter_by(round_id=round_obj.id).all()
    votes_map = get_votes_map_for_round(round_obj.id)
    earliest_map = get_earliest_vote_map_for_round(round_obj.id)

    rows = []
    for entry in entries:
        nom = entry.nominee
        if not nom:
            continue
        is_disq = entry.status == "DISQUALIFIED" or nom.status == "DISQUALIFIED"
        if exclude_disqualified and is_disq:
            continue
        votes = votes_map.get(nom.id, 0)
        earliest = earliest_map.get(nom.id)
        rows.append(
            {
                "round_entry_id": entry.id,
                "nominee_id": nom.id,
                "public_name": nom.public_name,
                "public_slug": nom.public_slug,
                "voting_slug": entry.voting_slug,
                "category_id": nom.category_id,
                "category_name": nom.category.name if nom.category else None,
                "status": entry.status,
                "nominee_status": nom.status,
                "votes": votes,
                "judge_score": float(entry.judge_score or 0.0),
                "earliest_vote_at": earliest,
            }
        )

    cfg = round_obj.elimination_config or {}
    tie_breakers = cfg.get("tie_breakers") or ["judge_score_desc", "earliest_qualifying_vote_timestamp"]

    def sort_key(item):
        key_parts = [-item["votes"]]
        for tb in tie_breakers:
            if tb == "judge_score_desc":
                key_parts.append(-item["judge_score"])
            elif tb == "earliest_qualifying_vote_timestamp":
                ts = item["earliest_vote_at"]
                key_parts.append(ts.timestamp() if ts else float("inf"))
        key_parts.append(item["public_name"].lower())
        return tuple(key_parts)

    rows.sort(key=sort_key)
    for idx, item in enumerate(rows, start=1):
        item["rank"] = idx
        item["earliest_vote_at"] = iso_utc(item["earliest_vote_at"])
    return rows


def resolve_voting_target(slug: str, competition_slug: str | None = None) -> dict:
    """Resolve a voting URL slug to competition, nominee, round, and voting eligibility.

    Respects FR-NOM-006: old round links resolve to closed-round information rather
    than silently redirecting votes to another round.
    """
    is_specific_round_link = False
    entry = RoundEntry.query.filter_by(voting_slug=slug).first()
    if entry:
        is_specific_round_link = True
        nominee = entry.nominee
        round_obj = entry.round
    else:
        nominee = Nominee.query.filter_by(public_slug=slug).first()
        if not nominee:
            raise DomainError("VOTING_LINK_NOT_FOUND", "This voting link was not found.", 404)
        entry = nominee.get_active_round_entry()
        round_obj = entry.round if entry else None

    comp = nominee.competition
    if competition_slug and comp and comp.slug != competition_slug:
        raise DomainError("COMPETITION_MISMATCH", "This nominee does not belong to the specified competition.", 404)

    global_paused, global_msg = is_global_voting_paused()
    now = utcnow()
    can_vote = True
    block_reason = None
    closed_round_info = False

    if not entry or not round_obj:
        can_vote = False
        block_reason = "No voting round has been configured for this nominee yet."
    elif not entry.link_enabled:
        can_vote = False
        block_reason = "This voting link has been disabled or reissued by the competition organiser."
    elif round_obj.status in ("CLOSED", "RECONCILIATION", "RESULTS_PENDING", "FINALIZED"):
        can_vote = False
        closed_round_info = True
        block_reason = f"{round_obj.name} has closed and is no longer accepting votes."
    elif round_obj.status != "OPEN":
        can_vote = False
        block_reason = f"Voting for {round_obj.name} is not open yet."
    elif round_obj.voting_opens_at and now < round_obj.voting_opens_at:
        can_vote = False
        block_reason = f"Voting opens at {iso_utc(round_obj.voting_opens_at)}."
    elif round_obj.voting_closes_at and now > round_obj.voting_closes_at:
        can_vote = False
        closed_round_info = True
        block_reason = f"The voting window for {round_obj.name} closed at {iso_utc(round_obj.voting_closes_at)}."
    elif global_paused:
        can_vote = False
        block_reason = global_msg
    elif comp and comp.voting_paused:
        can_vote = False
        block_reason = "Voting for this competition is temporarily paused."
    elif nominee.voting_paused:
        can_vote = False
        block_reason = "Voting for this nominee is temporarily paused."
    elif entry.status in ("ELIMINATED", "DISQUALIFIED") or nominee.status in ("ELIMINATED", "DISQUALIFIED", "SUSPENDED"):
        can_vote = False
        closed_round_info = True
        block_reason = f"This contestant is marked {entry.status.lower()} and cannot receive votes."
    elif entry.status not in ("ACTIVE", "QUALIFIED"):
        can_vote = False
        block_reason = f"Nominee status ({entry.status}) is not currently eligible for voting."

    packages = []
    if comp:
        packages = [
            p.to_dict()
            for p in VotePackage.query.filter_by(competition_id=comp.id, status="ACTIVE")
            .order_by(VotePackage.sort_order.asc(), VotePackage.vote_quantity.asc())
            .all()
        ]

    public_votes = None
    if comp and comp.public_leaderboard and round_obj:
        public_votes = get_nominee_round_votes(nominee.id, round_obj.id)

    # Check if nominee advanced to a newer open round when viewing an old round link
    active_entry = nominee.get_active_round_entry()
    has_newer_open_round = bool(
        is_specific_round_link
        and closed_round_info
        and active_entry
        and active_entry.id != entry.id
        and active_entry.round
        and active_entry.round.is_voting_window_open(now)
        and active_entry.status == "ACTIVE"
    )

    return {
        "can_vote": can_vote,
        "block_reason": block_reason,
        "is_closed_round_link": closed_round_info,
        "has_newer_open_round": has_newer_open_round,
        "nominee_profile_path": f"/nominee/{nominee.public_slug}",
        "competition": comp.to_dict(include_details=False) if comp else None,
        "nominee": nominee.to_public_dict(public_votes=public_votes),
        "round": round_obj.to_dict() if round_obj else None,
        "round_entry": entry.to_dict() if entry else None,
        "packages": packages,
        "accepted_channels": [
            {"id": "mobile_money", "label": "Mobile Money (MTN MoMo, Telecel Cash, AirtelTigo)"},
            {"id": "card", "label": "Bank Card (Visa / Mastercard)"},
        ],
    }


def build_nominee_dashboard(user: User) -> dict:
    nominees = Nominee.query.filter_by(user_id=user.id).order_by(Nominee.nominated_at.desc()).all()
    if not nominees:
        raise DomainError("NOT_A_NOMINEE", "You do not have an active nominee profile yet.", 404)

    nominee = nominees[0]
    comp = nominee.competition
    active_entry = nominee.get_active_round_entry()
    active_round = active_entry.round if active_entry else None

    current_round_votes = 0
    is_provisional = False
    rank_info = None
    trend_series = []
    recent_activity = []

    if active_round:
        current_round_votes = get_nominee_round_votes(nominee.id, active_round.id)
        pending_orders_count = Order.query.filter_by(
            nominee_id=nominee.id,
            round_id=active_round.id,
            status="PENDING_PAYMENT",
        ).count()
        is_provisional = (
            pending_orders_count > 0
            or active_round.status in ("RECONCILIATION", "RESULTS_PENDING")
        )

        # Rank only if competition enables nominee_see_rank or public_leaderboard (FR-ND-005)
        if comp and (comp.nominee_see_rank or comp.public_leaderboard):
            standings = compute_round_standings(active_round)
            total_in_round = len(standings)
            for item in standings:
                if item["nominee_id"] == nominee.id:
                    rank_info = {
                        "rank": item["rank"],
                        "total_contestants": total_in_round,
                        "disclaimer": "Rank is provisional and may change while voting or payment reconciliation is active.",
                    }
                    break

        # Daily vote trend from ledger (no voter PII)
        ledger_entries = (
            VoteLedger.query.filter_by(nominee_id=nominee.id, round_id=active_round.id)
            .order_by(VoteLedger.created_at.asc())
            .all()
        )
        buckets = defaultdict(int)
        for le in ledger_entries:
            day_key = le.created_at.strftime("%Y-%m-%d")
            buckets[day_key] += le.quantity
        trend_series = [{"date": k, "votes": v} for k, v in sorted(buckets.items())]

        # Aggregate recent voting activity WITHOUT voter private info (FR-ND-007 & Section 4.4)
        recent_entries = (
            VoteLedger.query.filter_by(nominee_id=nominee.id, round_id=active_round.id)
            .order_by(VoteLedger.created_at.desc())
            .limit(12)
            .all()
        )
        for le in recent_entries:
            channel = le.order.payment_channel if le.order else "adjustment"
            recent_activity.append(
                {
                    "entry_type": le.entry_type,
                    "votes": le.quantity,
                    "channel": channel,
                    "created_at": iso_utc(le.created_at),
                }
            )

    # Round progression & history (FR-ND-006)
    round_history = []
    sorted_entries = sorted(
        nominee.round_entries,
        key=lambda e: e.round.sequence_no if e.round else 0,
    )
    for re_item in sorted_entries:
        r_votes = (
            re_item.final_total_snapshot
            if re_item.final_total_snapshot is not None
            else get_nominee_round_votes(nominee.id, re_item.round_id)
        )
        round_history.append(
            {
                **re_item.to_dict(),
                "votes": r_votes,
            }
        )

    share_slug = active_entry.voting_slug if active_entry else nominee.public_slug
    comp_slug = comp.slug if comp else "competition"
    voting_path = f"/vote/{comp_slug}/{share_slug}"

    return {
        "nominee": nominee.to_public_dict(),
        "competition": comp.to_dict(include_details=False) if comp else None,
        "current_round": active_round.to_dict() if active_round else None,
        "current_round_entry": active_entry.to_dict() if active_entry else None,
        "current_round_votes": current_round_votes,
        "lifetime_votes": get_nominee_total_votes(nominee.id),
        "is_provisional": is_provisional,
        "rank_info": rank_info,
        "vote_trend": trend_series,
        "recent_activity": recent_activity,
        "round_history": round_history,
        "voting_path": voting_path,
        "voting_slug": share_slug,
    }


def create_vote_adjustment(
    actor: User,
    *,
    nominee_id: str,
    round_id: str,
    quantity: int,
    reason: str,
    approval_reference: str,
) -> VoteLedger:
    if quantity == 0:
        raise DomainError("INVALID_QUANTITY", "Adjustment quantity cannot be zero.", 422)
    if not (reason or "").strip() or len(reason.strip()) < 5:
        raise DomainError("REASON_REQUIRED", "A detailed reason is required for vote adjustments.", 422)
    if not (approval_reference or "").strip():
        raise DomainError("APPROVAL_REQUIRED", "A second-person approval reference is required for vote adjustments.", 422)

    nominee = db.session.get(Nominee, nominee_id)
    round_obj = db.session.get(Round, round_id)
    if not nominee or not round_obj or nominee.competition_id != round_obj.competition_id:
        raise DomainError("NOT_FOUND", "Valid nominee and round in the same competition are required.", 404)

    before_votes = get_nominee_round_votes(nominee.id, round_obj.id)
    entry = VoteLedger(
        order_id=None,
        payment_id=None,
        nominee_id=nominee.id,
        round_id=round_obj.id,
        quantity=int(quantity),
        entry_type="ADJUSTMENT",
        reason=reason.strip(),
        actor_user_id=actor.id,
        approval_reference=approval_reference.strip(),
    )
    db.session.add(entry)
    db.session.flush()
    after_votes = get_nominee_round_votes(nominee.id, round_obj.id)

    log_audit(
        actor_user_id=actor.id,
        action="VOTE_LEDGER_ADJUSTMENT",
        entity_type="vote_ledger",
        entity_id=entry.id,
        before={"votes": before_votes},
        after={
            "votes": after_votes,
            "delta": int(quantity),
            "reason": reason.strip(),
            "approval_reference": approval_reference.strip(),
        },
    )
    db.session.commit()
    return entry
