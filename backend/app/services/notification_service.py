from app.extensions import db
from app.integrations.email.sender import send_email_message
from app.integrations.sms.sender import send_sms_message
from app.models.operations import Notification
from app.models.user import User


def notify_user(
    *,
    user_id: str,
    notif_type: str,
    title: str,
    body: str,
    action_url: str | None = None,
    send_external: bool = True,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        action_url=action_url,
        channel="IN_APP",
        delivery_status="DELIVERED",
    )
    db.session.add(notif)

    if send_external:
        user = db.session.get(User, user_id)
        if user:
            if user.email:
                send_email_message(user.email, title, body)
            if user.phone:
                send_sms_message(user.phone, f"{title}: {body[:140]}")
    return notif
