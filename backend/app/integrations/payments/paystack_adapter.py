import hashlib
import hmac
import secrets
import httpx
from flask import current_app

from app.integrations.payments.base import BasePaymentAdapter, PaymentInitResult, ProviderTransactionState
from app.schemas import DomainError


class PaystackPaymentAdapter(BasePaymentAdapter):
    """Ghana GHS Paystack integration adapter (mobile_money + card)."""

    provider_name = "paystack"

    def _headers(self) -> dict:
        secret = current_app.config.get("PAYSTACK_SECRET_KEY", "")
        if not secret:
            raise DomainError("PAYMENT_CONFIG_ERROR", "Paystack secret key is not configured.", 500)
        return {
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        }

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
        base_url = current_app.config.get("PAYSTACK_BASE_URL", "https://api.paystack.co")
        provider_ref = f"PSTK-{order_reference}-{secrets.token_hex(3).upper()}"
        body = {
            "email": customer_email or "voter@stagelight.gh",
            "amount": amount_minor,
            "currency": currency,
            "reference": provider_ref,
            "channels": [channel] if channel in ("mobile_money", "card") else ["mobile_money", "card"],
            "metadata": {
                "order_reference": order_reference,
                "voter_phone": customer_phone,
            },
        }
        if callback_url:
            body["callback_url"] = callback_url
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(f"{base_url}/transaction/initialize", json=body, headers=self._headers())
            data = resp.json()
        if resp.status_code >= 400 or not data.get("status"):
            raise DomainError("PAYMENT_PROVIDER_ERROR", "Unable to initialize Paystack checkout.", 502)
        tx = data.get("data", {})
        return PaymentInitResult(
            provider=self.provider_name,
            provider_reference=tx.get("reference", provider_ref),
            checkout_url=tx.get("authorization_url", ""),
            status="PENDING",
            raw_metadata_safe={"access_code": tx.get("access_code")},
        )

    def verify_webhook_signature(self, raw_body: bytes, headers: dict) -> bool:
        secret = current_app.config.get("PAYSTACK_SECRET_KEY") or current_app.config.get("PAYMENT_WEBHOOK_SECRET", "")
        sig = headers.get("X-Paystack-Signature") or headers.get("x-paystack-signature")
        if not secret or not sig:
            return False
        expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
        return hmac.compare_digest(expected, sig.strip())

    def parse_webhook_event(self, payload: dict) -> dict:
        data = payload.get("data") or {}
        meta = data.get("metadata") or {}
        raw_status = str(data.get("status") or "").lower()
        norm_status = "SUCCESS" if raw_status == "success" else ("FAILED" if raw_status in ("failed", "abandoned") else "PENDING")
        return {
            "event_id": f"{payload.get('event', 'evt')}:{data.get('id') or data.get('reference')}",
            "provider_reference": str(data.get("reference") or ""),
            "provider_transaction_id": str(data.get("id")) if data.get("id") else None,
            "order_reference": str(meta.get("order_reference") or ""),
            "amount_minor": int(data.get("amount") or 0),
            "currency": str(data.get("currency") or "GHS").upper(),
            "status": norm_status,
            "channel": str(data.get("channel") or "mobile_money"),
            "raw_metadata_safe": {"gateway_response": data.get("gateway_response")},
        }

    def inquire_transaction(self, provider_reference: str) -> ProviderTransactionState | None:
        base_url = current_app.config.get("PAYSTACK_BASE_URL", "https://api.paystack.co")
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(f"{base_url}/transaction/verify/{provider_reference}", headers=self._headers())
            if resp.status_code == 404:
                return None
            payload = resp.json()
        data = payload.get("data") or {}
        meta = data.get("metadata") or {}
        raw_status = str(data.get("status") or "").lower()
        norm_status = "SUCCESS" if raw_status == "success" else ("FAILED" if raw_status in ("failed", "abandoned") else "PENDING")
        return ProviderTransactionState(
            provider=self.provider_name,
            provider_reference=str(data.get("reference") or provider_reference),
            provider_transaction_id=str(data.get("id")) if data.get("id") else None,
            order_reference=str(meta.get("order_reference") or ""),
            amount_minor=int(data.get("amount") or 0),
            currency=str(data.get("currency") or "GHS").upper(),
            status=norm_status,
            channel=str(data.get("channel") or "mobile_money"),
            raw_metadata_safe={"gateway_response": data.get("gateway_response")},
        )

    def refund_transaction(self, provider_reference: str, amount_minor: int, reason: str) -> dict:
        base_url = current_app.config.get("PAYSTACK_BASE_URL", "https://api.paystack.co")
        body = {"transaction": provider_reference, "amount": amount_minor, "merchant_note": reason}
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(f"{base_url}/refund", json=body, headers=self._headers())
            data = resp.json()
        if resp.status_code >= 400 or not data.get("status"):
            raise DomainError("REFUND_FAILED", "Provider refund request failed.", 502)
        return {"status": "REFUNDED", "provider_reference": provider_reference, "amount_minor": amount_minor}
