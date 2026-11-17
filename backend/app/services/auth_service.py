import secrets
from datetime import timedelta
from flask import session

from app.extensions import db
from app.models.user import ROLE_DEFINITIONS, Role, User, UserRole
from app.schemas import DomainError, LoginSchema, RegisterSchema, validate_payload
from app.services.audit_service import log_audit
from app.services.notification_service import notify_user
from app.utils.security import (
    create_access_token,
    generate_verification_code,
    hash_password,
    verify_password,
)
from app.utils.time_utils import utcnow


def ensure_roles_exist():
    existing = {r.name: r for r in Role.query.all()}
    for name, desc in ROLE_DEFINITIONS.items():
        if name not in existing:
            role = Role(name=name, description=desc)
            db.session.add(role)
    db.session.flush()


def grant_role(user: User, role_name: str, granted_by: str | None = None):
    ensure_roles_exist()
    role = Role.query.filter_by(name=role_name).first()
    if not role:
        raise DomainError("INVALID_ROLE", f"Role '{role_name}' does not exist.", 400)
    already = UserRole.query.filter_by(user_id=user.id, role_id=role.id).first()
    if not already:
        ur = UserRole(user_id=user.id, role_id=role.id, granted_by=granted_by)
        db.session.add(ur)
        db.session.flush()
        db.session.expire(user, ["user_roles"])


def set_user_roles(user: User, role_names: list[str], actor_user_id: str):
    ensure_roles_exist()
    before_roles = user.role_names
    valid_roles = Role.query.filter(Role.name.in_(role_names)).all()
    if len(valid_roles) != len(set(role_names)):
        raise DomainError("INVALID_ROLE", "One or more specified roles are invalid.", 422)

    UserRole.query.filter_by(user_id=user.id).delete()
    for role in valid_roles:
        db.session.add(UserRole(user_id=user.id, role_id=role.id, granted_by=actor_user_id))
    db.session.flush()
    db.session.expire(user, ["user_roles"])
    log_audit(
        actor_user_id=actor_user_id,
        action="USER_ROLES_UPDATED",
        entity_type="user",
        entity_id=user.id,
        before={"roles": before_roles},
        after={"roles": user.role_names},
    )


def register_user(raw_payload: dict) -> tuple[User, str, str]:
    data = validate_payload(RegisterSchema, raw_payload)
    email = (data.get("email") or "").strip().lower() or None
    phone = (data.get("phone") or "").strip() or None

    if email and User.query.filter_by(email=email).first():
        raise DomainError("EMAIL_TAKEN", "An account with this email address already exists.", 409, {"email": ["Email is already registered."]})
    if phone and User.query.filter_by(phone=phone).first():
        raise DomainError("PHONE_TAKEN", "An account with this phone number already exists.", 409, {"phone": ["Phone number is already registered."]})

    code = generate_verification_code()
    user = User(
        full_name=data["full_name"].strip(),
        email=email,
        phone=phone,
        password_hash=hash_password(data["password"]),
        location=(data.get("location") or "").strip() or None,
        date_of_birth=data.get("date_of_birth"),
        is_group=bool(data.get("is_group")),
        group_name=(data.get("group_name") or "").strip() or None,
        group_member_count=data.get("group_member_count"),
        is_verified=False,
        verification_code=code,
        verification_expires_at=utcnow() + timedelta(hours=24),
        status="ACTIVE",
    )
    if user.date_of_birth and user.date_of_birth > utcnow().date():
        raise DomainError(
            "VALIDATION_ERROR",
            "Date of birth cannot be in the future.",
            422,
            {"date_of_birth": ["Date of birth cannot be in the future."]},
        )
    db.session.add(user)
    db.session.flush()

    grant_role(user, "APPLICANT")

    notify_user(
        user_id=user.id,
        notif_type="ACCOUNT_VERIFICATION",
        title="Welcome to StageLight — Verify Your Contact",
        body=f"Welcome {user.full_name}! Your verification code is {code}. Use it in Account Settings to verify your contact channel.",
        action_url="/portal/security",
    )
    log_audit(
        actor_user_id=user.id,
        action="USER_REGISTERED",
        entity_type="user",
        entity_id=user.id,
        after={"email": user.email, "phone": user.phone, "roles": user.role_names},
    )
    db.session.commit()

    token = _establish_session(user)
    return user, token, code


def login_user(raw_payload: dict) -> tuple[User, str]:
    data = validate_payload(LoginSchema, raw_payload)
    ident = data["identifier"].strip()
    ident_lower = ident.lower()

    user = User.query.filter(
        (User.email == ident_lower) | (User.phone == ident)
    ).first()

    if not user or not verify_password(user.password_hash, data["password"]):
        log_audit(
            actor_user_id=user.id if user else None,
            action="LOGIN_FAILED",
            entity_type="user",
            entity_id=user.id if user else None,
            after={"identifier": ident_lower[:40]},
        )
        db.session.commit()
        raise DomainError("INVALID_CREDENTIALS", "Invalid email/phone or password.", 401)

    if user.status != "ACTIVE":
        raise DomainError("ACCOUNT_INACTIVE", f"This account is currently {user.status.lower()}.", 403)

    user.last_login_at = utcnow()
    log_audit(
        actor_user_id=user.id,
        action="USER_LOGIN",
        entity_type="user",
        entity_id=user.id,
    )
    db.session.commit()
    token = _establish_session(user)
    return user, token


def _establish_session(user: User) -> str:
    session.permanent = True
    session["user_id"] = user.id
    session["token_version"] = user.token_version
    return create_access_token(user.id, user.token_version)


def logout_current_user(user: User | None):
    if user:
        log_audit(actor_user_id=user.id, action="USER_LOGOUT", entity_type="user", entity_id=user.id)
        db.session.commit()
    session.clear()


def verify_user_contact(user: User, code: str) -> User:
    cleaned = (code or "").strip()
    if user.is_verified:
        return user
    if not cleaned or user.verification_code != cleaned:
        raise DomainError("INVALID_VERIFICATION_CODE", "The verification code entered is invalid.", 422)
    if user.verification_expires_at and utcnow() > user.verification_expires_at:
        raise DomainError("EXPIRED_VERIFICATION_CODE", "Verification code has expired. Request a new code.", 422)

    user.is_verified = True
    user.verification_code = None
    user.verification_expires_at = None
    log_audit(actor_user_id=user.id, action="CONTACT_VERIFIED", entity_type="user", entity_id=user.id)
    db.session.commit()
    return user


def resend_verification_code(user: User) -> str:
    code = generate_verification_code()
    user.verification_code = code
    user.verification_expires_at = utcnow() + timedelta(hours=24)
    notify_user(
        user_id=user.id,
        notif_type="ACCOUNT_VERIFICATION",
        title="Your New Verification Code",
        body=f"Your verification code is {code}. It expires in 24 hours.",
        action_url="/portal/security",
    )
    db.session.commit()
    return code


def start_password_reset(identifier: str) -> str | None:
    ident = (identifier or "").strip()
    if not ident:
        raise DomainError("VALIDATION_ERROR", "Email or phone is required.", 422)
    user = User.query.filter((User.email == ident.lower()) | (User.phone == ident)).first()
    if not user or user.status != "ACTIVE":
        return None

    token = secrets.token_urlsafe(24)
    user.reset_token = token
    user.reset_token_expires_at = utcnow() + timedelta(hours=2)
    notify_user(
        user_id=user.id,
        notif_type="PASSWORD_RESET",
        title="Password Reset Requested",
        body="A password reset was requested for your StageLight account. If this was not you, ignore this message.",
    )
    log_audit(actor_user_id=user.id, action="PASSWORD_RESET_REQUESTED", entity_type="user", entity_id=user.id)
    db.session.commit()
    return token


def complete_password_reset(reset_token: str, new_password: str) -> User:
    if not reset_token or not new_password or len(new_password) < 8:
        raise DomainError("VALIDATION_ERROR", "Valid reset token and password (min 8 chars) are required.", 422)
    user = User.query.filter_by(reset_token=reset_token.strip()).first()
    if not user or not user.reset_token_expires_at or utcnow() > user.reset_token_expires_at:
        raise DomainError("INVALID_RESET_TOKEN", "Password reset token is invalid or has expired.", 400)

    user.password_hash = hash_password(new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    user.token_version += 1
    log_audit(actor_user_id=user.id, action="PASSWORD_RESET_COMPLETED", entity_type="user", entity_id=user.id)
    db.session.commit()
    return user


def change_password(user: User, current_password: str, new_password: str) -> str:
    if not verify_password(user.password_hash, current_password):
        raise DomainError("INVALID_PASSWORD", "Current password is incorrect.", 400)
    if not new_password or len(new_password) < 8:
        raise DomainError("VALIDATION_ERROR", "New password must be at least 8 characters.", 422)
    user.password_hash = hash_password(new_password)
    user.token_version += 1
    log_audit(actor_user_id=user.id, action="PASSWORD_CHANGED", entity_type="user", entity_id=user.id)
    db.session.commit()
    return _establish_session(user)
