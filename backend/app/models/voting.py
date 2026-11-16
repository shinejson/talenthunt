from app.extensions import db
from app.utils.security import mask_contact, new_uuid
from app.utils.time_utils import iso_utc, utcnow


class Order(db.Model):
    __tablename__ = "orders"
    __table_args__ = (
        db.Index("ix_orders_status_created", "status", "created_at"),
        db.Index("ix_orders_nominee_round", "nominee_id", "round_id"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    public_reference = db.Column(db.String(60), unique=True, nullable=False, index=True)
    receipt_code = db.Column(db.String(60), unique=True, nullable=True, index=True)
    idempotency_key = db.Column(db.String(120), unique=True, nullable=True, index=True)
    voter_user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    voter_name = db.Column(db.String(150), nullable=True)
    voter_email = db.Column(db.String(255), nullable=True)
    voter_phone = db.Column(db.String(40), nullable=True, index=True)
    payment_channel = db.Column(db.String(40), nullable=False, default="mobile_money")
    nominee_id = db.Column(db.String(36), db.ForeignKey("nominees.id", ondelete="RESTRICT"), nullable=False, index=True)
    round_id = db.Column(db.String(36), db.ForeignKey("rounds.id", ondelete="RESTRICT"), nullable=False, index=True)
    round_entry_id = db.Column(db.String(36), db.ForeignKey("round_entries.id", ondelete="RESTRICT"), nullable=True)
    package_id = db.Column(db.String(36), db.ForeignKey("vote_packages.id", ondelete="SET NULL"), nullable=True)
    package_name_snapshot = db.Column(db.String(120), nullable=True)
    vote_quantity = db.Column(db.Integer, nullable=False)
    unit_price_minor = db.Column(db.Integer, nullable=False)
    fee_minor = db.Column(db.Integer, nullable=False, default=0)
    amount_minor = db.Column(db.Integer, nullable=False)
    currency = db.Column(db.String(8), nullable=False, default="GHS")
    status = db.Column(db.String(30), nullable=False, default="PENDING_PAYMENT", index=True)
    ip_hash = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    paid_at = db.Column(db.DateTime, nullable=True)

    nominee = db.relationship("Nominee", lazy="joined")
    round = db.relationship("Round", lazy="joined")
    payments = db.relationship(
        "Payment",
        back_populates="order",
        order_by="Payment.created_at.desc()",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def to_dict(self, include_finance: bool = False):
        comp = self.nominee.competition if self.nominee else None
        data = {
            "id": self.id,
            "public_reference": self.public_reference,
            "receipt_code": self.receipt_code,
            "nominee_id": self.nominee_id,
            "nominee_name": self.nominee.public_name if self.nominee else None,
            "nominee_slug": self.nominee.public_slug if self.nominee else None,
            "competition_slug": comp.slug if comp else None,
            "competition_title": comp.title if comp else None,
            "round_id": self.round_id,
            "round_name": self.round.name if self.round else None,
            "package_name": self.package_name_snapshot,
            "vote_quantity": self.vote_quantity,
            "unit_price_minor": self.unit_price_minor,
            "fee_minor": self.fee_minor,
            "amount_minor": self.amount_minor,
            "amount_major": round(self.amount_minor / 100.0, 2),
            "currency": self.currency,
            "payment_channel": self.payment_channel,
            "status": self.status,
            "voter_contact_masked": mask_contact(self.voter_phone or self.voter_email),
            "created_at": iso_utc(self.created_at),
            "paid_at": iso_utc(self.paid_at),
        }
        if include_finance:
            data["voter_name"] = self.voter_name
            data["voter_email"] = self.voter_email
            data["voter_phone"] = self.voter_phone
            data["payments"] = [p.to_dict() for p in self.payments]
        return data


class Payment(db.Model):
    __tablename__ = "payments"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    order_id = db.Column(db.String(36), db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = db.Column(db.String(40), nullable=False, default="mock")
    channel = db.Column(db.String(40), nullable=False, default="mobile_money")
    provider_reference = db.Column(db.String(100), unique=True, nullable=False, index=True)
    provider_transaction_id = db.Column(db.String(100), unique=True, nullable=True, index=True)
    checkout_url = db.Column(db.String(500), nullable=True)
    amount_minor = db.Column(db.Integer, nullable=False)
    fee_minor = db.Column(db.Integer, nullable=False, default=0)
    currency = db.Column(db.String(8), nullable=False, default="GHS")
    status = db.Column(db.String(30), nullable=False, default="INITIALIZED", index=True)
    verified_at = db.Column(db.DateTime, nullable=True)
    refunded_at = db.Column(db.DateTime, nullable=True)
    raw_metadata_safe = db.Column(db.JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    order = db.relationship("Order", back_populates="payments")

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "order_reference": self.order.public_reference if self.order else None,
            "nominee_name": self.order.nominee.public_name if (self.order and self.order.nominee) else None,
            "vote_quantity": self.order.vote_quantity if self.order else None,
            "provider": self.provider,
            "channel": self.channel,
            "provider_reference": self.provider_reference,
            "provider_transaction_id": self.provider_transaction_id,
            "checkout_url": self.checkout_url,
            "amount_minor": self.amount_minor,
            "amount_major": round(self.amount_minor / 100.0, 2),
            "fee_minor": self.fee_minor,
            "currency": self.currency,
            "status": self.status,
            "verified_at": iso_utc(self.verified_at),
            "refunded_at": iso_utc(self.refunded_at),
            "raw_metadata_safe": self.raw_metadata_safe or {},
            "created_at": iso_utc(self.created_at),
        }


class VoteLedger(db.Model):
    """Immutable append-only vote ledger (CREDIT, REVERSAL, ADJUSTMENT)."""

    __tablename__ = "vote_ledger"
    __table_args__ = (
        db.UniqueConstraint("payment_id", "entry_type", name="uq_vote_ledger_payment_entry_type"),
        db.Index("ix_vote_ledger_nominee_round_created", "nominee_id", "round_id", "created_at"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    order_id = db.Column(db.String(36), db.ForeignKey("orders.id", ondelete="RESTRICT"), nullable=True, index=True)
    payment_id = db.Column(db.String(36), db.ForeignKey("payments.id", ondelete="RESTRICT"), nullable=True, index=True)
    nominee_id = db.Column(db.String(36), db.ForeignKey("nominees.id", ondelete="RESTRICT"), nullable=False, index=True)
    round_id = db.Column(db.String(36), db.ForeignKey("rounds.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = db.Column(db.Integer, nullable=False)  # positive for CREDIT, negative for REVERSAL, signed for ADJUSTMENT
    entry_type = db.Column(db.String(30), nullable=False, index=True)  # CREDIT, REVERSAL, ADJUSTMENT
    reverses_entry_id = db.Column(
        db.String(36),
        db.ForeignKey("vote_ledger.id", ondelete="RESTRICT"),
        unique=True,
        nullable=True,
    )
    reason = db.Column(db.Text, nullable=True)
    actor_user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approval_reference = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    nominee = db.relationship("Nominee", lazy="joined")
    round = db.relationship("Round", lazy="joined")
    order = db.relationship("Order", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "order_reference": self.order.public_reference if self.order else None,
            "payment_id": self.payment_id,
            "nominee_id": self.nominee_id,
            "nominee_name": self.nominee.public_name if self.nominee else None,
            "round_id": self.round_id,
            "round_name": self.round.name if self.round else None,
            "quantity": self.quantity,
            "entry_type": self.entry_type,
            "reverses_entry_id": self.reverses_entry_id,
            "reason": self.reason,
            "actor_user_id": self.actor_user_id,
            "approval_reference": self.approval_reference,
            "created_at": iso_utc(self.created_at),
        }


class WebhookEvent(db.Model):
    __tablename__ = "webhook_events"
    __table_args__ = (
        db.UniqueConstraint("provider", "event_id", name="uq_webhook_events_provider_event"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    provider = db.Column(db.String(40), nullable=False)
    event_id = db.Column(db.String(120), nullable=False)
    payload_hash = db.Column(db.String(64), nullable=False)
    signature_valid = db.Column(db.Boolean, nullable=False, default=False)
    received_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    processed_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(30), nullable=False, default="RECEIVED")
    notes = db.Column(db.String(255), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "provider": self.provider,
            "event_id": self.event_id,
            "payload_hash": self.payload_hash,
            "signature_valid": self.signature_valid,
            "received_at": iso_utc(self.received_at),
            "processed_at": iso_utc(self.processed_at),
            "status": self.status,
            "notes": self.notes,
        }
