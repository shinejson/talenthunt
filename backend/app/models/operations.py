from app.extensions import db
from app.utils.security import new_uuid
from app.utils.time_utils import iso_utc, utcnow


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, nullable=False)
    action_url = db.Column(db.String(255), nullable=True)
    channel = db.Column(db.String(30), nullable=False, default="IN_APP")
    delivery_status = db.Column(db.String(30), nullable=False, default="DELIVERED")
    read_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "type": self.type,
            "title": self.title,
            "body": self.body,
            "action_url": self.action_url,
            "channel": self.channel,
            "delivery_status": self.delivery_status,
            "is_read": self.read_at is not None,
            "read_at": iso_utc(self.read_at),
            "created_at": iso_utc(self.created_at),
        }


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    actor_user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = db.Column(db.String(100), nullable=False, index=True)
    entity_type = db.Column(db.String(60), nullable=False, index=True)
    entity_id = db.Column(db.String(60), nullable=True, index=True)
    before_json = db.Column(db.JSON, nullable=True)
    after_json = db.Column(db.JSON, nullable=True)
    ip_hash = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)

    actor = db.relationship("User", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "actor_user_id": self.actor_user_id,
            "actor_name": self.actor.full_name if self.actor else "System",
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "before_json": self.before_json,
            "after_json": self.after_json,
            "ip_hash": self.ip_hash,
            "created_at": iso_utc(self.created_at),
        }


class SupportTicket(db.Model):
    __tablename__ = "support_tickets"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    ticket_reference = db.Column(db.String(50), unique=True, nullable=False, index=True)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    order_id = db.Column(db.String(36), db.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    order_reference = db.Column(db.String(60), nullable=True)
    contact_name = db.Column(db.String(150), nullable=False)
    contact_email = db.Column(db.String(255), nullable=True)
    contact_phone = db.Column(db.String(40), nullable=True)
    category = db.Column(db.String(40), nullable=False, default="GENERAL")  # PAYMENT, VOTING, APPLICATION, GENERAL
    subject = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    resolution_notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), nullable=False, default="OPEN", index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "ticket_reference": self.ticket_reference,
            "user_id": self.user_id,
            "order_reference": self.order_reference,
            "contact_name": self.contact_name,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "category": self.category,
            "subject": self.subject,
            "message": self.message,
            "resolution_notes": self.resolution_notes,
            "status": self.status,
            "created_at": iso_utc(self.created_at),
            "updated_at": iso_utc(self.updated_at),
        }


class ModerationReport(db.Model):
    __tablename__ = "moderation_reports"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    reporter_user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    entity_type = db.Column(db.String(40), nullable=False)  # SUBMISSION, NOMINEE, VOTING_ANOMALY
    entity_id = db.Column(db.String(60), nullable=False, index=True)
    reason = db.Column(db.String(120), nullable=False)
    details = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), nullable=False, default="OPEN", index=True)  # OPEN, INVESTIGATING, ACTIONED, DISMISSED
    resolution_notes = db.Column(db.Text, nullable=True)
    resolved_by = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "reporter_user_id": self.reporter_user_id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "reason": self.reason,
            "details": self.details,
            "status": self.status,
            "resolution_notes": self.resolution_notes,
            "resolved_by": self.resolved_by,
            "resolved_at": iso_utc(self.resolved_at),
            "created_at": iso_utc(self.created_at),
        }


class PlatformSetting(db.Model):
    __tablename__ = "platform_settings"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    key = db.Column(db.String(80), unique=True, nullable=False, index=True)
    value_json = db.Column(db.JSON, nullable=False, default=dict)
    updated_by = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "key": self.key,
            "value": self.value_json,
            "updated_by": self.updated_by,
            "updated_at": iso_utc(self.updated_at),
        }
