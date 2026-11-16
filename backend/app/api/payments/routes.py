from flask import Blueprint, current_app, request

from app.extensions import limiter
from app.integrations.payments.mock_adapter import MockPaymentAdapter
from app.models.voting import Order, Payment
from app.schemas import DomainError
from app.services.payment_service import initialize_order_payment, process_webhook
from app.utils.responses import api_success

payments_bp = Blueprint("payments", __name__, url_prefix="/payments")


@payments_bp.post("/initialize")
@limiter.limit("30 per minute")
def initialize_payment_route():
    payload = request.get_json(silent=True) or {}
    order_ref = (payload.get("order_reference") or "").strip()
    if not order_ref:
        raise DomainError("VALIDATION_ERROR", "order_reference is required.", 422)
    callback_url = payload.get("callback_url")
    payment = initialize_order_payment(order_ref, callback_url=callback_url)
    return api_success(
        {
            "payment_id": payment.id,
            "order_reference": payment.order.public_reference,
            "provider": payment.provider,
            "provider_reference": payment.provider_reference,
            "checkout_url": payment.checkout_url,
            "amount_minor": payment.amount_minor,
            "amount_major": round(payment.amount_minor / 100.0, 2),
            "currency": payment.currency,
            "status": payment.status,
        },
        status_code=201,
    )


@payments_bp.post("/webhooks/<provider>")
@limiter.exempt
def provider_webhook_route(provider: str):
    raw_body = request.get_data()
    headers = dict(request.headers)
    res = process_webhook(provider, raw_body, headers)
    return api_success(res)


@payments_bp.get("/<reference>/status")
def check_payment_status_route(reference: str):
    payment = Payment.query.filter_by(provider_reference=reference).first()
    if not payment:
        order = Order.query.filter_by(public_reference=reference).first()
        if order and order.payments:
            payment = order.payments[0]
    if not payment:
        raise DomainError("PAYMENT_NOT_FOUND", "Payment reference not found.", 404)

    order = payment.order
    return api_success(
        {
            "provider": payment.provider,
            "provider_reference": payment.provider_reference,
            "payment_status": payment.status,
            "order_reference": order.public_reference if order else None,
            "order_status": order.status if order else None,
            "receipt_code": order.receipt_code if order else None,
            "vote_quantity": order.vote_quantity if order else None,
            "nominee_name": order.nominee.public_name if (order and order.nominee) else None,
            "amount_minor": payment.amount_minor,
            "amount_major": round(payment.amount_minor / 100.0, 2),
            "currency": payment.currency,
        }
    )


@payments_bp.get("/sandbox/<provider_reference>")
def get_sandbox_checkout_info(provider_reference: str):
    if current_app.config.get("PAYMENT_PROVIDER") != "mock":
        raise DomainError("SANDBOX_DISABLED", "Sandbox checkout is disabled in live payment mode.", 403)
    payment = Payment.query.filter_by(provider_reference=provider_reference, provider="mock").first()
    if not payment or not payment.order:
        raise DomainError("NOT_FOUND", "Sandbox checkout session not found.", 404)
    order = payment.order
    return api_success(
        {
            "provider_reference": payment.provider_reference,
            "payment_status": payment.status,
            "order": order.to_dict(include_finance=False),
            "networks": ["MTN Mobile Money", "Telecel Cash", "AirtelTigo Money", "Visa / Mastercard"],
        }
    )


@payments_bp.post("/sandbox/<provider_reference>/complete")
@limiter.limit("20 per minute")
def complete_sandbox_checkout(provider_reference: str):
    """Simulate external GhanaPay sandbox settlement by generating a signed webhook and processing it."""
    if current_app.config.get("PAYMENT_PROVIDER") != "mock":
        raise DomainError("SANDBOX_DISABLED", "Sandbox simulator is disabled in live payment mode.", 403)

    payment = Payment.query.filter_by(provider_reference=provider_reference, provider="mock").first()
    if not payment or not payment.order:
        raise DomainError("NOT_FOUND", "Sandbox checkout session not found.", 404)

    payload = request.get_json(silent=True) or {}
    outcome = (payload.get("outcome") or "SUCCESS").upper()
    network = (payload.get("network") or "MTN Mobile Money").strip()
    order = payment.order

    sim_amount = order.amount_minor
    sim_status = "SUCCESS"
    if outcome == "FAILED":
        sim_status = "FAILED"
    elif outcome == "MISMATCH":
        sim_amount = max(1, order.amount_minor - 50)

    raw_body, sig = MockPaymentAdapter.simulate_provider_settlement(
        provider_reference=payment.provider_reference,
        order_reference=order.public_reference,
        amount_minor=sim_amount,
        currency=order.currency,
        status=sim_status,
        channel=payment.channel,
        network=network,
    )
    webhook_res = process_webhook("mock", raw_body, {"X-Payment-Signature": sig})
    return api_success(
        {
            **webhook_res,
            "order": order.to_dict(include_finance=False),
        }
    )
