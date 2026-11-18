from contextlib import ExitStack
from urllib.parse import urlparse

from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.integrations.storage.local_storage import remove_stored_media, save_application_video, save_uploaded_profile_image
from app.models.application import Application, ApplicationPayment, MediaAsset, Submission
from app.models.competition import APPLICATION_ENTRY_STATUSES, Category, Competition
from app.models.user import User
from app.schemas import ApplicationCreateSchema, ApplicationTrackingSchema, DomainError, GuestApplicationSchema, validate_payload
from app.services.audit_service import log_audit
from app.services.auth_service import grant_role
from app.services.notification_service import notify_user
from app.utils.security import generate_reference
from app.utils.time_utils import iso_utc, utcnow

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
    try:
        parsed = urlparse(cleaned)
        host = parsed.hostname
    except ValueError:
        host = None
    if not host or parsed.scheme not in ("http", "https") or parsed.username is not None or "\\" in cleaned:
        raise DomainError("INVALID_DEMO_URL", "Demo URL must be a valid HTTP/HTTPS URL.", 422, {"external_video_url": ["Enter a valid URL."]})
    if not any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_VIDEO_HOSTS):
        raise DomainError(
            "UNAPPROVED_DEMO_HOST",
            "External demo URL must be hosted on YouTube, Vimeo, SoundCloud, or Audiomack.",
            422,
            {"external_video_url": ["Use an approved video/audio platform URL or upload a demo file directly."]},
        )
    return cleaned


def _validate_application_entry(data: dict) -> tuple[Competition, Category]:
    if not data.get("consent_accepted") or not data.get("rights_declaration"):
        raise DomainError(
            "CONSENT_REQUIRED",
            "You must accept the competition rules, privacy notice, and content rights declaration.",
            422,
        )

    comp = db.session.get(Competition, data["competition_id"])
    if not comp or comp.status not in APPLICATION_ENTRY_STATUSES:
        raise DomainError("COMPETITION_CLOSED", "This competition is not currently accepting applications.", 400)

    now = utcnow()
    if comp.applications_open_at and now < comp.applications_open_at:
        raise DomainError("APPLICATIONS_NOT_OPEN", "Applications have not opened yet for this competition.", 400)
    if comp.applications_close_at and now > comp.applications_close_at:
        raise DomainError("DEADLINE_PASSED", "The application deadline for this competition has passed.", 400)

    category = db.session.get(Category, data["category_id"])
    if not category or category.competition_id != comp.id or category.status != "ACTIVE":
        raise DomainError("INVALID_CATEGORY", "Selected category is invalid for this competition.", 422)

    if data.get("is_minor") and comp.require_guardian_for_minors:
        if not data.get("guardian_consent") or not (data.get("guardian_name") or "").strip() or not (data.get("guardian_contact") or "").strip():
            raise DomainError(
                "GUARDIAN_CONSENT_REQUIRED",
                "Minor applicants must provide parent/guardian name, contact, and consent.",
                422,
            )

    return comp, category


def _new_application_reference(length=8):
    reference = generate_reference("APP", length=length)
    while Application.query.filter_by(reference_no=reference).first():
        reference = generate_reference("APP", length=length)
    return reference


def list_open_competitions():
    now = utcnow()
    competitions = Competition.query.filter(Competition.status.in_(APPLICATION_ENTRY_STATUSES)).order_by(Competition.created_at.desc()).all()
    result = []
    for comp in competitions:
        categories = [c.to_dict() for c in comp.categories if c.status == "ACTIVE"]
        if categories and comp.accepts_applications(now):
            result.append({
                "id": comp.id, "title": comp.title, "slug": comp.slug, "categories": categories,
                "applications_close_at": iso_utc(comp.applications_close_at),
                "require_guardian_for_minors": comp.require_guardian_for_minors,
                "application_fee_minor": comp.application_fee_minor if comp.application_fee_minor is not None else 5000,
                "application_fee_major": round((comp.application_fee_minor if comp.application_fee_minor is not None else 5000) / 100.0, 2),
                "currency": comp.currency or "GHS",
            })
    return result


def create_guest_application(raw_payload: dict, files) -> Application:
    data = validate_payload(GuestApplicationSchema, raw_payload)
    today = utcnow().date()
    dob = data["date_of_birth"]
    if dob > today or dob.year < 1900:
        raise DomainError("VALIDATION_ERROR", "Enter a valid date of birth.", 422, {"date_of_birth": ["Enter a past date after 1899."]})
    data["is_minor"] = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day)) < 18
    comp, category = _validate_application_entry(data)
    ext_url = _validate_external_video_url(data.get("external_video_url"))
    primary = files.get("demo_video_1")
    if not primary and not ext_url:
        raise DomainError("DEMO_REQUIRED", "Upload your first demo video or enter an approved link.", 422)
    if primary and ext_url:
        raise DomainError("DEMO_SOURCE_CONFLICT", "Choose a file or a link for demo 1, not both.", 422)

    email = data["contact_email"].lower()
    entry = Application.query.filter(
        Application.competition_id == comp.id,
        Application.category_id == category.id,
        db.func.lower(Application.contact_email) == email,
        Application.status != "WITHDRAWN",
    )
    duplicate = DomainError(
        "DUPLICATE_APPLICATION", "An application with this email already exists in this category. Use Track Application or contact support.", 409
    )
    if entry.first():
        raise duplicate

    app_payment = None
    fee_minor = comp.application_fee_minor if comp.application_fee_minor is not None else 0
    if fee_minor > 0:
        pay_code = (data.get("payment_code") or raw_payload.get("payment_code") or "").strip().upper()
        if not pay_code:
            fee_major_str = f"{fee_minor / 100.0:.2f}"
            raise DomainError(
                "PAYMENT_REQUIRED",
                f"An audition application fee of GHS {fee_major_str} is required before submission. Please complete payment and enter your verification code.",
                402,
                {"payment_code": ["Payment verification code is required."]},
            )
        app_payment = ApplicationPayment.query.filter_by(
            payment_code=pay_code,
            competition_id=comp.id,
        ).first()
        if not app_payment or app_payment.status != "SUCCESS":
            raise DomainError(
                "PAYMENT_INVALID",
                "The payment verification code is invalid, unpaid, or bounced. Please verify payment or retry.",
                422,
                {"payment_code": ["Invalid or unpaid verification code."]},
            )
        if app_payment.is_redeemed:
            raise DomainError(
                "PAYMENT_ALREADY_REDEEMED",
                "This payment verification code has already been applied to another application submission.",
                409,
                {"payment_code": ["Code already used."]},
            )

    reference = _new_application_reference(length=20)
    try:
        with ExitStack() as cleanup:
            def store(field, saver):
                file = files.get(field)
                if not file:
                    return None
                try:
                    asset = saver(file)
                except DomainError as exc:
                    raise DomainError(exc.code, exc.message, exc.status_code, {field: [exc.message]}) from exc
                cleanup.callback(remove_stored_media, asset)
                return asset

            photo = store("photo", lambda f: save_uploaded_profile_image(f, None, private=True))
            first_video = store("demo_video_1", save_application_video)
            second_video = store("demo_video_2", save_application_video)
            app_rec = Application(
                competition_id=comp.id,
                category_id=category.id,
                reference_no=reference,
                applicant_full_name=data["full_name"],
                date_of_birth=dob,
                is_group=data["is_group"],
                group_name=data.get("group_name") or None,
                group_member_count=data.get("group_member_count"),
                profile_image=photo,
                stage_name=data.get("stage_name") or data.get("group_name") or data["full_name"],
                contact_email=email,
                contact_phone=data["contact_phone"],
                location=data["location"],
                genre=data.get("genre") or None,
                is_minor=data["is_minor"],
                guardian_name=(data.get("guardian_name") or None) if data["is_minor"] else None,
                guardian_contact=(data.get("guardian_contact") or None) if data["is_minor"] else None,
                guardian_consent=data["is_minor"] and data["guardian_consent"],
                payment_code=app_payment.payment_code if app_payment else None,
                payment_reference=app_payment.payment_reference if app_payment else None,
                payment_amount_minor=app_payment.amount_minor if app_payment else 0,
                payment_status="PAID" if app_payment else "EXEMPT",
            )
            db.session.add(app_rec)
            app_rec.submissions.append(Submission(
                title=data["title"], description=data["description"], biography=data.get("biography") or None,
                media_asset=first_video, second_media_asset=second_video, external_video_url=ext_url,
                consent_accepted=True, rights_declaration=True,
            ))
            db.session.flush()
            if app_payment:
                app_payment.is_redeemed = True
                app_payment.application_id = app_rec.id
            log_audit(
                actor_user_id=None, action="APPLICATION_SUBMITTED", entity_type="application", entity_id=app_rec.id,
                after={"competition_id": comp.id, "category_id": category.id, "source": "guest", "payment_code": app_payment.payment_code if app_payment else None},
            )
            db.session.commit()
            cleanup.pop_all()  # Committed applications keep their files.
    except IntegrityError:
        db.session.rollback()
        if entry.first():
            raise duplicate from None
        raise
    except Exception:
        db.session.rollback()
        raise
    return app_rec


def track_application(payload: dict) -> dict:
    data = validate_payload(ApplicationTrackingSchema, payload)
    application = Application.query.filter(
        Application.reference_no == data["tracking_code"].strip().upper(),
        Application.contact_email == data["contact_email"].lower(),
        Application.applicant_full_name.isnot(None),
    ).first()
    if not application:
        raise DomainError("APPLICATION_NOT_FOUND", "No application matches that tracking code and email.", 404)
    return application.to_tracking_dict()


def create_application(user: User, raw_payload: dict) -> Application:
    data = validate_payload(ApplicationCreateSchema, raw_payload)
    comp, category = _validate_application_entry(data)
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

    ref_no = _new_application_reference()

    app_rec = Application(
        user_id=user.id,
        competition_id=comp.id,
        category_id=category.id,
        reference_no=ref_no,
        stage_name=(data.get("stage_name") or "").strip() or user.full_name,
        contact_email=(data.get("contact_email") or "").strip() or user.email,
        contact_phone=(data.get("contact_phone") or "").strip() or user.phone,
        location=(data.get("location") or "").strip() or user.location,
        genre=(data.get("genre") or "").strip() or None,
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
        second_media_asset_id=latest.second_media_asset_id if latest else None,
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
