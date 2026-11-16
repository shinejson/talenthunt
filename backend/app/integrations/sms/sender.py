import logging

logger = logging.getLogger(__name__)


def send_sms_message(to_phone: str | None, message: str) -> bool:
    if not to_phone:
        return False
    logger.info("SMS_DISPATCH phone_suffix=%s len=%d", to_phone[-3:], len(message))
    return True
