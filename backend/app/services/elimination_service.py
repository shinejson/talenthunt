import math

from app.extensions import db
from app.models.competition import Round
from app.models.elimination import EliminationResult, EliminationRun
from app.models.nominee import Nominee, RoundEntry
from app.models.user import User
from app.models.voting import Order
from app.schemas import DomainError
from app.services.audit_service import log_audit
from app.services.nomination_service import ensure_nominee_in_round
from app.services.notification_service import notify_user
from app.services.voting_service import compute_round_standings


def _evaluate_elimination_outcomes(
    round_obj: Round,
    config: dict,
    manual_qualifiers: list[str] | None = None,
) -> tuple[list[dict], list[str]]:
    method = (config.get("method") or "top_n").lower()
    exclude_disq = bool(config.get("exclude_disqualified", True))

    standings = compute_round_standings(round_obj, exclude_disqualified=exclude_disq)
    all_entries = RoundEntry.query.filter_by(round_id=round_obj.id).all()
    disq_entries = [
        e for e in all_entries
        if (e.status == "DISQUALIFIED" or (e.nominee and e.nominee.status == "DISQUALIFIED"))
    ]

    anomalies = []
    pending_orders = Order.query.filter_by(round_id=round_obj.id, status="PENDING_PAYMENT").count()
    quarantined_orders = Order.query.filter_by(round_id=round_obj.id, status="QUARANTINED").count()
    if pending_orders > 0:
        anomalies.append(f"{pending_orders} order(s) are still in PENDING_PAYMENT status.")
    if quarantined_orders > 0:
        anomalies.append(f"{quarantined_orders} quarantined payment(s) exist for this round.")

    # Hybrid re-sorting if method == "hybrid" (combine vote rank score + judge score)
    if method == "hybrid" and standings:
        vote_weight = float(config.get("vote_weight", 0.7))
        judge_weight = float(config.get("judge_weight", 0.3))
        max_votes = max((s["votes"] for s in standings), default=1) or 1
        for item in standings:
            norm_vote = (item["votes"] / max_votes) * 100.0
            item["composite_score"] = round(norm_vote * vote_weight + item["judge_score"] * judge_weight, 3)
        standings.sort(key=lambda x: (-x["composite_score"], -x["votes"], -x["judge_score"], x["public_name"].lower()))
        for idx, item in enumerate(standings, start=1):
            item["rank"] = idx

    total_eligible = len(standings)
    manual_set = set(manual_qualifiers or config.get("manual_qualifier_ids") or [])

    if method in ("top_n", "hybrid"):
        advance_count = int(config.get("advance_count") or max(1, total_eligible // 2))
    elif method == "percentage":
        pct = float(config.get("advance_percentage") or 50.0)
        advance_count = max(1, math.ceil(total_eligible * (pct / 100.0))) if total_eligible else 0
    else:
        advance_count = 0

    threshold_votes = int(config.get("min_votes_threshold") or 0)

    # Check tie at cutoff boundary
    if method in ("top_n", "percentage", "hybrid") and 0 < advance_count < total_eligible:
        last_in = standings[advance_count - 1]
        first_out = standings[advance_count]
        if last_in["votes"] == first_out["votes"]:
            anomalies.append(
                f"Tie on vote total ({last_in['votes']} votes) at cutoff rank #{advance_count}; resolved using configured tie-breakers."
            )

    evaluated = []
    for item in standings:
        qualifies = False
        reason = ""
        if method in ("top_n", "percentage", "hybrid"):
            qualifies = item["rank"] <= advance_count
            reason = f"Ranked #{item['rank']} of {total_eligible} (cutoff top {advance_count})"
        elif method == "threshold":
            qualifies = item["votes"] >= threshold_votes
            reason = f"{item['votes']} votes vs minimum threshold of {threshold_votes}"
        elif method == "manual":
            qualifies = item["nominee_id"] in manual_set
            reason = "Selected by authorised judging panel" if qualifies else "Not selected by judging panel"
        else:
            raise DomainError("INVALID_ELIMINATION_METHOD", f"Unsupported elimination method '{method}'.", 422)

        if round_obj.is_finale:
            if qualifies and item["rank"] == 1:
                outcome = "WINNER"
                reason = f"Competition Winner ({reason})"
            elif qualifies:
                outcome = "QUALIFIED"
                reason = f"Finalist ({reason})"
            else:
                outcome = "ELIMINATED"
        else:
            outcome = "QUALIFIED" if qualifies else "ELIMINATED"

        evaluated.append({**item, "outcome": outcome, "reason": reason})

    if exclude_disq:
        for d_entry in disq_entries:
            nom = d_entry.nominee
            if not nom:
                continue
            evaluated.append(
                {
                    "round_entry_id": d_entry.id,
                    "nominee_id": nom.id,
                    "public_name": nom.public_name,
                    "public_slug": nom.public_slug,
                    "voting_slug": d_entry.voting_slug,
                    "category_id": nom.category_id,
                    "category_name": nom.category.name if nom.category else None,
                    "status": "DISQUALIFIED",
                    "nominee_status": nom.status,
                    "votes": 0,
                    "judge_score": float(d_entry.judge_score or 0.0),
                    "earliest_vote_at": None,
                    "rank": None,
                    "outcome": "DISQUALIFIED",
                    "reason": nom.disqualification_reason or "Excluded due to disqualification",
                }
            )

    return evaluated, anomalies


def preview_round_elimination(
    round_id: str,
    override_config: dict | None = None,
    manual_qualifiers: list[str] | None = None,
) -> dict:
    round_obj = db.session.get(Round, round_id)
    if not round_obj:
        raise DomainError("ROUND_NOT_FOUND", "Round not found.", 404)

    cfg = {**(round_obj.elimination_config or {}), **(override_config or {})}
    if not cfg.get("method"):
        cfg["method"] = "top_n"
        cfg.setdefault("advance_count", 3)

    evaluated, anomalies = _evaluate_elimination_outcomes(round_obj, cfg, manual_qualifiers=manual_qualifiers)
    next_round = Round.query.filter_by(
        competition_id=round_obj.competition_id,
        sequence_no=round_obj.sequence_no + 1,
    ).first()

    return {
        "round": round_obj.to_dict(),
        "rules_applied": cfg,
        "next_round": next_round.to_dict() if next_round else None,
        "anomalies": anomalies,
        "summary": {
            "total_entries": len(evaluated),
            "qualified_count": sum(1 for r in evaluated if r["outcome"] in ("QUALIFIED", "WINNER")),
            "winner_count": sum(1 for r in evaluated if r["outcome"] == "WINNER"),
            "eliminated_count": sum(1 for r in evaluated if r["outcome"] == "ELIMINATED"),
            "disqualified_count": sum(1 for r in evaluated if r["outcome"] == "DISQUALIFIED"),
        },
        "results": evaluated,
    }


def finalise_round_elimination(
    actor: User,
    round_id: str,
    *,
    manual_qualifiers: list[str] | None = None,
    notes: str | None = None,
    publish_results: bool = True,
    is_correction: bool = False,
    override_config: dict | None = None,
) -> EliminationRun:
    round_obj = db.session.get(Round, round_id)
    if not round_obj:
        raise DomainError("ROUND_NOT_FOUND", "Round not found.", 404)

    existing_final = EliminationRun.query.filter_by(round_id=round_obj.id, status="FINALIZED").first()
    if existing_final and not is_correction:
        raise DomainError(
            "ROUND_ALREADY_FINALIZED",
            "This round already has a finalized elimination snapshot. Submit an explicit correction run with a reason if required.",
            409,
        )
    if is_correction and not (notes or "").strip():
        raise DomainError("REASON_REQUIRED", "Correction runs require an explicit reason in notes.", 422)

    cfg = {**(round_obj.elimination_config or {}), **(override_config or {})}
    if not cfg.get("method"):
        cfg["method"] = "top_n"
        cfg.setdefault("advance_count", 3)
    if manual_qualifiers is not None:
        cfg["manual_qualifier_ids"] = manual_qualifiers

    evaluated, anomalies = _evaluate_elimination_outcomes(round_obj, cfg, manual_qualifiers=manual_qualifiers)
    if not evaluated:
        raise DomainError("NO_ENTRIES", "Cannot finalise elimination for a round with zero nominees.", 400)

    # Freeze round (Section 13.3)
    before_round_status = round_obj.status
    round_obj.status = "FINALIZED"
    round_obj.results_published = bool(publish_results)
    round_obj.elimination_config = cfg

    next_round = None
    if not round_obj.is_finale:
        next_round = Round.query.filter_by(
            competition_id=round_obj.competition_id,
            sequence_no=round_obj.sequence_no + 1,
        ).first()

    run = EliminationRun(
        round_id=round_obj.id,
        method=cfg["method"],
        rules_snapshot={**cfg, "anomalies_at_execution": anomalies},
        status="CORRECTION" if is_correction else "FINALIZED",
        notes=(notes or "").strip() or None,
        executed_by=actor.id,
    )
    db.session.add(run)
    db.session.flush()

    comp = round_obj.competition
    for row in evaluated:
        entry = db.session.get(RoundEntry, row["round_entry_id"])
        nominee = db.session.get(Nominee, row["nominee_id"])
        outcome = row["outcome"]

        advanced_round_id = None
        if entry:
            entry.final_total_snapshot = row["votes"]
            entry.status = outcome

        if nominee:
            if outcome == "WINNER":
                nominee.status = "WINNER"
            elif outcome == "QUALIFIED":
                if next_round:
                    ensure_nominee_in_round(nominee, next_round, judge_score=row["judge_score"])
                    advanced_round_id = next_round.id
                    nominee.status = "ACTIVE"
                else:
                    nominee.status = "QUALIFIED"
            elif outcome == "ELIMINATED":
                nominee.status = "ELIMINATED"
            elif outcome == "DISQUALIFIED":
                nominee.status = "DISQUALIFIED"

            # Notify affected nominee
            notify_user(
                user_id=nominee.user_id,
                notif_type=f"ROUND_{outcome}",
                title=f"{round_obj.name} Results — {outcome.title()}",
                body=(
                    f"Official results for {round_obj.name} in {comp.title if comp else 'the competition'} have been finalized. "
                    f"Your outcome: {outcome} ({row['votes']} valid votes)."
                ),
                action_url="/portal/voting",
            )

        res = EliminationResult(
            elimination_run_id=run.id,
            nominee_id=row["nominee_id"],
            round_entry_id=row["round_entry_id"],
            final_votes=row["votes"],
            judge_score=row["judge_score"],
            final_rank=row["rank"],
            outcome=outcome,
            advanced_to_round_id=advanced_round_id,
            reason=row["reason"],
        )
        db.session.add(res)

    if round_obj.is_finale and comp:
        comp.status = "COMPLETED"

    log_audit(
        actor_user_id=actor.id,
        action="ROUND_ELIMINATION_CORRECTION" if is_correction else "ROUND_ELIMINATION_FINALIZED",
        entity_type="round",
        entity_id=round_obj.id,
        before={"status": before_round_status},
        after={
            "elimination_run_id": run.id,
            "method": cfg["method"],
            "results_published": round_obj.results_published,
            "next_round_id": next_round.id if next_round else None,
        },
    )
    db.session.commit()
    db.session.refresh(run)
    return run
