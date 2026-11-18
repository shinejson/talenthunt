import json

from flask import Blueprint, request

from app.extensions import db, limiter
from app.integrations.storage.local_storage import save_uploaded_media
from app.models.application import Application
from app.policies.rbac import get_current_user, login_required
from app.schemas import DomainError
from app.services.submission_service import (
    create_application,
    create_guest_application,
    list_open_competitions,
    track_application,
    update_or_resubmit_application,
)
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
