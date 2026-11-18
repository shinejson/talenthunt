import json

from flask import Blueprint, request

from app.extensions import db, limiter
from app.integrations.storage.local_storage import save_uploaded_media
from app.models.application import Application, ApplicationPayment
from app.models.competition import Competition
from app.policies.rbac import get_current_user, login_required
from app.schemas import DomainError
from app.services.submission_service import (
    create_application,
    create_guest_application,
    list_open_competitions,
    track_application,
    update_or_resubmit_application,
)
from app.utils.security import generate_reference
from app.utils.time_utils import iso_utc, utcnow
from app.utils.responses import api_success

submissions_bp = Blueprint("submissions", __name__, url_prefix="/applications")


@submissions_bp.get("/options")
def application_options():
    return api_success(list_open_competitions())


@submissions_bp.post("/guest")
@limiter.limit("5 per minute")
def submit_guest_application():
    if request.mimetype != "multipart/form-data":
        raise DomainError("MULTIPART_REQUIRED", "Send the application and uploads as multipart form data.", 415)
    forms = request.form.getlist("application")
    if len(forms) != 1 or len(forms[0]) > 32_000:
        raise DomainError("INVALID_FORM", "Application form details are missing or too large.", 422)
    try:
        payload = json.loads(forms[0])
    except (ValueError, RecursionError) as exc:
        raise DomainError("INVALID_FORM", "Application form details are not valid.", 422) from exc
    for field in request.files:
        if field not in {"photo", "demo_video_1", "demo_video_2"} or len(request.files.getlist(field)) != 1:
            raise DomainError("INVALID_UPLOADS", "Upload at most one photo and two demo videos in the designated fields.", 422)
    application = create_guest_application(payload, request.files)
    response, status = api_success(application.to_tracking_dict(), status_code=201)
    response.headers["Cache-Control"] = "no-store"
    return response, status


@submissions_bp.post("/track")
@limiter.limit("20 per minute")
def track_guest_application():
    payload = request.get_json(silent=True) or {}
    response, status = api_success(track_application(payload))
    response.headers["Cache-Control"] = "no-store"
    return response, status


@submissions_bp.post("/payment/initialize")
@limiter.limit("30 per minute")
def initialize_application_payment():
    payload = request.get_json(silent=True) or {}
    comp_id = (payload.get("competition_id") or "").strip()
    comp = db.session.get(Competition, comp_id)
    if not comp:
        raise DomainError("NOT_FOUND", "Competition not found.", 404)

    email = (payload.get("applicant_email") or "").strip().lower()
    if not email or "@" not in email:
        raise DomainError("VALIDATION_ERROR", "A valid applicant email address is required.", 422)

    phone = (payload.get("applicant_phone") or "").strip()
    name = (payload.get("applicant_name") or "").strip()
    category_id = payload.get("category_id")
    network = (payload.get("network") or "MTN Mobile Money").strip()
    channel = (payload.get("channel") or "mobile_money").strip()

    fee_minor = comp.application_fee_minor if comp.application_fee_minor is not None else 5000
    ref = generate_reference("APPREF", length=8)
    while ApplicationPayment.query.filter_by(payment_reference=ref).first():
        ref = generate_reference("APPREF", length=8)

    code = generate_reference("APPPAY", length=8)
    while ApplicationPayment.query.filter_by(payment_code=code).first():
        code = generate_reference("APPPAY", length=8)

    pay = ApplicationPayment(
        competition_id=comp.id,
        category_id=category_id,
        applicant_name=name or None,
        applicant_email=email,
        applicant_phone=phone or None,
        network=network,
        channel=channel,
        payment_reference=ref,
        payment_code=code,
        amount_minor=fee_minor,
        currency=comp.currency or "GHS",
        status="INITIALIZED",
    )
    db.session.add(pay)
    db.session.commit()

    return api_success(
        {
            "id": pay.id,
            "payment_reference": pay.payment_reference,
            "payment_code": pay.payment_code,
            "amount_minor": pay.amount_minor,
            "amount_major": round(pay.amount_minor / 100.0, 2),
            "currency": pay.currency,
            "network": pay.network,
            "channel": pay.channel,
            "status": pay.status,
            "competition_title": comp.title,
        },
        status_code=201,
    )


@submissions_bp.post("/payment/complete")
@limiter.limit("30 per minute")
def complete_application_payment():
    payload = request.get_json(silent=True) or {}
    ref = (payload.get("payment_reference") or payload.get("payment_code") or "").strip().upper()
    pay = ApplicationPayment.query.filter(
        db.or_(ApplicationPayment.payment_reference == ref, ApplicationPayment.payment_code == ref)
    ).first()
    if not pay:
        raise DomainError("NOT_FOUND", "Application payment reference not found.", 404)

    outcome = (payload.get("outcome") or "SUCCESS").strip().upper()
    bounced_reason = payload.get("bounced_reason") or payload.get("reason")

    if outcome in ("BOUNCED", "FAILED", "DECLINED"):
        pay.status = "BOUNCED"
        pay.bounced_reason = (
            bounced_reason
            or f"Payment authorization failed on {pay.network} ({pay.applicant_phone or 'wallet'}). Insufficient funds, network timeout, or user cancelled."
        )
        db.session.commit()
        return api_success(
            {
                "status": "BOUNCED",
                "payment_reference": pay.payment_reference,
                "bounced_reason": pay.bounced_reason,
                "network": pay.network,
                "can_retry": True,
            }
        )

    # Success
    pay.status = "SUCCESS"
    pay.bounced_reason = None
    pay.paid_at = utcnow()
    db.session.commit()

    return api_success(
        {
            "status": "SUCCESS",
            "payment_reference": pay.payment_reference,
            "payment_code": pay.payment_code,
            "amount_major": round(pay.amount_minor / 100.0, 2),
            "currency": pay.currency,
            "paid_at": iso_utc(pay.paid_at),
        }
    )


@submissions_bp.post("/payment/verify-code")
def verify_application_payment_code():
    payload = request.get_json(silent=True) or {}
    code = (payload.get("payment_code") or "").strip().upper()
    comp_id = (payload.get("competition_id") or "").strip()

    if not code:
        raise DomainError("VALIDATION_ERROR", "Payment code is required.", 422)

    pay = ApplicationPayment.query.filter_by(payment_code=code).first()
    if not pay:
        raise DomainError("INVALID_CODE", "Verification code not found. Please verify the code or make a payment.", 404)

    if comp_id and pay.competition_id != comp_id:
        raise DomainError("MISMATCH_COMPETITION", "This payment code was issued for a different competition.", 422)

    if pay.status != "SUCCESS":
        status_msg = "payment has bounced or failed" if pay.status == "BOUNCED" else "payment is not yet completed"
        raise DomainError("UNPAID_CODE", f"This verification code cannot be used because {status_msg}.", 422)

    if pay.is_redeemed:
        raise DomainError("CODE_ALREADY_USED", "This verification code has already been applied to another application.", 409)

    return api_success(
        {
            "valid": True,
            "payment_code": pay.payment_code,
            "payment_reference": pay.payment_reference,
            "amount_major": round(pay.amount_minor / 100.0, 2),
            "currency": pay.currency,
            "status": pay.status,
            "applicant_name": pay.applicant_name,
            "applicant_email": pay.applicant_email,
        }
    )


@submissions_bp.get("/payment/<reference>/status")
def get_application_payment_status(reference: str):
    ref = reference.strip().upper()
    pay = ApplicationPayment.query.filter(
        db.or_(ApplicationPayment.payment_reference == ref, ApplicationPayment.payment_code == ref)
    ).first()
    if not pay:
        raise DomainError("NOT_FOUND", "Payment reference not found.", 404)

    return api_success(pay.to_dict())


@submissions_bp.post("/media")
@login_required
@limiter.limit("15 per minute")
def upload_standalone_media():
    user = get_current_user()
    file_obj = request.files.get("file")
    asset = save_uploaded_media(file_obj, user.id)
    db.session.commit()
    return api_success(asset.to_dict(), status_code=201)


@submissions_bp.post("")
@login_required
@limiter.limit("10 per minute")
def submit_application():
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    app_rec = create_application(user, payload)
    return api_success(app_rec.to_dict(include_internal=False), status_code=201)


@submissions_bp.get("/mine")
@login_required
def my_applications():
    user = get_current_user()
    apps = (
        Application.query.filter_by(user_id=user.id)
        .order_by(Application.submitted_at.desc())
        .all()
    )
    return api_success([a.to_dict(include_internal=False) for a in apps])


@submissions_bp.get("/<application_id>")
@login_required
def get_own_application(application_id: str):
    user = get_current_user()
    app_rec = db.session.get(Application, application_id)
    if not app_rec or app_rec.user_id != user.id:
        raise DomainError("NOT_FOUND", "Application not found.", 404)
    return api_success(app_rec.to_dict(include_internal=False))


@submissions_bp.patch("/<application_id>")
@login_required
def patch_own_application(application_id: str):
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    updated = update_or_resubmit_application(user, application_id, payload)
    return api_success(updated.to_dict(include_internal=False))


@submissions_bp.post("/<application_id>/media")
@login_required
@limiter.limit("15 per minute")
def attach_application_media(application_id: str):
    user = get_current_user()
    app_rec = db.session.get(Application, application_id)
    if not app_rec or app_rec.user_id != user.id:
        raise DomainError("NOT_FOUND", "Application not found.", 404)
    if app_rec.status not in ("SUBMITTED", "CHANGES_REQUESTED"):
        raise DomainError("EDIT_NOT_ALLOWED", "Media can only be uploaded when submission is editable.", 400)

    file_obj = request.files.get("file")
    asset = save_uploaded_media(file_obj, user.id)
    latest = app_rec.latest_submission
    if latest:
        latest.media_asset_id = asset.id
    db.session.commit()
    return api_success({"media_asset": asset.to_dict(), "application": app_rec.to_dict(include_internal=False)}, status_code=201)
