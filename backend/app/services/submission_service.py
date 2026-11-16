from urllib.parse import urlparse

from app.extensions import db
from app.models.application import Application, MediaAsset, Submission
from app.models.competition import Category, Competition
from app.models.user import User
from app.schemas import ApplicationCreateSchema, DomainError, validate_payload
from app.services.audit_service import log_audit
from app.services.auth_service import grant_role
from app.services.notification_service import notify_user
from app.utils.security import generate_reference
from app.utils.time_utils import utcnow

ALLOWED_VIDEO_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "youtu.be",
    "vimeo.com",
    "www.vimeo.com",
    "player.vimeo.com",
    "audiomack.com",
    "soundcloud.com",
}


def _validate_external_video_url(url: str | None) -> str | None:
    if not url:
        return None
    cleaned = url.strip()
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise DomainError("INVALID_DEMO_URL", "Demo URL must be a valid HTTP/HTTPS URL.", 422, {"external_video_url": ["Enter a valid URL."]})
    host = parsed.netloc.lower().split(":")[0]
    if not any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_VIDEO_HOSTS):
        raise DomainError(
            "UNAPPROVED_DEMO_HOST",
            "External demo URL must be hosted on YouTube, Vimeo, SoundCloud, or Audiomack.",
            422,
            {"external_video_url": ["Use an approved video/audio platform URL or upload a demo file directly."]},
        )
    return cleaned


def create_application(user: User, raw_payload: dict) -> Application:
    data = validate_payload(ApplicationCreateSchema, raw_payload)
    if not data.get("consent_accepted") or not data.get("rights_declaration"):
        raise DomainError(
            "CONSENT_REQUIRED",
            "You must accept the competition rules, privacy notice, and content rights declaration.",
            422,
        )

    comp = db.session.get(Competition, data["competition_id"])
    if not comp or comp.status not in ("APPLICATIONS_OPEN", "PUBLISHED", "VOTING"):
        raise DomainError("COMPETITION_CLOSED", "This competition is not currently accepting applications.", 400)

    now = utcnow()
    if comp.applications_open_at and now < comp.applications_open_at:
        raise DomainError("APPLICATIONS_NOT_OPEN", "Applications have not opened yet for this competition.", 400)
    if comp.applications_close_at and now > comp.applications_close_at:
        raise DomainError("DEADLINE_PASSED", "The application deadline for this competition has passed.", 400)

    category = db.session.get(Category, data["category_id"])
    if not category or category.competition_id != comp.id or category.status != "ACTIVE":
        raise DomainError("INVALID_CATEGORY", "Selected category is invalid for this competition.", 422)

    existing = Application.query.filter(
        Application.user_id == user.id,
        Application.competition_id == comp.id,
        Application.category_id == category.id,
        Application.status != "WITHDRAWN",
    ).first()
    if existing:
        raise DomainError(
            "DUPLICATE_APPLICATION",
            "You have already submitted an application in this competition and category.",
            409,
        )

    if data.get("is_minor") and comp.require_guardian_for_minors:
        if not data.get("guardian_consent") or not (data.get("guardian_name") or "").strip() or not (data.get("guardian_contact") or "").strip():
            raise DomainError(
                "GUARDIAN_CONSENT_REQUIRED",
                "Minor applicants must provide parent/guardian name, contact, and consent.",
                422,
            )

    ext_url = _validate_external_video_url(data.get("external_video_url"))
    media_asset_id = data.get("media_asset_id")
    if media_asset_id:
        asset = db.session.get(MediaAsset, media_asset_id)
        if not asset or asset.owner_user_id != user.id or asset.scan_status != "CLEAN":
            raise DomainError("INVALID_MEDIA", "Uploaded media asset was not found or did not pass security checks.", 422)

    if not ext_url and not media_asset_id:
        raise DomainError(
            "DEMO_REQUIRED",
            "Upload a demo media file or supply an approved video/audio URL.",
            422,
        )

    ref_no = generate_reference("APP")
    while Application.query.filter_by(reference_no=ref_no).first():
        ref_no = generate_reference("APP")

    app_rec = Application(
        user_id=user.id,
        competition_id=comp.id,
        category_id=category.id,
        reference_no=ref_no,
        stage_name=(data.get("stage_name") or "").strip() or user.full_name,
        contact_email=(data.get("contact_email") or "").strip() or user.email,
        contact_phone=(data.get("contact_phone") or "").strip() or user.phone,
        location=(data.get("location") or "").strip() or user.location,
        is_minor=bool(data.get("is_minor")),
        guardian_name=(data.get("guardian_name") or "").strip() or None,
        guardian_contact=(data.get("guardian_contact") or "").strip() or None,
        guardian_consent=bool(data.get("guardian_consent")),
        status="SUBMITTED",
    )
    db.session.add(app_rec)
    db.session.flush()

    submission = Submission(
        application_id=app_rec.id,
        version_no=1,
        title=data["title"].strip(),
        description=data["description"].strip(),
        biography=(data.get("biography") or "").strip() or user.bio,
        media_asset_id=media_asset_id,
        external_video_url=ext_url,
        consent_accepted=True,
        rights_declaration=True,
    )
    db.session.add(submission)

    grant_role(user, "APPLICANT")

    notify_user(
        user_id=user.id,
        notif_type="SUBMISSION_RECEIVED",
        title=f"Application Received ({ref_no})",
        body=f"Your demo '{submission.title}' for {comp.title} ({category.name}) has been submitted and is awaiting review.",
        action_url=f"/portal/submissions/{app_rec.id}",
    )
    log_audit(
        actor_user_id=user.id,
        action="APPLICATION_SUBMITTED",
        entity_type="application",
        entity_id=app_rec.id,
        after={"reference_no": ref_no, "competition_id": comp.id, "category_id": category.id},
    )
    db.session.commit()
    return app_rec


def update_or_resubmit_application(user: User, application_id: str, payload: dict) -> Application:
    app_rec = db.session.get(Application, application_id)
    if not app_rec or app_rec.user_id != user.id:
        raise DomainError("NOT_FOUND", "Application not found.", 404)

    if app_rec.status not in ("SUBMITTED", "CHANGES_REQUESTED"):
        raise DomainError(
            "EDIT_NOT_ALLOWED",
            f"Applications in status '{app_rec.status}' cannot be edited.",
            400,
        )

    comp = app_rec.competition
    if comp and comp.applications_close_at and utcnow() > comp.applications_close_at:
        raise DomainError("DEADLINE_PASSED", "The resubmission deadline has passed.", 400)

    latest = app_rec.latest_submission
    title = (payload.get("title") or (latest.title if latest else "")).strip()
    description = (payload.get("description") or (latest.description if latest else "")).strip()
    biography = payload.get("biography") if "biography" in payload else (latest.biography if latest else None)
    if len(title) < 3 or len(description) < 10:
        raise DomainError("VALIDATION_ERROR", "Title (min 3 chars) and description (min 10 chars) are required.", 422)

    ext_url = latest.external_video_url if latest else None
    if "external_video_url" in payload:
        ext_url = _validate_external_video_url(payload.get("external_video_url"))

    media_asset_id = payload.get("media_asset_id") or (latest.media_asset_id if latest else None)
    if payload.get("media_asset_id"):
        asset = db.session.get(MediaAsset, payload["media_asset_id"])
        if not asset or asset.owner_user_id != user.id or asset.scan_status != "CLEAN":
            raise DomainError("INVALID_MEDIA", "Invalid media asset.", 422)

    if payload.get("stage_name"):
        app_rec.stage_name = payload["stage_name"].strip()
    if payload.get("location") is not None:
        app_rec.location = payload["location"].strip() or None

    next_version = (latest.version_no + 1) if latest else 1
    new_sub = Submission(
        application_id=app_rec.id,
        version_no=next_version,
        title=title,
        description=description,
        biography=biography.strip() if isinstance(biography, str) else biography,
        media_asset_id=media_asset_id,
        external_video_url=ext_url,
        consent_accepted=True,
        rights_declaration=True,
    )
    db.session.add(new_sub)
    was_changes_requested = app_rec.status == "CHANGES_REQUESTED"
    app_rec.status = "SUBMITTED"

    log_audit(
        actor_user_id=user.id,
        action="APPLICATION_RESUBMITTED" if was_changes_requested else "APPLICATION_UPDATED",
        entity_type="application",
        entity_id=app_rec.id,
        after={"version_no": next_version, "status": app_rec.status},
    )
    db.session.commit()
    db.session.refresh(app_rec)
    return app_rec


def moderate_submission_content(actor: User, application_id: str, moderation_status: str, reason: str) -> Application:
    if moderation_status not in ("VISIBLE", "HIDDEN", "ARCHIVED", "REMOVED"):
        raise DomainError("INVALID_STATUS", "Invalid moderation status.", 422)
    if not (reason or "").strip():
        raise DomainError("REASON_REQUIRED", "A moderation reason is required.", 422)

    app_rec = db.session.get(Application, application_id)
    if not app_rec or not app_rec.latest_submission:
        raise DomainError("NOT_FOUND", "Submission not found.", 404)

    sub = app_rec.latest_submission
    before_state = {"moderation_status": sub.moderation_status, "is_hidden": sub.is_hidden}
    sub.moderation_status = moderation_status
    sub.is_hidden = moderation_status != "VISIBLE"
    sub.moderation_reason = reason.strip()

    log_audit(
        actor_user_id=actor.id,
        action="SUBMISSION_MODERATED",
        entity_type="submission",
        entity_id=sub.id,
        before=before_state,
        after={"moderation_status": sub.moderation_status, "is_hidden": sub.is_hidden, "reason": sub.moderation_reason},
    )
    db.session.commit()
    return app_rec
