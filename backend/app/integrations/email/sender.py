import logging
import smtplib
import ssl
from email.message import EmailMessage

from flask import current_app

logger = logging.getLogger(__name__)


def send_email_message(to_email: str | None, subject: str, body: str) -> bool:
    config = current_app.config
    if not to_email or not config.get("MAIL_SERVER") or not config.get("MAIL_DEFAULT_SENDER"):
        return False

    try:
        message = EmailMessage()
        message["From"] = config["MAIL_DEFAULT_SENDER"]
        message["To"] = to_email
        message["Subject"] = subject
        message.set_content(body)

        tls_context = ssl.create_default_context()
        if config["MAIL_USE_SSL"]:
            client = smtplib.SMTP_SSL(config["MAIL_SERVER"], config["MAIL_PORT"], timeout=8, context=tls_context)
        else:
            client = smtplib.SMTP(config["MAIL_SERVER"], config["MAIL_PORT"], timeout=8)
        with client as smtp:
            if not config["MAIL_USE_SSL"] and config["MAIL_USE_TLS"]:
                smtp.starttls(context=tls_context)
            if config["MAIL_USERNAME"]:
                smtp.login(config["MAIL_USERNAME"], config["MAIL_PASSWORD"])
            return not smtp.send_message(message)
    except (OSError, smtplib.SMTPException, ValueError) as exc:
        # Never include message content, credentials, or invitation links in logs.
        logger.warning("SMTP delivery failed (%s)", type(exc).__name__)
        return False
