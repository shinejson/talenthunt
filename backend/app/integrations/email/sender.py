import logging

logger = logging.getLogger(__name__)


def send_email_message(to_email: str | None, subject: str, body: str) -> bool:
    if not to_email:
        return False
    logger.info("EMAIL_DISPATCH to=%s subject=%s", to_email, subject)
    return True
