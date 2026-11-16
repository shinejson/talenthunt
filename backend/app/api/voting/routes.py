from flask import Blueprint, request

from app.extensions import limiter
from app.models.voting import Order
from app.policies.rbac import get_current_user
from app.schemas import DomainError
from app.services.payment_service import create_vote_order
from app.services.voting_service import resolve_voting_target
from app.utils.responses import api_success

voting_bp = Blueprint("voting", __name__)


@voting_bp.get("/voting/nominees/<slug>/packages")
def get_nominee_vote_packages(slug: str):
    resolved = resolve_voting_target(slug)
    comp = resolved.get("competition") or {}
    return api_success(
        {
            "nominee": resolved["nominee"],
            "round": resolved["round"],
            "can_vote": resolved["can_vote"],
            "block_reason": resolved["block_reason"],
            "packages": resolved["packages"],
            "allow_custom_quantity": comp.get("allow_custom_quantity", True),
            "unit_vote_price_minor": comp.get("unit_vote_price_minor", 100),
            "unit_vote_price_major": comp.get("unit_vote_price_major", 1.0),
            "min_vote_quantity": comp.get("min_vote_quantity", 1),
            "max_vote_quantity_per_order": comp.get("max_vote_quantity_per_order", 500),
            "currency": comp.get("currency", "GHS"),
        }
    )


@voting_bp.post("/orders")
@limiter.limit("30 per minute")
def create_order_route():
    payload = request.get_json(silent=True) or {}
    voter_user = get_current_user()
    idem_key = request.headers.get("Idempotency-Key") or payload.get("idempotency_key")
    order = create_vote_order(payload, voter_user=voter_user, idempotency_key=idem_key)
    return api_success(order.to_dict(include_finance=False), status_code=201)


@voting_bp.get("/orders/<reference>")
def get_order_status_route(reference: str):
    order = Order.query.filter_by(public_reference=reference).first()
    if not order:
        raise DomainError("ORDER_NOT_FOUND", "Order not found.", 404)
    latest_payment = order.payments[0] if order.payments else None
    out = order.to_dict(include_finance=False)
    out["latest_payment"] = (
        {
            "provider": latest_payment.provider,
            "provider_reference": latest_payment.provider_reference,
            "status": latest_payment.status,
            "checkout_url": latest_payment.checkout_url,
            "verified_at": latest_payment.to_dict()["verified_at"],
        }
        if latest_payment
        else None
    )
    return api_success(out)
