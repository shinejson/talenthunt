from app.extensions import db
from app.utils.security import new_uuid
from app.utils.time_utils import iso_utc, utcnow

APPLICATION_STATUSES = {
    "SUBMITTED",
    "UNDER_REVIEW",
    "CHANGES_REQUESTED",
    "APPROVED",
    "REJECTED",
    "NOMINATED",
    "WITHDRAWN",
}


class MediaAsset(db.Model):
    __tablename__ = "media_assets"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    owner_user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    is_private = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    original_filename = db.Column(db.String(255), nullable=False)
    storage_key = db.Column(db.String(255), unique=True, nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    size_bytes = db.Column(db.Integer, nullable=False)
    scan_status = db.Column(db.String(30), nullable=False, default="CLEAN")  # PENDING, CLEAN, QUARANTINED
    duration_seconds = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "original_filename": self.original_filename,
            "url": f"/uploads/{self.storage_key}" if self.scan_status == "CLEAN" else None,
            "mime_type": self.mime_type,
            "size_bytes": self.size_bytes,
            "scan_status": self.scan_status,
            "duration_seconds": self.duration_seconds,
            "created_at": iso_utc(self.created_at),
        }


class Application(db.Model):
    __tablename__ = "applications"
    __table_args__ = (
        db.Index("ix_applications_comp_status", "competition_id", "status"),
        db.Index(
            "uq_applications_guest_entry", "competition_id", "category_id", "contact_email", unique=True,
            sqlite_where=db.text("applicant_full_name IS NOT NULL AND status <> 'WITHDRAWN'"),
            postgresql_where=db.text("applicant_full_name IS NOT NULL AND status <> 'WITHDRAWN'"),
        ),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    competition_id = db.Column(db.String(36), db.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = db.Column(db.String(36), db.ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True)
    reference_no = db.Column(db.String(50), unique=True, nullable=False, index=True)
    # Snapshot supplied by guests. A user is only linked when the application is nominated.
    applicant_full_name = db.Column(db.String(150), nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    is_group = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    group_name = db.Column(db.String(150), nullable=True)
    group_member_count = db.Column(db.Integer, nullable=True)
    profile_image_id = db.Column(
        db.String(36), db.ForeignKey("media_assets.id", ondelete="SET NULL", name="fk_applications_profile_image"), nullable=True
    )
    nomination_email_sent_at = db.Column(db.DateTime, nullable=True)
    stage_name = db.Column(db.String(150), nullable=True)
    contact_email = db.Column(db.String(255), nullable=True)
    contact_phone = db.Column(db.String(40), nullable=True)
    location = db.Column(db.String(150), nullable=True)
    is_minor = db.Column(db.Boolean, nullable=False, default=False)
    genre = db.Column(db.String(100), nullable=True)
    guardian_name = db.Column(db.String(150), nullable=True)
    guardian_contact = db.Column(db.String(100), nullable=True)
    guardian_consent = db.Column(db.Boolean, nullable=False, default=False)
    status = db.Column(db.String(40), nullable=False, default="SUBMITTED", index=True)
    payment_code = db.Column(db.String(50), nullable=True, index=True)
    payment_reference = db.Column(db.String(100), nullable=True, index=True)
    payment_amount_minor = db.Column(db.Integer, nullable=True, default=0)
    payment_status = db.Column(db.String(30), nullable=False, default="UNPAID", index=True)
    applicant_feedback = db.Column(db.Text, nullable=True)
    decision_by = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decision_at = db.Column(db.DateTime, nullable=True)
    decision_reason = db.Column(db.Text, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    applicant = db.relationship("User", foreign_keys=[user_id], lazy="joined")
    profile_image = db.relationship("MediaAsset", lazy="joined")
    competition = db.relationship("Competition", lazy="joined")
    category = db.relationship("Category", lazy="joined")
    submissions = db.relationship(
        "Submission",
        back_populates="application",
        order_by="Submission.version_no.desc()",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    reviews = db.relationship(
        "Review",
        back_populates="application",
        order_by="Review.created_at.desc()",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    nominee = db.relationship("Nominee", back_populates="application", uselist=False, lazy="joined")

    @property
    def latest_submission(self):
        return self.submissions[0] if self.submissions else None

    @property
    def is_guest_application(self):
        return self.applicant_full_name is not None

    @property
    def applicant_name(self):
        return self.applicant_full_name or (self.applicant.full_name if self.applicant else None)

    def to_tracking_dict(self):
        return {
            "tracking_code": self.reference_no,
            "competition_title": self.competition.title,
            "category_name": self.category.name,
            "status": self.status,
            "payment_status": self.payment_status or "UNPAID",
            "payment_code": self.payment_code,
            "applicant_feedback": self.applicant_feedback,
            "submitted_at": iso_utc(self.submitted_at),
            "updated_at": iso_utc(self.updated_at),
        }

    def to_dict(self, include_internal: bool = False):
        latest = self.latest_submission
        data = {
            "id": self.id,
            "reference_no": self.reference_no,
            "user_id": self.user_id,
            "applicant_name": self.applicant_name,
            "stage_name": self.stage_name or self.applicant_name,
            "profile_image": self.profile_image.to_dict() if self.profile_image else None,
            "competition_id": self.competition_id,
            "competition_title": self.competition.title if self.competition else None,
            "competition_slug": self.competition.slug if self.competition else None,
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "location": self.location,
            "is_minor": self.is_minor,
            "genre": self.genre,
            "guardian_consent": self.guardian_consent,
            "status": self.status,
            "payment_status": self.payment_status or "UNPAID",
            "payment_code": self.payment_code,
            "payment_amount_minor": self.payment_amount_minor or 0,
            "payment_amount_major": round((self.payment_amount_minor or 0) / 100.0, 2),
            "applicant_feedback": self.applicant_feedback,
            "submitted_at": iso_utc(self.submitted_at),
            "updated_at": iso_utc(self.updated_at),
            "latest_submission": latest.to_dict(include_moderation=include_internal) if latest else None,
            "submissions": [s.to_dict(include_moderation=include_internal) for s in self.submissions],
            "nominee_slug": self.nominee.public_slug if self.nominee else None,
            "nominee_id": self.nominee.id if self.nominee else None,
        }
        if include_internal:
            data["is_guest_application"] = self.is_guest_application
            dob = self.date_of_birth if self.is_guest_application else (self.applicant.date_of_birth if self.applicant else None)
            data["date_of_birth"] = dob.isoformat() if dob else None
            for field in ("is_group", "group_name", "group_member_count"):
                data[field] = getattr(self if self.is_guest_application else self.applicant, field, None)
            if not data["profile_image"] and not self.is_guest_application and self.applicant and self.applicant.profile_image:
                data["profile_image"] = self.applicant.profile_image.to_dict()
            data["nomination_email_sent_at"] = iso_utc(self.nomination_email_sent_at)
            data["contact_email"] = self.contact_email or (self.applicant.email if self.applicant else None)
            data["contact_phone"] = self.contact_phone or (self.applicant.phone if self.applicant else None)
            data["guardian_name"] = self.guardian_name
            data["guardian_contact"] = self.guardian_contact
            data["decision_by"] = self.decision_by
            data["decision_at"] = iso_utc(self.decision_at)
            data["decision_reason"] = self.decision_reason
            data["reviews"] = [r.to_dict() for r in self.reviews]
            scores = [r.score for r in self.reviews if r.score is not None]
            data["average_review_score"] = round(sum(scores) / len(scores), 2) if scores else None
        return data


class Submission(db.Model):
    __tablename__ = "submissions"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    application_id = db.Column(db.String(36), db.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    version_no = db.Column(db.Integer, nullable=False, default=1)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    biography = db.Column(db.Text, nullable=True)
    media_asset_id = db.Column(db.String(36), db.ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True)
    second_media_asset_id = db.Column(
        db.String(36), db.ForeignKey("media_assets.id", ondelete="SET NULL", name="fk_submissions_second_media"), nullable=True
    )
    external_video_url = db.Column(db.String(500), nullable=True)
    consent_accepted = db.Column(db.Boolean, nullable=False, default=True)
    rights_declaration = db.Column(db.Boolean, nullable=False, default=True)
    consent_version = db.Column(db.String(30), nullable=False, default="v1.0-2026")
    is_hidden = db.Column(db.Boolean, nullable=False, default=False)
    moderation_status = db.Column(db.String(30), nullable=False, default="VISIBLE")  # VISIBLE, HIDDEN, ARCHIVED, REMOVED
    moderation_reason = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    application = db.relationship("Application", back_populates="submissions")
    media_asset = db.relationship("MediaAsset", foreign_keys=[media_asset_id], lazy="joined")
    second_media_asset = db.relationship("MediaAsset", foreign_keys=[second_media_asset_id], lazy="joined")

    def to_dict(self, include_moderation: bool = False):
        hidden = self.is_hidden or self.moderation_status != "VISIBLE"
        data = {
            "id": self.id,
            "application_id": self.application_id,
            "version_no": self.version_no,
            "title": "[Content hidden by moderation]" if hidden and not include_moderation else self.title,
            "description": "[Content hidden]" if hidden and not include_moderation else self.description,
            "biography": None if hidden and not include_moderation else self.biography,
            "media_asset": None if hidden and not include_moderation else (self.media_asset.to_dict() if self.media_asset else None),
            "second_media_asset": self.second_media_asset.to_dict() if self.second_media_asset and (not hidden or include_moderation) else None,
            "external_video_url": None if hidden and not include_moderation else self.external_video_url,
            "consent_version": self.consent_version,
            "is_hidden": hidden,
            "moderation_status": self.moderation_status,
            "created_at": iso_utc(self.created_at),
        }
        if include_moderation:
            data["moderation_reason"] = self.moderation_reason
        return data


class Review(db.Model):
    __tablename__ = "reviews"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    application_id = db.Column(db.String(36), db.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    score = db.Column(db.Float, nullable=True)
    recommendation = db.Column(db.String(40), nullable=False)  # APPROVE, NOMINATE, REQUEST_CHANGES, REJECT
    internal_notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    application = db.relationship("Application", back_populates="reviews")
    reviewer = db.relationship("User", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "application_id": self.application_id,
            "reviewer_user_id": self.reviewer_user_id,
            "reviewer_name": self.reviewer.full_name if self.reviewer else None,
            "score": self.score,
            "recommendation": self.recommendation,
            "internal_notes": self.internal_notes,
            "created_at": iso_utc(self.created_at),
        }


class ApplicationPayment(db.Model):
    __tablename__ = "application_payments"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    competition_id = db.Column(db.String(36), db.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = db.Column(db.String(36), db.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    application_id = db.Column(db.String(36), db.ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True)

    applicant_name = db.Column(db.String(150), nullable=True)
    applicant_email = db.Column(db.String(255), nullable=False, index=True)
    applicant_phone = db.Column(db.String(40), nullable=True)

    provider = db.Column(db.String(40), nullable=False, default="mock")
    channel = db.Column(db.String(40), nullable=False, default="mobile_money")
    network = db.Column(db.String(50), nullable=False, default="MTN Mobile Money")
    payment_reference = db.Column(db.String(100), unique=True, nullable=False, index=True)
    payment_code = db.Column(db.String(50), unique=True, nullable=False, index=True)

    amount_minor = db.Column(db.Integer, nullable=False, default=5000)
    currency = db.Column(db.String(8), nullable=False, default="GHS")

    status = db.Column(db.String(30), nullable=False, default="INITIALIZED", index=True)  # INITIALIZED, SUCCESS, BOUNCED, FAILED
    bounced_reason = db.Column(db.String(255), nullable=True)
    is_redeemed = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    paid_at = db.Column(db.DateTime, nullable=True)

    competition = db.relationship("Competition", lazy="joined")
    category = db.relationship("Category", lazy="joined")
    application = db.relationship("Application", foreign_keys=[application_id], lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "competition_id": self.competition_id,
            "competition_title": self.competition.title if self.competition else None,
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "application_id": self.application_id,
            "applicant_name": self.applicant_name,
            "applicant_email": self.applicant_email,
            "applicant_phone": self.applicant_phone,
            "provider": self.provider,
            "channel": self.channel,
            "network": self.network,
            "payment_reference": self.payment_reference,
            "payment_code": self.payment_code,
            "amount_minor": self.amount_minor,
            "amount_major": round(self.amount_minor / 100.0, 2),
            "currency": self.currency,
            "status": self.status,
            "bounced_reason": self.bounced_reason,
            "is_redeemed": self.is_redeemed,
            "created_at": iso_utc(self.created_at),
            "paid_at": iso_utc(self.paid_at),
        }

