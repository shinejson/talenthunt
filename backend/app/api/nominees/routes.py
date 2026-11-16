from flask import Blueprint, Response, request

from app.extensions import db
from app.models.nominee import Nominee
from app.policies.rbac import get_current_user, roles_required
from app.schemas import DomainError
from app.services.audit_service import log_audit
from app.services.voting_service import build_nominee_dashboard
from app.utils.responses import api_success
from app.utils.security import generate_qr_data_uri, generate_qr_png_bytes

nominees_bp = Blueprint("nominees_portal", __name__, url_prefix="/nominee")


def _get_owned_nominee(user) -> Nominee:
    nominee = (
        Nominee.query.filter_by(user_id=user.id)
        .order_by(Nominee.nominated_at.desc())
        .first()
    )
    if not nominee:
        raise DomainError("NOT_A_NOMINEE", "No nominee profile is associated with your account.", 404)
    return nominee


@nominees_bp.get("/dashboard")
@roles_required("NOMINEE")
def nominee_dashboard():
    user = get_current_user()
    dash = build_nominee_dashboard(user)
    full_url = request.host_url.rstrip("/") + dash["voting_path"]
    dash["voting_url"] = full_url
    dash["qr_data_uri"] = generate_qr_data_uri(full_url)
    return api_success(dash)


@nominees_bp.patch("/profile")
@roles_required("NOMINEE")
def update_nominee_profile():
    user = get_current_user()
    nominee = _get_owned_nominee(user)
    payload = request.get_json(silent=True) or {}

    before = {
        "tagline": nominee.tagline,
        "profile_text": nominee.profile_text,
        "location": nominee.location,
        "social_links": nominee.social_links,
    }

    if "tagline" in payload:
        nominee.tagline = (payload.get("tagline") or "").strip()[:220] or None
    if "profile_text" in payload:
        nominee.profile_text = (payload.get("profile_text") or "").strip()[:3000] or None
    if "location" in payload:
        nominee.location = (payload.get("location") or "").strip()[:150] or None
    if "social_links" in payload and isinstance(payload["social_links"], dict):
        cleaned_links = {}
        for key in ("instagram", "tiktok", "youtube", "twitter", "facebook", "website"):
            val = payload["social_links"].get(key)
            if val and isinstance(val, str):
                cleaned_links[key] = val.strip()[:200]
        nominee.social_links = cleaned_links

    log_audit(
        actor_user_id=user.id,
        action="NOMINEE_PROFILE_UPDATED",
        entity_type="nominee",
        entity_id=nominee.id,
        before=before,
        after={"tagline": nominee.tagline, "location": nominee.location},
    )
    db.session.commit()
    return api_success(nominee.to_public_dict())


@nominees_bp.get("/voting-link")
@roles_required("NOMINEE")
def get_nominee_voting_link():
    user = get_current_user()
    dash = build_nominee_dashboard(user)
    full_url = request.host_url.rstrip("/") + dash["voting_path"]
    return api_success(
        {
            "voting_slug": dash["voting_slug"],
            "voting_path": dash["voting_path"],
            "voting_url": full_url,
            "qr_data_uri": generate_qr_data_uri(full_url),
            "qr_download_url": "/api/v1/nominee/voting-link/qr.png",
            "current_round": dash["current_round"],
            "nominee": dash["nominee"],
        }
    )


@nominees_bp.get("/voting-link/qr.png")
@roles_required("NOMINEE")
def download_nominee_qr():
    user = get_current_user()
    dash = build_nominee_dashboard(user)
    full_url = request.host_url.rstrip("/") + dash["voting_path"]
    png = generate_qr_png_bytes(full_url)
    return Response(
        png,
        mimetype="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="stagelight-vote-{dash["voting_slug"]}.png"'
        },
    )


@nominees_bp.get("/rounds")
@roles_required("NOMINEE")
def get_nominee_rounds():
    user = get_current_user()
    dash = build_nominee_dashboard(user)
    return api_success(
        {
            "nominee_status": dash["nominee"]["status"],
            "current_round": dash["current_round"],
            "round_history": dash["round_history"],
        }
    )
