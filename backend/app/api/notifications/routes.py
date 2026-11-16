from flask import Blueprint

from app.extensions import db
from app.models.operations import Notification
from app.policies.rbac import get_current_user, login_required
from app.schemas import DomainError
from app.utils.pagination import paginate_query
from app.utils.responses import api_success
from app.utils.time_utils import utcnow

notifications_bp = Blueprint("notifications", __name__, url_prefix="/notifications")


@notifications_bp.get("")
@login_required
def list_notifications():
    user = get_current_user()
    q = Notification.query.filter_by(user_id=user.id).order_by(Notification.created_at.desc())
    items, meta = paginate_query(q, lambda n: n.to_dict(), default_per_page=25)
    unread_count = Notification.query.filter_by(user_id=user.id, read_at=None).count()
    meta["unread_count"] = unread_count
    return api_success(items, meta)


@notifications_bp.post("/<notif_id>/read")
@login_required
def mark_notification_read(notif_id: str):
    user = get_current_user()
    notif = db.session.get(Notification, notif_id)
    if not notif or notif.user_id != user.id:
        raise DomainError("NOT_FOUND", "Notification not found.", 404)
    if not notif.read_at:
        notif.read_at = utcnow()
        db.session.commit()
    return api_success(notif.to_dict())


@notifications_bp.post("/read-all")
@login_required
def mark_all_notifications_read():
    user = get_current_user()
    now = utcnow()
    Notification.query.filter_by(user_id=user.id, read_at=None).update({"read_at": now})
    db.session.commit()
    return api_success({"marked_all_read": True})
