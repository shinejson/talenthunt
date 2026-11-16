from app.extensions import db
from app.models.application import Application, Review
from app.models.competition import Round
from app.models.nominee import Nominee, RoundEntry
from app.models.user import User
from app.schemas import DomainError
from app.services.audit_service import log_audit
from app.services.auth_service import grant_role
from app.services.notification_service import notify_user
from app.utils.security import generate_opaque_slug, slugify
from app.utils.time_utils import utcnow


def _unique_nominee_slug(public_name: str) -> str:
    base = slugify(public_name)[:28]
    while True:
        candidate = f"{base}-{generate_opaque_slug(6)}"
        if not Nominee.query.filter_by(public_slug=candidate).first() and not RoundEntry.query.filter_by(voting_slug=candidate).first():
            return candidate


def _unique_voting_slug() -> str:
    while True:
        candidate = generate_opaque_slug(11)
        if not RoundEntry.query.filter_by(voting_slug=candidate).first() and not Nominee.query.filter_by(public_slug=candidate).first():
            return candidate


def record_review(reviewer: User, application_id: str, payload: dict) -> Review:
    app_rec = db.session.get(Application, application_id)
    if not app_rec:
        raise DomainError("NOT_FOUND", "Application not found.", 404)
    if app_rec.user_id == reviewer.id:
        raise DomainError("SELF_REVIEW_FORBIDDEN", "You cannot review your own application.", 403)

    recommendation = (payload.get("recommendation") or "").upper().strip()
    if recommendation not in ("APPROVE", "NOMINATE", "REQUEST_CHANGES", "REJECT"):
        raise DomainError("INVALID_RECOMMENDATION", "Recommendation must be APPROVE, NOMINATE, REQUEST_CHANGES, or REJECT.", 422)

    score = payload.get("score")
    if score is not None and score != "":
        try:
            score = float(score)
        except (TypeError, ValueError):
            raise DomainError("INVALID_SCORE", "Score must be a number between 0 and 100.", 422)
        if score < 0 or score > 100:
            raise DomainError("INVALID_SCORE", "Score must be between 0 and 100.", 422)
    else:
        score = None

    rev = Review(
        application_id=app_rec.id,
        reviewer_user_id=reviewer.id,
        score=score,
        recommendation=recommendation,
        internal_notes=(payload.get("internal_notes") or "").strip() or None,
    )
    db.session.add(rev)
    if app_rec.status == "SUBMITTED":
        app_rec.status = "UNDER_REVIEW"

    log_audit(
        actor_user_id=reviewer.id,
        action="APPLICATION_REVIEWED",
        entity_type="application",
        entity_id=app_rec.id,
        after={"recommendation": recommendation, "score": score},
    )
    db.session.commit()
    return rev


def decide_application(actor: User, application_id: str, payload: dict) -> dict:
    app_rec = db.session.get(Application, application_id)
    if not app_rec:
        raise DomainError("NOT_FOUND", "Application not found.", 404)

    if app_rec.user_id == actor.id:
        raise DomainError("SELF_DECISION_FORBIDDEN", "Applicants cannot approve or nominate themselves.", 403)

    decision = (payload.get("decision") or "").upper().strip()
    if decision not in ("APPROVE", "REJECT", "REQUEST_CHANGES", "NOMINATE"):
        raise DomainError(
            "INVALID_DECISION",
            "Decision must be APPROVE, REJECT, REQUEST_CHANGES, or NOMINATE.",
            422,
        )

    reason = (payload.get("reason") or "").strip()
    applicant_feedback = (payload.get("applicant_feedback") or reason or "").strip() or None
    if decision in ("REJECT", "REQUEST_CHANGES") and not reason and not applicant_feedback:
        raise DomainError("REASON_REQUIRED", "Please provide a reason or feedback for the applicant.", 422)

    before_status = app_rec.status
    app_rec.decision_by = actor.id
    app_rec.decision_at = utcnow()
    app_rec.decision_reason = reason or None
    if applicant_feedback:
        app_rec.applicant_feedback = applicant_feedback

    created_nominee = None
    created_round_entry = None

    if decision == "APPROVE":
        app_rec.status = "APPROVED"
        notify_user(
            user_id=app_rec.user_id,
            notif_type="APPLICATION_APPROVED",
            title="Your Talent Demo Was Approved",
            body=f"Your submission ({app_rec.reference_no}) has been approved and is eligible for nomination.",
            action_url=f"/portal/submissions/{app_rec.id}",
        )
    elif decision == "REJECT":
        app_rec.status = "REJECTED"
        notify_user(
            user_id=app_rec.user_id,
            notif_type="APPLICATION_REJECTED",
            title="Update on Your Talent Application",
            body=f"Thank you for applying ({app_rec.reference_no}). {applicant_feedback or 'Your submission was not selected for this season.'}",
            action_url=f"/portal/submissions/{app_rec.id}",
        )
    elif decision == "REQUEST_CHANGES":
        app_rec.status = "CHANGES_REQUESTED"
        notify_user(
            user_id=app_rec.user_id,
            notif_type="CHANGES_REQUESTED",
            title="Action Needed: Changes Requested on Your Submission",
            body=f"Please review feedback on {app_rec.reference_no}: {applicant_feedback}",
            action_url=f"/portal/submissions/{app_rec.id}",
        )
    elif decision == "NOMINATE":
        # Prevent duplicate nomination in same competition + category (FR-REV-007)
        dup = Nominee.query.filter_by(
            competition_id=app_rec.competition_id,
            category_id=app_rec.category_id,
            user_id=app_rec.user_id,
        ).first()
        if dup:
            raise DomainError(
                "DUPLICATE_NOMINATION",
                "This applicant is already nominated in this competition and category.",
                409,
            )

        app_rec.status = "NOMINATED"
        latest_sub = app_rec.latest_submission
        public_name = (payload.get("public_name") or app_rec.stage_name or app_rec.applicant.full_name).strip()
        nominee = Nominee(
            application_id=app_rec.id,
            user_id=app_rec.user_id,
            competition_id=app_rec.competition_id,
            category_id=app_rec.category_id,
            public_name=public_name,
            public_slug=_unique_nominee_slug(public_name),
            tagline=(latest_sub.title if latest_sub else None),
            profile_text=(latest_sub.biography or latest_sub.description if latest_sub else None),
            location=app_rec.location,
            status="ACTIVE",
            is_featured=bool(payload.get("is_featured", False)),
        )
        db.session.add(nominee)
        db.session.flush()

        # Assign to target round (specified round_id, active OPEN round, or first round)
        target_round = None
        if payload.get("round_id"):
            target_round = db.session.get(Round, payload["round_id"])
            if not target_round or target_round.competition_id != app_rec.competition_id:
                raise DomainError("INVALID_ROUND", "Invalid round for this competition.", 422)
        else:
            target_round = (
                Round.query.filter_by(competition_id=app_rec.competition_id, status="OPEN")
                .order_by(Round.sequence_no.asc())
                .first()
            )
            if not target_round:
                target_round = (
                    Round.query.filter(
                        Round.competition_id == app_rec.competition_id,
                        Round.status.in_(["DRAFT", "SCHEDULED"]),
                    )
                    .order_by(Round.sequence_no.asc())
                    .first()
                )

        scores = [r.score for r in app_rec.reviews if r.score is not None]
        avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0

        if target_round:
            created_round_entry = RoundEntry(
                round_id=target_round.id,
                nominee_id=nominee.id,
                voting_slug=_unique_voting_slug(),
                link_enabled=True,
                status="ACTIVE",
                judge_score=avg_score,
                starting_total_snapshot=0,
            )
            db.session.add(created_round_entry)
            db.session.flush()

        applicant_user = db.session.get(User, app_rec.user_id)
        if applicant_user:
            grant_role(applicant_user, "NOMINEE", granted_by=actor.id)

        comp_slug = app_rec.competition.slug if app_rec.competition else "competition"
        share_slug = created_round_entry.voting_slug if created_round_entry else nominee.public_slug
        voting_path = f"/vote/{comp_slug}/{share_slug}"

        notify_user(
            user_id=app_rec.user_id,
            notif_type="NOMINATED",
            title=f"Congratulations! You Have Been Nominated — {public_name}",
            body=f"You are now an official nominee in {app_rec.competition.title}! Open your Nominee Dashboard to copy your unique voting link ({voting_path}) and QR code.",
            action_url="/portal/voting",
        )
        created_nominee = nominee

    log_audit(
        actor_user_id=actor.id,
        action=f"APPLICATION_{decision}",
        entity_type="application",
        entity_id=app_rec.id,
        before={"status": before_status},
        after={
            "status": app_rec.status,
            "reason": reason,
            "nominee_id": created_nominee.id if created_nominee else None,
            "voting_slug": created_round_entry.voting_slug if created_round_entry else None,
        },
    )
    db.session.commit()
    db.session.refresh(app_rec)
    return {
        "application": app_rec.to_dict(include_internal=True),
        "nominee": created_nominee.to_public_dict() if created_nominee else None,
        "round_entry": created_round_entry.to_dict() if created_round_entry else None,
    }


def manage_nominee_voting_link(actor: User, nominee_id: str, action: str, round_id: str | None = None, reason: str = "") -> RoundEntry:
    nominee = db.session.get(Nominee, nominee_id)
    if not nominee:
        raise DomainError("NOT_FOUND", "Nominee not found.", 404)
    if not (reason or "").strip():
        raise DomainError("REASON_REQUIRED", "A reason is required to modify a voting link.", 422)

    if round_id:
        entry = RoundEntry.query.filter_by(nominee_id=nominee.id, round_id=round_id).first()
    else:
        entry = nominee.get_active_round_entry()
    if not entry:
        raise DomainError("NOT_FOUND", "Round entry not found for nominee.", 404)

    before = {"voting_slug": entry.voting_slug, "link_enabled": entry.link_enabled}
    act = action.lower().strip()
    if act == "disable":
        entry.link_enabled = False
    elif act == "enable":
        entry.link_enabled = True
    elif act == "reissue":
        entry.voting_slug = _unique_voting_slug()
        entry.link_enabled = True
    else:
        raise DomainError("INVALID_ACTION", "Action must be disable, enable, or reissue.", 422)

    log_audit(
        actor_user_id=actor.id,
        action=f"VOTING_LINK_{act.upper()}",
        entity_type="round_entry",
        entity_id=entry.id,
        before=before,
        after={"voting_slug": entry.voting_slug, "link_enabled": entry.link_enabled, "reason": reason.strip()},
    )
    db.session.commit()
    return entry


def ensure_nominee_in_round(nominee: Nominee, round_obj: Round, judge_score: float = 0.0) -> RoundEntry:
    existing = RoundEntry.query.filter_by(nominee_id=nominee.id, round_id=round_obj.id).first()
    if existing:
        return existing
    entry = RoundEntry(
        round_id=round_obj.id,
        nominee_id=nominee.id,
        voting_slug=_unique_voting_slug(),
        link_enabled=True,
        status="ACTIVE",
        judge_score=judge_score,
        starting_total_snapshot=0,
    )
    db.session.add(entry)
    db.session.flush()
    return entry
