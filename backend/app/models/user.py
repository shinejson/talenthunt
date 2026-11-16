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
            "created_at": iso_utc(self.created_at),
        }
        if include_private:
            data["email"] = self.email
            data["phone"] = self.phone
            data["last_login_at"] = iso_utc(self.last_login_at)
        return data
