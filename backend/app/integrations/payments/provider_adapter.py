from flask import current_app

from app.integrations.payments.base import BasePaymentAdapter
from app.integrations.payments.mock_adapter import MockPaymentAdapter
from app.integrations.payments.paystack_adapter import PaystackPaymentAdapter
from app.schemas import DomainError

_ADAPTERS: dict[str, type[BasePaymentAdapter]] = {
    "mock": MockPaymentAdapter,
    "paystack": PaystackPaymentAdapter,
}


def get_payment_adapter(provider_name: str | None = None) -> BasePaymentAdapter:
    name = (provider_name or current_app.config.get("PAYMENT_PROVIDER", "mock")).lower().strip()
    adapter_cls = _ADAPTERS.get(name)
    if not adapter_cls:
        raise DomainError("UNSUPPORTED_PROVIDER", f"Unsupported payment provider '{name}'.", 400)
    return adapter_cls()
