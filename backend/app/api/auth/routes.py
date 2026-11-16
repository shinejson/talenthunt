from flask import Blueprint, current_app, request

from app.extensions import db, limiter
from app.policies.rbac import compute_user_permissions, get_current_user, login_required
from app.schemas import DomainError
from app.services.audit_service import log_audit
from app.services.auth_service import (
    change_password,
    complete_password_reset,
    login_user,
    logout_current_user,
    register_user,
    resend_verification_code,
    start_password_reset,
    verify_user_contact,
)
from app.utils.responses import api_success

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


@auth_bp.post("/register")
@limiter.limit("10 per minute")
def register():
    payload = request.get_json(silent=True) or {}
    user, token, code = register_user(payload)
    resp = {
        "user": user.to_dict(include_private=True),
        "permissions": compute_user_permissions(user),
        "token": token,
    }
    # Surface sandbox verification preview only in dev/test when no external SMS/SMTP provider is live
    if current_app.config.get("PAYMENT_PROVIDER") == "mock":
        resp["verification_code_preview"] = code
    return api_success(resp, status_code=201)


@auth_bp.post("/login")
@limiter.limit("15 per minute")
def login():
    payload = request.get_json(silent=True) or {}
    user, token = login_user(payload)
    return api_success(
        {
            "user": user.to_dict(include_private=True),
            "permissions": compute_user_permissions(user),
            "token": token,
        }
    )


@auth_bp.post("/logout")
def logout():
    user = get_current_user()
    logout_current_user(user)
    return api_success({"logged_out": True})


@auth_bp.get("/me")
@login_required
def me():
    user = get_current_user()
    return api_success(
        {
            "user": user.to_dict(include_private=True),
            "permissions": compute_user_permissions(user),
        }
    )


@auth_bp.post("/verify-contact")
@login_required
@limiter.limit("10 per minute")
def verify_contact():
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    updated = verify_user_contact(user, payload.get("code", ""))
    return api_success({"user": updated.to_dict(include_private=True)})


@auth_bp.post("/resend-verification")
@login_required
@limiter.limit("5 per minute")
def resend_verification():
    user = get_current_user()
    code = resend_verification_code(user)
    out = {"sent": True}
    if current_app.config.get("PAYMENT_PROVIDER") == "mock":
        out["verification_code_preview"] = code
    return api_success(out)


@auth_bp.post("/forgot-password")
@limiter.limit("5 per minute")
def forgot_password():
    payload = request.get_json(silent=True) or {}
    token = start_password_reset(payload.get("identifier") or payload.get("email") or "")
    out = {"message": "If an active account matches that contact, password reset instructions have been sent."}
    if token and current_app.config.get("PAYMENT_PROVIDER") == "mock":
        out["reset_token_preview"] = token
    return api_success(out)


@auth_bp.post("/reset-password")
@limiter.limit("5 per minute")
def reset_password():
    payload = request.get_json(silent=True) or {}
    complete_password_reset(payload.get("token", ""), payload.get("new_password", ""))
    return api_success({"reset": True, "message": "Password updated. You may now sign in."})


@auth_bp.patch("/profile")
@login_required
def update_profile():
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    before = {"full_name": user.full_name, "location": user.location, "bio": user.bio}

    if "full_name" in payload:
        name = (payload.get("full_name") or "").strip()
        if len(name) < 2:
            raise DomainError("VALIDATION_ERROR", "Full name must be at least 2 characters.", 422)
        user.full_name = name
    if "location" in payload:
        user.location = (payload.get("location") or "").strip() or None
    if "bio" in payload:
        user.bio = (payload.get("bio") or "").strip() or None

    log_audit(
        actor_user_id=user.id,
        action="USER_PROFILE_UPDATED",
        entity_type="user",
        entity_id=user.id,
        before=before,
        after={"full_name": user.full_name, "location": user.location},
    )
    db.session.commit()
    return api_success({"user": user.to_dict(include_private=True)})


@auth_bp.post("/change-password")
@login_required
def update_password():
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    new_token = change_password(
        user,
        payload.get("current_password", ""),
        payload.get("new_password", ""),
    )
    return api_success({"changed": True, "token": new_token})


@auth_bp.post("/deactivate")
@login_required
def deactivate_account():
    user = get_current_user()
    if "SUPER_ADMIN" in user.role_names:
        raise DomainError("FORBIDDEN", "Super Admin accounts cannot self-deactivate.", 400)
    user.status = "DEACTIVATED"
    user.token_version += 1
    log_audit(actor_user_id=user.id, action="ACCOUNT_DEACTIVATED", entity_type="user", entity_id=user.id)
    db.session.commit()
    logout_current_user(None)
    return api_success({"deactivated": True})
