from app.extensions import db
from app.utils.security import new_uuid
from app.utils.time_utils import iso_utc, utcnow

COMPETITION_STATUSES = {
    "DRAFT",
    "PUBLISHED",
    "APPLICATIONS_OPEN",
    "REVIEW",
    "VOTING",
    "RESULTS_PENDING",
    "COMPLETED",
    "ARCHIVED",
}

APPLICATION_ENTRY_STATUSES = ("APPLICATIONS_OPEN", "PUBLISHED", "VOTING")

ROUND_STATUSES = {
    "DRAFT",
    "SCHEDULED",
    "OPEN",
    "CLOSED",
    "RECONCILIATION",
    "RESULTS_PENDING",
    "FINALIZED",
}


class Competition(db.Model):
    __tablename__ = "competitions"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    title = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(120), unique=True, nullable=False, index=True)
    tagline = db.Column(db.String(255), nullable=True)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(40), nullable=False, default="DRAFT", index=True)
    applications_open_at = db.Column(db.DateTime, nullable=True)
    applications_close_at = db.Column(db.DateTime, nullable=True)
    starts_at = db.Column(db.DateTime, nullable=True)
    ends_at = db.Column(db.DateTime, nullable=True)
    timezone = db.Column(db.String(64), nullable=False, default="Africa/Accra")
    currency = db.Column(db.String(8), nullable=False, default="GHS")
    rules = db.Column(db.Text, nullable=True)
    eligibility = db.Column(db.Text, nullable=True)
    prize_summary = db.Column(db.String(255), nullable=True)
    public_leaderboard = db.Column(db.Boolean, nullable=False, default=False)
    nominee_see_rank = db.Column(db.Boolean, nullable=False, default=True)
    voting_paused = db.Column(db.Boolean, nullable=False, default=False)
    allow_custom_quantity = db.Column(db.Boolean, nullable=False, default=True)
    unit_vote_price_minor = db.Column(db.Integer, nullable=False, default=100)  # 100 pesewas = GHS 1.00
    application_fee_minor = db.Column(db.Integer, nullable=False, default=5000)  # 5000 pesewas = GHS 50.00
    min_vote_quantity = db.Column(db.Integer, nullable=False, default=1)
    max_vote_quantity_per_order = db.Column(db.Integer, nullable=False, default=500)
    max_votes_per_day_per_contact = db.Column(db.Integer, nullable=True, default=2000)
    require_guardian_for_minors = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    categories = db.relationship("Category", back_populates="competition", cascade="all, delete-orphan", lazy="selectin")
    rounds = db.relationship(
        "Round",
        back_populates="competition",
        order_by="Round.sequence_no.asc()",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    vote_packages = db.relationship(
        "VotePackage",
        back_populates="competition",
        order_by="VotePackage.sort_order.asc(), VotePackage.vote_quantity.asc()",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def accepts_applications(self, now=None):
        now = now or utcnow()
        return (
            self.status in APPLICATION_ENTRY_STATUSES
            and (not self.applications_open_at or self.applications_open_at <= now)
            and (not self.applications_close_at or now <= self.applications_close_at)
        )

    @property
    def application_fee_major(self) -> float:
        minor = self.application_fee_minor if self.application_fee_minor is not None else 5000
        return round(minor / 100.0, 2)

    def to_dict(self, include_details: bool = False):
        data = {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "tagline": self.tagline,
            "description": self.description,
            "status": self.status,
            "accepts_applications": self.accepts_applications(),
            "applications_open_at": iso_utc(self.applications_open_at),
            "applications_close_at": iso_utc(self.applications_close_at),
            "starts_at": iso_utc(self.starts_at),
            "ends_at": iso_utc(self.ends_at),
            "timezone": self.timezone,
            "currency": self.currency,
            "prize_summary": self.prize_summary,
            "public_leaderboard": self.public_leaderboard,
            "nominee_see_rank": self.nominee_see_rank,
            "voting_paused": self.voting_paused,
            "allow_custom_quantity": self.allow_custom_quantity,
            "unit_vote_price_minor": self.unit_vote_price_minor,
            "unit_vote_price_major": round(self.unit_vote_price_minor / 100.0, 2),
            "application_fee_minor": self.application_fee_minor if self.application_fee_minor is not None else 5000,
            "application_fee_major": round((self.application_fee_minor if self.application_fee_minor is not None else 5000) / 100.0, 2),
            "min_vote_quantity": self.min_vote_quantity,
            "max_vote_quantity_per_order": self.max_vote_quantity_per_order,
            "max_votes_per_day_per_contact": self.max_votes_per_day_per_contact,
            "require_guardian_for_minors": self.require_guardian_for_minors,
            "created_at": iso_utc(self.created_at),
        }
        if include_details:
            data["rules"] = self.rules
            data["eligibility"] = self.eligibility
            data["categories"] = [c.to_dict() for c in self.categories if c.status == "ACTIVE"]
            data["rounds"] = [r.to_dict() for r in self.rounds]
            data["vote_packages"] = [p.to_dict() for p in self.vote_packages if p.status == "ACTIVE"]
        return data


class Category(db.Model):
    __tablename__ = "categories"
    __table_args__ = (
        db.UniqueConstraint("competition_id", "slug", name="uq_categories_competition_slug"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    competition_id = db.Column(db.String(36), db.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    slug = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    icon = db.Column(db.String(40), nullable=True, default="star")
    status = db.Column(db.String(30), nullable=False, default="ACTIVE")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    competition = db.relationship("Competition", back_populates="categories")

    def to_dict(self):
        return {
            "id": self.id,
            "competition_id": self.competition_id,
            "name": self.name,
            "slug": self.slug,
            "description": self.description,
            "icon": self.icon,
            "status": self.status,
        }


class Round(db.Model):
    __tablename__ = "rounds"
    __table_args__ = (
        db.UniqueConstraint("competition_id", "sequence_no", name="uq_rounds_competition_seq"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    competition_id = db.Column(db.String(36), db.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    sequence_no = db.Column(db.Integer, nullable=False, default=1)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(40), nullable=False, default="DRAFT", index=True)
    voting_opens_at = db.Column(db.DateTime, nullable=True)
    voting_closes_at = db.Column(db.DateTime, nullable=True)
    elimination_config = db.Column(db.JSON, nullable=False, default=dict)
    is_finale = db.Column(db.Boolean, nullable=False, default=False)
    results_published = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    competition = db.relationship("Competition", back_populates="rounds")

    def is_voting_window_open(self, now=None) -> bool:
        now = now or utcnow()
        if self.status != "OPEN":
            return False
        if self.voting_opens_at and now < self.voting_opens_at:
            return False
        if self.voting_closes_at and now > self.voting_closes_at:
            return False
        return True

    def to_dict(self):
        return {
            "id": self.id,
            "competition_id": self.competition_id,
            "name": self.name,
            "sequence_no": self.sequence_no,
            "description": self.description,
            "status": self.status,
            "voting_opens_at": iso_utc(self.voting_opens_at),
            "voting_closes_at": iso_utc(self.voting_closes_at),
            "is_voting_open": self.is_voting_window_open(),
            "elimination_config": self.elimination_config or {},
            "is_finale": self.is_finale,
            "results_published": self.results_published,
            "created_at": iso_utc(self.created_at),
        }


class VotePackage(db.Model):
    __tablename__ = "vote_packages"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    competition_id = db.Column(db.String(36), db.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255), nullable=True)
    vote_quantity = db.Column(db.Integer, nullable=False)
    price_minor = db.Column(db.Integer, nullable=False)
    currency = db.Column(db.String(8), nullable=False, default="GHS")
    is_featured = db.Column(db.Boolean, nullable=False, default=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(30), nullable=False, default="ACTIVE")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    competition = db.relationship("Competition", back_populates="vote_packages")

    def to_dict(self):
        return {
            "id": self.id,
            "competition_id": self.competition_id,
            "name": self.name,
            "description": self.description,
            "vote_quantity": self.vote_quantity,
            "price_minor": self.price_minor,
            "price_major": round(self.price_minor / 100.0, 2),
            "currency": self.currency,
            "is_featured": self.is_featured,
            "sort_order": self.sort_order,
            "status": self.status,
        }
