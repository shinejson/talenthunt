from flask import Blueprint, request

from app.extensions import db, limiter
from app.integrations.storage.local_storage import save_uploaded_media
from app.models.application import Application
from app.policies.rbac import get_current_user, login_required
from app.schemas import DomainError
from app.services.submission_service import create_application, update_or_resubmit_application
from app.utils.responses import api_success

submissions_bp = Blueprint("submissions", __name__, url_prefix="/applications")


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
