from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class PaymentInitResult:
    provider: str
    provider_reference: str
    checkout_url: str
    status: str
    raw_metadata_safe: dict


@dataclass
class ProviderTransactionState:
    provider: str
    provider_reference: str
    provider_transaction_id: str | None
    order_reference: str
    amount_minor: int
    currency: str
    status: str  # PENDING, SUCCESS, FAILED, REFUNDED
    channel: str
    raw_metadata_safe: dict


class BasePaymentAdapter(ABC):
    provider_name: str = "base"

    @abstractmethod
    def initialize_payment(
        self,
        *,
        order_reference: str,
        amount_minor: int,
        currency: str,
        channel: str,
        customer_email: str | None = None,
        customer_phone: str | None = None,
        callback_url: str | None = None,
    ) -> PaymentInitResult:
        raise NotImplementedError

    @abstractmethod
    def verify_webhook_signature(self, raw_body: bytes, headers: dict) -> bool:
        raise NotImplementedError

    @abstractmethod
    def parse_webhook_event(self, payload: dict) -> dict:
        """Return normalized dict: event_id, provider_reference, provider_transaction_id, order_reference, amount_minor, currency, status, channel."""
        raise NotImplementedError

    @abstractmethod
    def inquire_transaction(self, provider_reference: str) -> ProviderTransactionState | None:
        raise NotImplementedError

    @abstractmethod
    def refund_transaction(self, provider_reference: str, amount_minor: int, reason: str) -> dict:
        raise NotImplementedError
