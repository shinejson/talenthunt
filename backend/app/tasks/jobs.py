from app.models.voting import Payment
from app.services.payment_service import reconcile_payment


def reconcile_all_pending_payments(actor=None, round_id: str | None = None) -> dict:
    q = Payment.query.filter(Payment.status.in_(["INITIALIZED", "PENDING"]))
    if round_id:
        from app.models.voting import Order
        q = q.join(Order, Payment.order_id == Order.id).filter(Order.round_id == round_id)

    pending_payments = q.limit(200).all()
    summary = {"checked": 0, "credited": 0, "failed": 0, "quarantined": 0, "still_pending": 0}
    for p in pending_payments:
        summary["checked"] += 1
        res = reconcile_payment(actor, p.id)
        outcome = res.get("outcome")
        if outcome == "CREDITED":
            summary["credited"] += 1
        elif outcome == "FAILED":
            summary["failed"] += 1
        elif outcome == "QUARANTINED":
            summary["quarantined"] += 1
        else:
            summary["still_pending"] += 1
    return summary
