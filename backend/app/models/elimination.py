from app.extensions import db
from app.utils.security import new_uuid
from app.utils.time_utils import iso_utc, utcnow


class EliminationRun(db.Model):
    __tablename__ = "elimination_runs"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    round_id = db.Column(db.String(36), db.ForeignKey("rounds.id", ondelete="RESTRICT"), nullable=False, index=True)
    method = db.Column(db.String(40), nullable=False)  # top_n, percentage, threshold, manual, hybrid
    rules_snapshot = db.Column(db.JSON, nullable=False, default=dict)
    status = db.Column(db.String(30), nullable=False, default="FINALIZED")  # FINALIZED, CORRECTION
    notes = db.Column(db.Text, nullable=True)
    executed_by = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    executed_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    round = db.relationship("Round", lazy="joined")
    actor = db.relationship("User", lazy="joined")
    results = db.relationship(
        "EliminationResult",
        back_populates="elimination_run",
        order_by="EliminationResult.final_rank.asc()",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def to_dict(self, include_results: bool = True):
        data = {
            "id": self.id,
            "round_id": self.round_id,
            "round_name": self.round.name if self.round else None,
            "method": self.method,
            "rules_snapshot": self.rules_snapshot or {},
            "status": self.status,
            "notes": self.notes,
            "executed_by": self.executed_by,
            "executed_by_name": self.actor.full_name if self.actor else None,
            "executed_at": iso_utc(self.executed_at),
        }
        if include_results:
            data["results"] = [r.to_dict() for r in self.results]
        return data


class EliminationResult(db.Model):
    __tablename__ = "elimination_results"
    __table_args__ = (
        db.UniqueConstraint("elimination_run_id", "nominee_id", name="uq_elim_results_run_nominee"),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    elimination_run_id = db.Column(
        db.String(36),
        db.ForeignKey("elimination_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nominee_id = db.Column(db.String(36), db.ForeignKey("nominees.id", ondelete="RESTRICT"), nullable=False, index=True)
    round_entry_id = db.Column(db.String(36), db.ForeignKey("round_entries.id", ondelete="SET NULL"), nullable=True)
    final_votes = db.Column(db.Integer, nullable=False, default=0)
    judge_score = db.Column(db.Float, nullable=True, default=0.0)
    final_rank = db.Column(db.Integer, nullable=True)
    outcome = db.Column(db.String(30), nullable=False)  # QUALIFIED, ELIMINATED, DISQUALIFIED, WINNER
    advanced_to_round_id = db.Column(db.String(36), db.ForeignKey("rounds.id", ondelete="SET NULL"), nullable=True)
    reason = db.Column(db.Text, nullable=True)

    elimination_run = db.relationship("EliminationRun", back_populates="results")
    nominee = db.relationship("Nominee", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "elimination_run_id": self.elimination_run_id,
            "nominee_id": self.nominee_id,
            "nominee_name": self.nominee.public_name if self.nominee else None,
            "nominee_slug": self.nominee.public_slug if self.nominee else None,
            "category_name": (self.nominee.category.name if (self.nominee and self.nominee.category) else None),
            "final_votes": self.final_votes,
            "judge_score": self.judge_score,
            "final_rank": self.final_rank,
            "outcome": self.outcome,
            "advanced_to_round_id": self.advanced_to_round_id,
            "reason": self.reason,
        }
