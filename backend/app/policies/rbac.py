from functools import wraps
from flask import g, request, session

from app.extensions import db
from app.models.user import User
from app.utils.responses import api_error
from app.utils.security import decode_access_token

ADMIN_PORTAL_ROLES = {
    "SUPER_ADMIN",
    "COMPETITION_MANAGER",
    "REVIEWER",
    "MODERATOR",
    "FINANCE_OFFICER",
}


def resolve_request_user() -> User | None:
    if hasattr(g, "_current_user_loaded") and g._current_user_loaded:
        return g.current_user

    user = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        raw_token = auth_header.split(" ", 1)[1].strip()
        payload = decode_access_token(raw_token)
        if payload and payload.get("sub"):
            candidate = db.session.get(User, payload["sub"])
            if (
                candidate
                and candidate.status == "ACTIVE"
                and candidate.token_version == payload.get("ver", 1)
            ):
                user = candidate

    if user is None:
        uid = session.get("user_id")
        tver = session.get("token_version")
        if uid:
            candidate = db.session.get(User, uid)
            if candidate and candidate.status == "ACTIVE" and (tver is None or candidate.token_version == tver):
                user = candidate

    g.current_user = user
    g._current_user_loaded = True
    return user


def get_current_user() -> User | None:
    return resolve_request_user()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = resolve_request_user()
        if not user:
            return api_error("UNAUTHORIZED", "Authentication is required to access this resource.", 401)
        return fn(*args, **kwargs)

    return wrapper


def roles_required(*allowed_roles: str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = resolve_request_user()
            if not user:
                return api_error("UNAUTHORIZED", "Authentication is required to access this resource.", 401)
            if "SUPER_ADMIN" in user.role_names:
                return fn(*args, **kwargs)
            if not user.has_role(*allowed_roles):
                return api_error(
                    "FORBIDDEN",
                    "You do not have permission to perform this action.",
                    403,
                )
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def compute_user_permissions(user: User | None) -> dict:
    if not user:
        return {
            "can_apply": False,
            "is_nominee": False,
            "can_access_admin": False,
            "can_manage_competitions": False,
            "can_review_submissions": False,
            "can_decide_nominations": False,
            "can_moderate": False,
            "can_view_finance": False,
            "can_adjust_votes": False,
            "can_manage_users": False,
        }
    roles = set(user.role_names)
    is_super = "SUPER_ADMIN" in roles
    is_mgr = "COMPETITION_MANAGER" in roles
    return {
        "can_apply": user.status == "ACTIVE",
        "is_nominee": "NOMINEE" in roles,
        "can_access_admin": bool(roles & ADMIN_PORTAL_ROLES),
        "can_manage_competitions": is_super or is_mgr,
        "can_review_submissions": is_super or is_mgr or ("REVIEWER" in roles),
        "can_decide_nominations": is_super or is_mgr,
        "can_moderate": is_super or is_mgr or ("MODERATOR" in roles),
        "can_view_finance": is_super or is_mgr or ("FINANCE_OFFICER" in roles),
        "can_refund_payments": is_super or ("FINANCE_OFFICER" in roles),
        "can_adjust_votes": is_super,
        "can_manage_users": is_super,
    }
