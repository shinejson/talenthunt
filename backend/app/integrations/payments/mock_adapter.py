import json
import os
import secrets
from flask import current_app, has_app_context

from app.integrations.payments.base import BasePaymentAdapter, PaymentInitResult, ProviderTransactionState
from app.utils.security import compute_hmac_sha256, verify_hmac_sha256

# Authoritative server-side sandbox ledger simulating external gateway state
_MOCK_PROVIDER_TRANSACTIONS: dict[str, dict] = {}


def reset_mock_provider_store():
    _MOCK_PROVIDER_TRANSACTIONS.clear()


def register_settled_mock_tx(
    *,
    provider_reference: str,
    provider_transaction_id: str,
    order_reference: str,
    amount_minor: int,
    currency: str,
    channel: str = "mobile_money",
    status: str = "SUCCESS",
):
    _MOCK_PROVIDER_TRANSACTIONS[provider_reference] = {
        "provider_reference": provider_reference,
        "provider_transaction_id": provider_transaction_id,
        "order_reference": order_reference,
        "amount_minor": amount_minor,
        "currency": currency,
        "channel": channel,
        "status": status,
        "network": "MTN Mobile Money" if channel == "mobile_money" else "Visa/Mastercard",
    }


class MockPaymentAdapter(BasePaymentAdapter):
    provider_name = "mock"

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
        provider_ref = f"GPAY-{secrets.token_hex(6).upper()}"
        checkout_url = f"/checkout/sandbox/{provider_ref}"
        meta = {
            "gateway": "GhanaPay Sandbox",
            "order_reference": order_reference,
            "supported_networks": ["MTN MoMo", "Telecel Cash", "AirtelTigo Money", "Visa/Mastercard"],
            "requested_channel": channel,
        }
        _MOCK_PROVIDER_TRANSACTIONS[provider_ref] = {
            "provider_reference": provider_ref,
            "provider_transaction_id": None,
            "order_reference": order_reference,
            "amount_minor": amount_minor,
            "currency": currency,
            "channel": channel,
            "status": "PENDING",
            "network": None,
        }
        return PaymentInitResult(
            provider=self.provider_name,
            provider_reference=provider_ref,
            checkout_url=checkout_url,
            status="PENDING",
            raw_metadata_safe=meta,
        )

    def verify_webhook_signature(self, raw_body: bytes, headers: dict) -> bool:
        secret = current_app.config.get("PAYMENT_WEBHOOK_SECRET", "mock-webhook-secret")
        sig = (
            headers.get("X-Payment-Signature")
            or headers.get("x-payment-signature")
            or headers.get("X-Webhook-Signature")
        )
        return verify_hmac_sha256(secret, raw_body, sig)

    def parse_webhook_event(self, payload: dict) -> dict:
        data = payload.get("data") or payload
        return {
            "event_id": str(payload.get("event_id") or data.get("event_id") or ""),
            "provider_reference": str(data.get("provider_reference") or ""),
            "provider_transaction_id": data.get("provider_transaction_id"),
            "order_reference": str(data.get("order_reference") or ""),
            "amount_minor": int(data.get("amount_minor") or 0),
            "currency": str(data.get("currency") or "").upper(),
            "status": str(data.get("status") or "").upper(),
            "channel": str(data.get("channel") or "mobile_money"),
            "raw_metadata_safe": {
                "event_type": payload.get("event_type", "charge.completed"),
                "network": data.get("network", "MTN Mobile Money"),
            },
        }

    def inquire_transaction(self, provider_reference: str) -> ProviderTransactionState | None:
        rec = _MOCK_PROVIDER_TRANSACTIONS.get(provider_reference)
        if not rec:
            return None
        return ProviderTransactionState(
            provider=self.provider_name,
            provider_reference=rec["provider_reference"],
            provider_transaction_id=rec.get("provider_transaction_id"),
            order_reference=rec["order_reference"],
            amount_minor=rec["amount_minor"],
            currency=rec["currency"],
            status=rec["status"],
            channel=rec.get("channel", "mobile_money"),
            raw_metadata_safe={"network": rec.get("network") or "MTN Mobile Money"},
        )

    def refund_transaction(self, provider_reference: str, amount_minor: int, reason: str) -> dict:
        rec = _MOCK_PROVIDER_TRANSACTIONS.get(provider_reference)
        if rec:
            rec["status"] = "REFUNDED"
        return {
            "refund_reference": f"RFD-{secrets.token_hex(5).upper()}",
            "provider_reference": provider_reference,
            "amount_minor": amount_minor,
            "status": "REFUNDED",
            "reason": reason,
        }

    @staticmethod
    def simulate_provider_settlement(
        *,
        provider_reference: str,
        order_reference: str,
        amount_minor: int,
        currency: str,
        status: str = "SUCCESS",
        channel: str = "mobile_money",
        network: str = "MTN Mobile Money",
        event_id: str | None = None,
    ) -> tuple[bytes, str]:
        """Update sandbox gateway state and generate a signed webhook body + HMAC signature."""
        tx_id = _MOCK_PROVIDER_TRANSACTIONS.get(provider_reference, {}).get("provider_transaction_id")
        if not tx_id:
            tx_id = f"TXN-{secrets.token_hex(6).upper()}"

        _MOCK_PROVIDER_TRANSACTIONS[provider_reference] = {
            "provider_reference": provider_reference,
            "provider_transaction_id": tx_id,
            "order_reference": order_reference,
            "amount_minor": amount_minor,
            "currency": currency,
            "channel": channel,
            "status": status.upper(),
            "network": network,
        }
        evt_id = event_id or f"evt_{secrets.token_hex(8)}"
        webhook_payload = {
            "event_id": evt_id,
            "event_type": "charge.success" if status.upper() == "SUCCESS" else "charge.failed",
            "data": {
                "provider_reference": provider_reference,
                "provider_transaction_id": tx_id,
                "order_reference": order_reference,
                "amount_minor": amount_minor,
                "currency": currency,
                "status": status.upper(),
                "channel": channel,
                "network": network,
            },
        }
        raw_body = json.dumps(webhook_payload, separators=(",", ":")).encode("utf-8")
        secret = (
            current_app.config.get("PAYMENT_WEBHOOK_SECRET", "mock-webhook-secret")
            if has_app_context()
            else os.environ.get("PAYMENT_WEBHOOK_SECRET", "mock-webhook-secret")
        )
        signature = compute_hmac_sha256(secret, raw_body)
        return raw_body, signature
