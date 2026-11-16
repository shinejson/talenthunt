from app.extensions import db
from app.models.operations import AuditLog
from app.utils.security import get_client_ip_hash

REDACT_KEYS = {"password", "password_hash", "token", "secret", "verification_code", "reset_token"}


def _sanitize_dict(payload: dict | None) -> dict | None:
    if payload is None:
        return None
    cleaned = {}
    for k, v in payload.items():
        if k.lower() in REDACT_KEYS:
            cleaned[k] = "[REDACTED]"
        elif isinstance(v, dict):
            cleaned[k] = _sanitize_dict(v)
        else:
            cleaned[k] = v
    return cleaned


def log_audit(
    *,
    actor_user_id: str | None,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    ip_hash: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        before_json=_sanitize_dict(before),
        after_json=_sanitize_dict(after),
        ip_hash=ip_hash or get_client_ip_hash(),
    )
    db.session.add(entry)
    return entry
