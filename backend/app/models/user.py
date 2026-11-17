from app.extensions import db
from app.utils.security import new_uuid
from app.utils.time_utils import iso_utc, utcnow

ROLE_DEFINITIONS = {
    "VISITOR": "Browse competitions and nominees, purchase votes, view public results",
    "APPLICANT": "Submit and track talent demos and respond to revision requests",
    "NOMINEE": "Manage permitted nominee profile, share voting link, view own dashboard",
    "REVIEWER": "Review assigned submissions, record scorecards and internal notes",
    "MODERATOR": "Review reported content, hide/archive content, handle abuse reports",
    "COMPETITION_MANAGER": "Manage competitions, categories, rounds, nominations, and eliminations",
    "FINANCE_OFFICER": "View transactions, reconcile payments, export financial reports, process refunds",
    "SUPER_ADMIN": "Manage all users, roles, settings, competitions, integrations, and audit records",
}


class Role(db.Model):
    __tablename__ = "roles"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    name = db.Column(db.String(50), unique=True, nullable=False, index=True)
    description = db.Column(db.String(255), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
        }


class UserRole(db.Model):
    __tablename__ = "user_roles"
    __table_args__ = (
        db.UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id = db.Column(db.String(36), db.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    granted_by = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    role = db.relationship("Role", lazy="joined")


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    full_name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=True, index=True)
    phone = db.Column(db.String(40), unique=True, nullable=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_verified = db.Column(db.Boolean, nullable=False, default=False)
    verification_code = db.Column(db.String(16), nullable=True)
    verification_expires_at = db.Column(db.DateTime, nullable=True)
    reset_token = db.Column(db.String(128), nullable=True, index=True)
    reset_token_expires_at = db.Column(db.DateTime, nullable=True)
    token_version = db.Column(db.Integer, nullable=False, default=1)
    status = db.Column(db.String(30), nullable=False, default="ACTIVE", index=True)
    location = db.Column(db.String(150), nullable=True)
    bio = db.Column(db.Text, nullable=True)
    last_login_at = db.Column(db.DateTime, nullable=True)
    last_activity_at = db.Column(db.DateTime, nullable=True)
    session_timeout_minutes = db.Column(db.Integer, nullable=False, default=30)
    totp_enabled = db.Column(db.Boolean, nullable=False, default=False)
    totp_secret = db.Column(db.String(64), nullable=True)
    totp_pending_secret = db.Column(db.String(64), nullable=True)
    backup_codes_json = db.Column(db.JSON, nullable=True)
    two_factor_confirmed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    user_roles = db.relationship(
        "UserRole",
        foreign_keys=[UserRole.user_id],
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def role_names(self) -> list[str]:
        return sorted({ur.role.name for ur in self.user_roles if ur.role})

    def has_role(self, *names: str) -> bool:
        current = set(self.role_names)
        return any(n in current for n in names)

    def to_dict(self, include_private: bool = True):
        data = {
            "id": self.id,
            "full_name": self.full_name,
            "status": self.status,
            "is_verified": self.is_verified,
            "roles": self.role_names,
            "location": self.location,
            "bio": self.bio,
            "totp_enabled": bool(self.totp_enabled),
            "created_at": iso_utc(self.created_at),
        }
        if include_private:
            data["email"] = self.email
            data["phone"] = self.phone
            data["last_login_at"] = iso_utc(self.last_login_at)
            data["last_activity_at"] = iso_utc(self.last_activity_at)
            data["session_timeout_minutes"] = self.session_timeout_minutes or 30
            data["two_factor_confirmed_at"] = iso_utc(self.two_factor_confirmed_at)
        return data


class UserSession(db.Model):
    __tablename__ = "user_sessions"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    device_summary = db.Column(db.String(100), nullable=True)
    last_activity_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    expires_at = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    user = db.relationship("User", backref=db.backref("sessions", cascade="all, delete-orphan", lazy="dynamic"))

    def to_dict(self, is_current: bool = False):
        return {
            "id": self.id,
            "ip_address": self.ip_address or "127.0.0.1",
            "device_summary": self.device_summary or "Web Browser",
            "user_agent": self.user_agent or "",
            "last_activity_at": iso_utc(self.last_activity_at),
            "created_at": iso_utc(self.created_at),
            "is_current": is_current,
            "is_active": self.is_active,
        }


def ensure_auth_schema():
    """Ensure newly introduced columns and user_sessions table exist on SQLite without dropping data."""
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        if "users" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("users")]
            new_cols = [
                ("last_activity_at", "DATETIME"),
                ("session_timeout_minutes", "INTEGER DEFAULT 30"),
                ("totp_enabled", "BOOLEAN DEFAULT 0"),
                ("totp_secret", "VARCHAR(64)"),
                ("totp_pending_secret", "VARCHAR(64)"),
                ("backup_codes_json", "JSON"),
                ("two_factor_confirmed_at", "DATETIME"),
            ]
            for col_name, col_type in new_cols:
                if col_name not in columns:
                    db.session.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
            db.session.commit()
        db.create_all()
    except Exception:
        db.session.rollback()
