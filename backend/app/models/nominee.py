from app.extensions import db
from app.utils.security import new_uuid
from app.utils.time_utils import iso_utc, utcnow

NOMINEE_STATUSES = {
    "PENDING",
    "ACTIVE",
    "QUALIFIED",
    "ELIMINATED",
    "DISQUALIFIED",
    "WINNER",
    "SUSPENDED",
}


class Nominee(db.Model):
    __tablename__ = "nominees"
    __table_args__ = (
        db.UniqueConstraint("competition_id", "category_id", "user_id", name="uq_nominees_comp_cat_user"),
        db.Index("ix_nominees_comp_status", "competition_id", "status"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    application_id = db.Column(db.String(36), db.ForeignKey("applications.id", ondelete="RESTRICT"), unique=True, nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    competition_id = db.Column(db.String(36), db.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = db.Column(db.String(36), db.ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True)
    public_name = db.Column(db.String(150), nullable=False)
    public_slug = db.Column(db.String(80), unique=True, nullable=False, index=True)
    tagline = db.Column(db.String(220), nullable=True)
    profile_text = db.Column(db.Text, nullable=True)
    location = db.Column(db.String(150), nullable=True)
    social_links = db.Column(db.JSON, nullable=False, default=dict)
    status = db.Column(db.String(30), nullable=False, default="ACTIVE", index=True)
    is_featured = db.Column(db.Boolean, nullable=False, default=False)
    voting_paused = db.Column(db.Boolean, nullable=False, default=False)
    disqualification_reason = db.Column(db.Text, nullable=True)
    nominated_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    application = db.relationship("Application", back_populates="nominee")
    user = db.relationship("User", lazy="joined")
    competition = db.relationship("Competition", lazy="joined")
    category = db.relationship("Category", lazy="joined")
    round_entries = db.relationship(
        "RoundEntry",
        back_populates="nominee",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def get_active_round_entry(self):
        open_entries = [
            re for re in self.round_entries
            if re.round and re.round.status == "OPEN"
        ]
        if open_entries:
            open_entries.sort(key=lambda x: x.round.sequence_no, reverse=True)
            return open_entries[0]
        if self.round_entries:
            sorted_entries = sorted(
                self.round_entries,
                key=lambda x: x.round.sequence_no if x.round else 0,
                reverse=True,
            )
            return sorted_entries[0]
        return None

    def to_public_dict(self, public_votes: int | None = None):
        # Audition materials from the public application form are for review, not public display.
        application = self.application
        guest = application and application.is_guest_application
        latest_sub = application.latest_submission if application and not guest else None
        profile_image = self.user.profile_image if self.user else None
        act_details = application if guest else self.user
        sub_dict = latest_sub.to_dict(include_moderation=False) if latest_sub else None
        active_entry = self.get_active_round_entry()
        active_voting_slug = (
            active_entry.voting_slug
            if active_entry and active_entry.link_enabled
            else self.public_slug
        )
        comp_slug = self.competition.slug if self.competition else ""
        data = {
            "id": self.id,
            "public_name": self.public_name,
            "public_slug": self.public_slug,
            "tagline": self.tagline,
            "profile_text": self.profile_text,
            "location": self.location,
            "social_links": self.social_links or {},
            "status": self.status,
            "is_featured": self.is_featured,
            "voting_paused": self.voting_paused,
            "competition_id": self.competition_id,
            "competition_title": self.competition.title if self.competition else None,
            "competition_slug": comp_slug,
            "currency": self.competition.currency if self.competition else "GHS",
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "profile_image": profile_image.to_dict() if profile_image and not profile_image.is_private else None,
            "is_group": act_details.is_group if act_details else False,
            "group_name": act_details.group_name if act_details else None,
            "group_member_count": act_details.group_member_count if act_details else None,
            "nominated_at": iso_utc(self.nominated_at),
            "demo": {
                "title": sub_dict["title"] if sub_dict else None,
                "description": sub_dict["description"] if sub_dict else None,
                "media_asset": sub_dict["media_asset"] if sub_dict else None,
                "external_video_url": sub_dict["external_video_url"] if sub_dict else None,
                "is_hidden": sub_dict["is_hidden"] if sub_dict else False,
            } if sub_dict else None,
            "current_round_entry": active_entry.to_dict() if active_entry else None,
            "voting_slug": active_voting_slug,
            "voting_path": f"/vote/{comp_slug}/{active_voting_slug}" if comp_slug else None,
        }
        if public_votes is not None:
            data["public_votes"] = public_votes
        return data


class RoundEntry(db.Model):
    __tablename__ = "round_entries"
    __table_args__ = (
        db.UniqueConstraint("round_id", "nominee_id", name="uq_round_entries_round_nominee"),
        db.Index("ix_round_entries_nominee_round", "nominee_id", "round_id"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    round_id = db.Column(db.String(36), db.ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False, index=True)
    nominee_id = db.Column(db.String(36), db.ForeignKey("nominees.id", ondelete="CASCADE"), nullable=False, index=True)
    voting_slug = db.Column(db.String(80), unique=True, nullable=False, index=True)
    link_enabled = db.Column(db.Boolean, nullable=False, default=True)
    status = db.Column(db.String(30), nullable=False, default="ACTIVE", index=True)  # PENDING, ACTIVE, QUALIFIED, ELIMINATED, DISQUALIFIED, WINNER
    judge_score = db.Column(db.Float, nullable=True, default=0.0)
    starting_total_snapshot = db.Column(db.Integer, nullable=False, default=0)
    final_total_snapshot = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    round = db.relationship("Round", lazy="joined")
    nominee = db.relationship("Nominee", back_populates="round_entries")

    def to_dict(self):
        return {
            "id": self.id,
            "round_id": self.round_id,
            "round_name": self.round.name if self.round else None,
            "round_sequence": self.round.sequence_no if self.round else None,
            "round_status": self.round.status if self.round else None,
            "voting_opens_at": iso_utc(self.round.voting_opens_at) if self.round else None,
            "voting_closes_at": iso_utc(self.round.voting_closes_at) if self.round else None,
            "is_voting_open": self.round.is_voting_window_open() if self.round else False,
            "nominee_id": self.nominee_id,
            "voting_slug": self.voting_slug,
            "link_enabled": self.link_enabled,
            "status": self.status,
            "judge_score": self.judge_score,
            "starting_total_snapshot": self.starting_total_snapshot,
            "final_total_snapshot": self.final_total_snapshot,
            "created_at": iso_utc(self.created_at),
        }
