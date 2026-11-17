from flask import current_app

from app.integrations.payments.base import BasePaymentAdapter
from app.integrations.payments.mock_adapter import MockPaymentAdapter
from app.integrations.payments.paystack_adapter import PaystackPaymentAdapter
from app.schemas import DomainError

_ADAPTERS: dict[str, type[BasePaymentAdapter]] = {
    "mock": MockPaymentAdapter,
    "paystack": PaystackPaymentAdapter,
}


def get_payment_gateway_settings() -> dict:
    """Retrieve platform payment gateway configuration from database settings if available."""
    try:
        from app.models.operations import PlatformSetting
        rec = PlatformSetting.query.filter_by(key="payment_gateway").first()
        if rec and isinstance(rec.value_json, dict):
            return rec.value_json
    except Exception:
        pass
    return {}


def get_payment_adapter(provider_name: str | None = None) -> BasePaymentAdapter:
    configured_provider = None
    if not provider_name:
        gateway_cfg = get_payment_gateway_settings()
        configured_provider = gateway_cfg.get("active_provider")
    name = (provider_name or configured_provider or current_app.config.get("PAYMENT_PROVIDER", "mock")).lower().strip()
    adapter_cls = _ADAPTERS.get(name)
    if not adapter_cls:
        raise DomainError("UNSUPPORTED_PROVIDER", f"Unsupported payment provider '{name}'.", 400)
    return adapter_cls()
