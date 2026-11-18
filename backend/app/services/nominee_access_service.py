import hashlib
import secrets
from datetime import timedelta
from urllib.parse import urlsplit

from flask import current_app

from app.extensions import db
from app.integrations.email.sender import send_email_message
from app.models.application import Application
from app.models.user import User
from app.policies.rbac import ADMIN_PORTAL_ROLES
from app.schemas import AcceptInvitationSchema, DomainError, validate_payload
from app.services.audit_service import log_audit
from app.utils.security import hash_password
from app.utils.time_utils import utcnow

INVITATION_HOURS = 48


def _hash_invitation(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def assign_nominee_account(application: Application) -> User:
    """Link this application during the nomination transaction, never at submission time."""
    if not application.is_guest_application:
        return application.applicant

    user = User.query.filter(db.func.lower(User.email) == application.contact_email).with_for_update(of=User).first()
    if user and (
        user.has_role(*ADMIN_PORTAL_ROLES)
        or (user.status == "INVITED" and not user.has_role("NOMINEE"))
        or (user.status != "INVITED" and (user.status != "ACTIVE" or not user.is_verified))
    ):
        raise DomainError(
            "CONTACT_ACCOUNT_CONFLICT",
            "This email belongs to a staff, inactive, or unverified account. Resolve the contact conflict before nominating.",
            409,
        )
    if not user:
        user = User(
            full_name=application.applicant_full_name,
            email=application.contact_email,
            # The application phone is not verified and must not become a sign-in identifier.
            password_hash=hash_password(secrets.token_urlsafe(32)),
            status="INVITED",
            is_verified=False,
            date_of_birth=application.date_of_birth,
            location=application.location,
            bio=application.latest_submission.biography if application.latest_submission else None,
            is_group=application.is_group,
            group_name=application.group_name,
            group_member_count=application.group_member_count,
        )
        db.session.add(user)
        db.session.flush()
        user.profile_image = application.profile_image

    application.applicant = user
    assets = [application.profile_image]
    for submission in application.submissions:
        assets.extend((submission.media_asset, submission.second_media_asset))
    for asset in assets:
        if asset:
            asset.owner_user_id = user.id
    return user


def send_nomination_email(application: Application, actor: User) -> bool:
    """Send only after the nomination commits. A failed resend keeps the prior valid link."""
    base_url = current_app.config.get("PUBLIC_BASE_URL", "").rstrip("/")
    try:
        parsed = urlsplit(base_url)
        if not parsed.hostname or parsed.username is not None or parsed.query or parsed.fragment:
            return False
        if parsed.scheme != "https" and (parsed.scheme != "http" or current_app.config["SESSION_COOKIE_SECURE"]):
            return False
    except ValueError:
        return False
    user = User.query.filter_by(id=application.user_id).with_for_update(of=User).first()
    if not user or not user.email or user.status not in {"INVITED", "ACTIVE"}:
        return False

    title = "You’re nominated! Access your StageLight portal"
    body = (
        f"Congratulations, {application.stage_name or user.full_name}!\n\n"
        f"You’ve been nominated for {application.competition.title} ({application.category.name}).\n"
        f"Sign-in email: {user.email}\n\n"
    )
    expires = None
    if user.status == "INVITED":
        token = secrets.token_hex(32)
        expires = utcnow() + timedelta(hours=INVITATION_HOURS)
        body += (
            f"Set your password with this one-time link. It expires in {INVITATION_HOURS} hours:\n"
            f"{base_url}/portal/accept-invitation#{token}\n\n"
        )
    else:
        token = None
        body += "Sign in with your existing password.\n\n"
    body += f"Nominee sign-in: {base_url}/portal/login\n\nIf you did not apply, you can ignore this email."
    if not send_email_message(user.email, title, body):
        db.session.rollback()
        return False
    if token and expires:
        user.reset_token = _hash_invitation(token)
        user.reset_token_expires_at = expires
    application.nomination_email_sent_at = utcnow()
    log_audit(actor_user_id=actor.id, action="NOMINATION_EMAIL_SENT", entity_type="application", entity_id=application.id)
    db.session.commit()
    return True


def accept_nominee_invitation(payload: dict):
    data = validate_payload(AcceptInvitationSchema, payload)
    invitation = User.query.filter(
        User.status == "INVITED",
        User.reset_token == _hash_invitation(data["token"]),
        User.reset_token_expires_at > utcnow(),
    )
    user_id = invitation.with_entities(User.id).scalar()
    invalid = DomainError("INVALID_INVITATION", "This invitation is invalid, expired, or already used. Contact support for a new link.", 400)
    if not user_id:
        raise invalid
    if not invitation.filter_by(id=user_id).update({
        User.password_hash: hash_password(data["password"]),
        User.status: "ACTIVE",
        User.is_verified: True,
        User.reset_token: None,
        User.reset_token_expires_at: None,
        User.token_version: User.token_version + 1,
    }, synchronize_session=False):
        raise invalid
    log_audit(actor_user_id=user_id, action="NOMINEE_INVITATION_ACCEPTED", entity_type="user", entity_id=user_id)
    db.session.commit()
