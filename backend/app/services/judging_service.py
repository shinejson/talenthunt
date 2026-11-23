from typing import Any
from sqlalchemy import func

from app.extensions import db
from app.models.application import Submission
from app.models.competition import Competition, Round
from app.models.nominee import JudgeScore, Nominee, RoundEntry
from app.models.user import User
from app.schemas import DomainError
from app.services.audit_service import log_audit
from app.utils.time_utils import iso_utc, utcnow

DEFAULT_JUDGING_CRITERIA = [
    {
        "key": "technical",
        "label": "Vocal / Technical Ability",
        "description": "Pitch precision, rhythm control, breath management, vocal/movement technique, and difficulty.",
        "max_score": 25,
    },
    {
        "key": "stage_presence",
        "label": "Stage Presence & Charisma",
        "description": "Confidence, projection, energy, audience engagement, expression, and command of stage.",
        "max_score": 25,
    },
    {
        "key": "creativity",
        "label": "Creativity & Originality",
        "description": "Artistic interpretation, distinct style, uniqueness of routine, and originality.",
        "max_score": 25,
    },
    {
        "key": "overall",
        "label": "Overall Performance & Star Quality",
        "description": "Total performance impact, emotional resonance, memorability, star readiness, and execution.",
        "max_score": 25,
    },
]


def get_round_criteria(round_obj: Round) -> list[dict]:
    if round_obj.elimination_config and isinstance(round_obj.elimination_config, dict):
        custom = round_obj.elimination_config.get("judging_criteria")
        if custom and isinstance(custom, list) and len(custom) > 0:
            return custom
    return DEFAULT_JUDGING_CRITERIA


def get_judging_competitions_and_rounds() -> list[dict]:
    competitions = Competition.query.all()
    competitions.sort(key=lambda c: (0 if len(c.rounds) > 0 else 1, c.title))
    results = []
    for comp in competitions:
        rounds_data = []
        for r in sorted(comp.rounds, key=lambda x: x.sequence_no):
            entries_count = RoundEntry.query.filter_by(round_id=r.id).count()
            scored_entries = (
                db.session.query(JudgeScore.nominee_id)
                .filter_by(round_id=r.id)
                .distinct()
                .count()
            )
            judges_count = (
                db.session.query(JudgeScore.judge_id)
                .filter_by(round_id=r.id)
                .distinct()
                .count()
            )
            rounds_data.append({
                "id": r.id,
                "name": r.name,
                "sequence_no": r.sequence_no,
                "status": r.status,
                "is_finale": r.is_finale,
                "nominee_count": entries_count,
                "scored_count": scored_entries,
                "judges_count": judges_count,
            })
        results.append({
            "id": comp.id,
            "title": comp.title,
            "slug": comp.slug,
            "status": comp.status,
            "rounds": rounds_data,
        })
    return results


def get_round_nominees_for_judging(round_id: str, current_judge_id: str | None = None) -> dict:
    round_obj = db.session.get(Round, round_id)
    if not round_obj:
        raise DomainError("ROUND_NOT_FOUND", "The specified competition round does not exist.", 404)

    criteria = get_round_criteria(round_obj)
    entries = RoundEntry.query.filter_by(round_id=round_id).all()

    nominees_list = []
    for entry in entries:
        nominee = entry.nominee
        if not nominee:
            continue

        # Look up application and latest submission for demo materials
        application = nominee.application
        latest_sub = None
        if application and application.submissions:
            latest_sub = application.latest_submission

        sub_dict = latest_sub.to_dict(include_moderation=False) if latest_sub else None
        profile_img = (
            nominee.user.profile_image.to_dict()
            if nominee.user and nominee.user.profile_image and not nominee.user.profile_image.is_private
            else None
        )

        # Current judge's scorecard if exists
        my_score_obj = None
        if current_judge_id:
            my_score_obj = JudgeScore.query.filter_by(
                round_id=round_id,
                nominee_id=nominee.id,
                judge_id=current_judge_id,
            ).first()

        # Count how many judges have scored this nominee in this round
        total_judges_scored = JudgeScore.query.filter_by(
            round_id=round_id,
            nominee_id=nominee.id,
        ).count()

        nominees_list.append({
            "round_entry_id": entry.id,
            "nominee_id": nominee.id,
            "public_name": nominee.public_name,
            "public_slug": nominee.public_slug,
            "tagline": nominee.tagline,
            "category_name": nominee.category.name if nominee.category else None,
            "location": nominee.location,
            "profile_image": profile_img,
            "status": entry.status,
            "judge_score": entry.judge_score,
            "performance": {
                "title": sub_dict["title"] if sub_dict else "Audition / Showcase Performance",
                "description": sub_dict["description"] if sub_dict else (nominee.profile_text or "No performance description provided."),
                "biography": sub_dict.get("biography") if sub_dict else nominee.profile_text,
                "external_video_url": sub_dict["external_video_url"] if sub_dict else None,
                "media_asset": sub_dict["media_asset"] if sub_dict else None,
                "second_media_asset": sub_dict.get("second_media_asset") if sub_dict else None,
            },
            "my_score": my_score_obj.to_dict() if my_score_obj else None,
            "has_scored": my_score_obj is not None,
            "total_judges_scored": total_judges_scored,
        })

    # Sort nominees: active ones first, then alphabetical
    nominees_list.sort(key=lambda x: (0 if x["status"] == "ACTIVE" else 1, x["public_name"].lower()))

    return {
        "round": {
            "id": round_obj.id,
            "name": round_obj.name,
            "sequence_no": round_obj.sequence_no,
            "status": round_obj.status,
            "is_finale": round_obj.is_finale,
            "competition_id": round_obj.competition_id,
            "competition_title": round_obj.competition.title if round_obj.competition else None,
        },
        "criteria": criteria,
        "nominees": nominees_list,
        "total_nominees": len(nominees_list),
        "total_scored_by_me": sum(1 for n in nominees_list if n["has_scored"]),
    }


def save_judge_score(round_id: str, nominee_id: str, judge_user_id: str, data: dict) -> dict:
    round_obj = db.session.get(Round, round_id)
    if not round_obj:
        raise DomainError("ROUND_NOT_FOUND", "The specified competition round does not exist.", 404)

    entry = RoundEntry.query.filter_by(round_id=round_id, nominee_id=nominee_id).first()
    if not entry:
        raise DomainError("NOMINEE_NOT_IN_ROUND", "This nominee is not enrolled in the selected round.", 404)

    judge_user = db.session.get(User, judge_user_id)
    if not judge_user:
        raise DomainError("USER_NOT_FOUND", "Judge user profile not found.", 404)

    criteria_list = get_round_criteria(round_obj)
    raw_criteria_scores = data.get("criteria_scores") or {}
    if not isinstance(raw_criteria_scores, dict):
        raise DomainError("INVALID_CRITERIA_SCORES", "Criteria scores must be a key-value dictionary.", 422)

    validated_criteria = {}
    computed_sum = 0.0

    for crit in criteria_list:
        key = crit["key"]
        max_pts = float(crit.get("max_score", 25))
        raw_val = raw_criteria_scores.get(key)
        if raw_val is None:
            val = 0.0
        else:
            try:
                val = float(raw_val)
            except (ValueError, TypeError):
                raise DomainError("INVALID_SCORE_VALUE", f"Score for '{crit['label']}' must be numeric.", 422)
            if val < 0.0 or val > max_pts:
                raise DomainError("SCORE_OUT_OF_RANGE", f"Score for '{crit['label']}' must be between 0 and {max_pts}.", 422)
        validated_criteria[key] = round(val, 2)
        computed_sum += val

    computed_sum = round(computed_sum, 2)
    # Total score should not exceed 100
    if computed_sum < 0.0 or computed_sum > 100.0:
        raise DomainError("TOTAL_SCORE_OUT_OF_RANGE", "Total calculated score must be between 0 and 100.", 422)

    remarks = (data.get("remarks") or "").strip()
    is_final = bool(data.get("is_final", True))

    score_record = JudgeScore.query.filter_by(
        round_id=round_id,
        nominee_id=nominee_id,
        judge_id=judge_user_id,
    ).first()

    if not score_record:
        score_record = JudgeScore(
            round_id=round_id,
            nominee_id=nominee_id,
            judge_id=judge_user_id,
            criteria_scores=validated_criteria,
            total_score=computed_sum,
            remarks=remarks,
            is_final=is_final,
        )
        db.session.add(score_record)
    else:
        score_record.criteria_scores = validated_criteria
        score_record.total_score = computed_sum
        score_record.remarks = remarks
        score_record.is_final = is_final
        score_record.updated_at = utcnow()

    db.session.flush()

    # Recalculate consensus average score across all judges for this nominee in this round
    all_scores = JudgeScore.query.filter_by(round_id=round_id, nominee_id=nominee_id).all()
    if all_scores:
        avg_score = round(sum(s.total_score for s in all_scores) / len(all_scores), 2)
    else:
        avg_score = 0.0

    entry.judge_score = avg_score
    db.session.commit()

    log_audit(
        actor_user_id=judge_user_id,
        action="JUDGE_SCORE_SUBMITTED",
        entity_type="Nominee",
        entity_id=nominee_id,
        after={
            "round_id": round_id,
            "round_name": round_obj.name,
            "judge_id": judge_user_id,
            "judge_name": judge_user.full_name,
            "total_score": computed_sum,
            "criteria_scores": validated_criteria,
            "consensus_round_score": avg_score,
            "is_final": is_final,
        },
    )
    db.session.commit()

    return {
        "score": score_record.to_dict(),
        "consensus_judge_score": avg_score,
        "round_entry_id": entry.id,
    }


def get_round_tally_sheet(round_id: str) -> dict:
    round_obj = db.session.get(Round, round_id)
    if not round_obj:
        raise DomainError("ROUND_NOT_FOUND", "The specified competition round does not exist.", 404)

    criteria = get_round_criteria(round_obj)
    entries = RoundEntry.query.filter_by(round_id=round_id).all()

    # Find all distinct judges who scored in this round
    all_scores = JudgeScore.query.filter_by(round_id=round_id).all()
    judge_ids = {s.judge_id for s in all_scores}
    judges_query = User.query.filter(User.id.in_(judge_ids)).all() if judge_ids else []
    judges_meta = [
        {"id": j.id, "name": j.full_name, "email": j.email}
        for j in judges_query
    ]

    nominees_tally = []
    for entry in entries:
        nominee = entry.nominee
        if not nominee:
            continue

        nom_scores = [s for s in all_scores if s.nominee_id == nominee.id]
        judge_map = {}
        criteria_totals = {c["key"]: 0.0 for c in criteria}
        remarks_list = []

        for s in nom_scores:
            judge_map[s.judge_id] = {
                "judge_id": s.judge_id,
                "judge_name": s.judge.full_name if s.judge else "Judge",
                "total_score": round(s.total_score, 2),
                "criteria_scores": s.criteria_scores or {},
                "remarks": s.remarks or "",
                "is_final": s.is_final,
                "updated_at": iso_utc(s.updated_at),
            }
            if s.remarks:
                remarks_list.append({
                    "judge_name": s.judge.full_name if s.judge else "Judge",
                    "remarks": s.remarks,
                    "score": round(s.total_score, 2),
                    "created_at": iso_utc(s.updated_at),
                })
            for c in criteria:
                k = c["key"]
                criteria_totals[k] += float((s.criteria_scores or {}).get(k, 0))

        n_scores_count = len(nom_scores)
        if n_scores_count > 0:
            consensus = round(sum(s.total_score for s in nom_scores) / n_scores_count, 2)
            criteria_averages = {
                k: round(criteria_totals[k] / n_scores_count, 2)
                for k in criteria_totals
            }
        else:
            consensus = entry.judge_score or 0.0
            criteria_averages = {k: 0.0 for k in criteria_totals}

        profile_img = (
            nominee.user.profile_image.to_dict()
            if nominee.user and nominee.user.profile_image and not nominee.user.profile_image.is_private
            else None
        )

        nominees_tally.append({
            "round_entry_id": entry.id,
            "nominee_id": nominee.id,
            "public_name": nominee.public_name,
            "public_slug": nominee.public_slug,
            "category_name": nominee.category.name if nominee.category else None,
            "profile_image": profile_img,
            "status": entry.status,
            "judge_scores": judge_map,
            "criteria_averages": criteria_averages,
            "consensus_score": consensus,
            "round_entry_score": entry.judge_score or 0.0,
            "judge_count": n_scores_count,
            "remarks": remarks_list,
        })

    # Sort nominees by consensus score descending, then by name
    nominees_tally.sort(key=lambda x: (-x["consensus_score"], x["public_name"].lower()))

    # Assign rank 1..N
    for idx, item in enumerate(nominees_tally, start=1):
        item["rank"] = idx

    avg_round_score = (
        round(sum(n["consensus_score"] for n in nominees_tally) / len(nominees_tally), 2)
        if nominees_tally else 0.0
    )

    return {
        "round": {
            "id": round_obj.id,
            "name": round_obj.name,
            "sequence_no": round_obj.sequence_no,
            "status": round_obj.status,
            "is_finale": round_obj.is_finale,
            "competition_id": round_obj.competition_id,
            "competition_title": round_obj.competition.title if round_obj.competition else None,
        },
        "criteria": criteria,
        "judges": judges_meta,
        "nominees": nominees_tally,
        "summary": {
            "total_nominees": len(nominees_tally),
            "total_judges": len(judges_meta),
            "total_scorecards": len(all_scores),
            "average_round_score": avg_round_score,
            "highest_score": nominees_tally[0]["consensus_score"] if nominees_tally else 0.0,
            "leader_nominee": nominees_tally[0]["public_name"] if nominees_tally else None,
        },
    }


def sync_round_tally_scores(round_id: str, actor_user: User) -> dict:
    round_obj = db.session.get(Round, round_id)
    if not round_obj:
        raise DomainError("ROUND_NOT_FOUND", "The specified competition round does not exist.", 404)

    entries = RoundEntry.query.filter_by(round_id=round_id).all()
    synced_count = 0

    for entry in entries:
        scores = JudgeScore.query.filter_by(round_id=round_id, nominee_id=entry.nominee_id).all()
        if scores:
            avg_score = round(sum(s.total_score for s in scores) / len(scores), 2)
            entry.judge_score = avg_score
            synced_count += 1

    db.session.commit()

    log_audit(
        actor_user_id=actor_user.id if actor_user else None,
        action="ROUND_JUDGE_SCORES_SYNCED",
        entity_type="Round",
        entity_id=round_id,
        after={
            "round_id": round_id,
            "round_name": round_obj.name,
            "synced_entries": synced_count,
        },
    )
    db.session.commit()

    return {
        "round_id": round_id,
        "synced_count": synced_count,
        "message": f"Successfully updated consensus judge scores for {synced_count} nominee entries.",
    }
