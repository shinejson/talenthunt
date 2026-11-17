from app.extensions import db
from app.utils.security import new_uuid
from app.utils.time_utils import iso_utc, utcnow

PAYOUT_TYPES = {"PRIZE", "GRANT", "STIPEND", "PRODUCTION", "OTHER"}
PAYOUT_STATUSES = {"PENDING_APPROVAL", "APPROVED", "DISBURSED", "CANCELLED"}
PAYMENT_METHODS = {"BANK_TRANSFER", "MOBILE_MONEY", "ESCROW", "CHEQUE"}


class Payout(db.Model):
    __tablename__ = "payouts"
    __table_args__ = (
        db.Index("ix_payouts_status_created", "status", "created_at"),
        db.Index("ix_payouts_competition", "competition_id"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    reference_no = db.Column(db.String(40), unique=True, nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    payout_type = db.Column(db.String(40), nullable=False, default="PRIZE", index=True)
    beneficiary_type = db.Column(db.String(40), nullable=False, default="NOMINEE")
    beneficiary_id = db.Column(db.String(36), nullable=True)
    beneficiary_name = db.Column(db.String(150), nullable=False)
    beneficiary_contact = db.Column(db.String(100), nullable=True)

    competition_id = db.Column(db.String(36), db.ForeignKey("competitions.id", ondelete="SET NULL"), nullable=True)
    round_id = db.Column(db.String(36), db.ForeignKey("rounds.id", ondelete="SET NULL"), nullable=True)
    nominee_id = db.Column(db.String(36), db.ForeignKey("nominees.id", ondelete="SET NULL"), nullable=True)

    amount_minor = db.Column(db.Integer, nullable=False)  # Gross amount in pesewas
    tax_withheld_minor = db.Column(db.Integer, nullable=False, default=0)
    net_amount_minor = db.Column(db.Integer, nullable=False)
    currency = db.Column(db.String(8), nullable=False, default="GHS")

    payment_method = db.Column(db.String(40), nullable=False, default="BANK_TRANSFER")
    account_details = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(30), nullable=False, default="PENDING_APPROVAL", index=True)

    scheduled_date = db.Column(db.DateTime, nullable=True)
    disbursed_at = db.Column(db.DateTime, nullable=True)
    approved_by_user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    transaction_reference = db.Column(db.String(100), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    competition = db.relationship("Competition", lazy="joined")
    round = db.relationship("Round", lazy="joined")
    nominee = db.relationship("Nominee", lazy="joined")
    approved_by = db.relationship("User", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "reference_no": self.reference_no,
            "title": self.title,
            "payout_type": self.payout_type,
            "beneficiary_type": self.beneficiary_type,
            "beneficiary_id": self.beneficiary_id,
            "beneficiary_name": self.beneficiary_name,
            "beneficiary_contact": self.beneficiary_contact,
            "competition_id": self.competition_id,
            "competition_title": self.competition.title if self.competition else None,
            "round_id": self.round_id,
            "round_name": self.round.name if self.round else None,
            "nominee_id": self.nominee_id,
            "nominee_name": self.nominee.public_name if self.nominee else None,
            "amount_minor": self.amount_minor,
            "amount_major": round(self.amount_minor / 100.0, 2),
            "tax_withheld_minor": self.tax_withheld_minor,
            "tax_withheld_major": round(self.tax_withheld_minor / 100.0, 2),
            "net_amount_minor": self.net_amount_minor,
            "net_amount_major": round(self.net_amount_minor / 100.0, 2),
            "currency": self.currency,
            "payment_method": self.payment_method,
            "account_details": self.account_details,
            "status": self.status,
            "scheduled_date": iso_utc(self.scheduled_date),
            "disbursed_at": iso_utc(self.disbursed_at),
            "approved_by_user_id": self.approved_by_user_id,
            "approved_by_name": self.approved_by.full_name if self.approved_by else None,
            "approved_at": iso_utc(self.approved_at),
            "transaction_reference": self.transaction_reference,
            "notes": self.notes,
            "created_at": iso_utc(self.created_at),
            "updated_at": iso_utc(self.updated_at),
        }
