from flask import Blueprint, current_app, g, request

from app.extensions import db, limiter
from app.policies.rbac import compute_user_permissions, get_current_user, login_required
from app.schemas import DomainError
from app.services.audit_service import log_audit
from app.services.auth_service import (
    change_password,
    complete_password_reset,
    confirm_2fa,
    disable_2fa,
    list_user_sessions,
    login_user,
    logout_current_user,
    ping_session,
    regenerate_backup_codes,
    register_user,
    resend_verification_code,
    revoke_all_other_sessions,
    revoke_user_session,
    setup_2fa,
    start_password_reset,
    update_session_timeout,
    verify_2fa_login,
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
@limiter.limit("60 per minute")
def login():
    payload = request.get_json(silent=True) or {}
    user, token, requires_2fa, temp_token = login_user(payload)
    if requires_2fa:
        return api_success(
            {
                "requires_2fa": True,
                "two_factor_temp_token": temp_token,
                "user_id": user.id,
            }
        )
    return api_success(
        {
            "user": user.to_dict(include_private=True),
            "permissions": compute_user_permissions(user),
            "token": token,
        }
    )


@auth_bp.post("/2fa/verify")
@limiter.limit("15 per minute")
def verify_two_factor_login():
    payload = request.get_json(silent=True) or {}
    temp_token = payload.get("two_factor_temp_token") or ""
    code = payload.get("code") or payload.get("backup_code") or ""
    user, token = verify_2fa_login(temp_token, code)
    return api_success(
        {
            "user": user.to_dict(include_private=True),
            "permissions": compute_user_permissions(user),
            "token": token,
        }
    )


@auth_bp.post("/2fa/setup")
@login_required
def initiate_2fa_setup():
    user = get_current_user()
    data = setup_2fa(user)
    return api_success(data)


@auth_bp.post("/2fa/confirm")
@login_required
def confirm_two_factor():
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    code = payload.get("code") or ""
    data = confirm_2fa(user, code)
    return api_success(data)


@auth_bp.post("/2fa/disable")
@login_required
def disable_two_factor():
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    disable_2fa(user, password=payload.get("password"), code=payload.get("code"))
    return api_success({"disabled": True, "message": "Two-factor authentication disabled."})


@auth_bp.post("/2fa/backup-codes")
@login_required
def get_new_backup_codes():
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    codes = regenerate_backup_codes(user, password=payload.get("password"), code=payload.get("code"))
    return api_success({"backup_codes": codes, "message": "New backup codes generated."})


@auth_bp.get("/sessions")
@login_required
def get_active_sessions():
    user = get_current_user()
    cur_sid = getattr(g, "current_session_id", None)
    sessions = list_user_sessions(user, cur_sid)
    return api_success({"sessions": sessions, "current_session_id": cur_sid})


@auth_bp.delete("/sessions/<session_id>")
@login_required
def terminate_session(session_id: str):
    user = get_current_user()
    revoked = revoke_user_session(user, session_id)
    return api_success({"revoked": revoked})


@auth_bp.post("/sessions/logout-others")
@login_required
def logout_other_sessions():
    user = get_current_user()
    cur_sid = getattr(g, "current_session_id", None)
    count = revoke_all_other_sessions(user, cur_sid)
    return api_success({"revoked_count": count, "message": f"Successfully signed out {count} other session(s)."})


@auth_bp.post("/session/ping")
@login_required
def session_ping():
    user = get_current_user()
    cur_sid = getattr(g, "current_session_id", None)
    info = ping_session(user, cur_sid)
    return api_success(info)


@auth_bp.post("/session-timeout")
@login_required
def set_session_timeout():
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    mins = update_session_timeout(user, payload.get("timeout_minutes", 30))
    return api_success({"session_timeout_minutes": mins})


@auth_bp.post("/logout")
def logout():
    user = get_current_user()
    logout_current_user(user, getattr(g, "current_session_id", None))
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
