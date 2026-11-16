import hashlib
import json
from datetime import timedelta
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.integrations.payments.provider_adapter import get_payment_adapter
from app.models.competition import Round, VotePackage
from app.models.nominee import Nominee, RoundEntry
from app.models.operations import ModerationReport
from app.models.user import User
from app.models.voting import Order, Payment, VoteLedger, WebhookEvent
from app.schemas import DomainError, OrderCreateSchema, validate_payload
from app.services.audit_service import log_audit
from app.services.notification_service import notify_user
from app.services.voting_service import is_global_voting_paused
from app.utils.security import generate_reference, get_client_ip_hash
from app.utils.time_utils import utcnow


def create_vote_order(
    raw_payload: dict,
    voter_user: User | None = None,
    idempotency_key: str | None = None,
) -> Order:
    if idempotency_key:
        existing = Order.query.filter_by(idempotency_key=idempotency_key.strip()).first()
        if existing:
            return existing

    data = validate_payload(OrderCreateSchema, raw_payload)
    global_paused, global_msg = is_global_voting_paused()
    if global_paused:
        raise DomainError("VOTING_PAUSED", global_msg or "Voting is temporarily paused.", 403)

    entry = None
    nominee = None
    round_obj = None

    if data.get("voting_slug"):
        slug = data["voting_slug"].strip()
        entry = RoundEntry.query.filter_by(voting_slug=slug).first()
        if entry:
            if not entry.link_enabled:
                raise DomainError("LINK_DISABLED", "This voting link has been disabled or reissued.", 400)
            nominee = entry.nominee
            round_obj = entry.round
        else:
            nominee = Nominee.query.filter_by(public_slug=slug).first()

    if not nominee and data.get("nominee_id"):
        nominee = db.session.get(Nominee, data["nominee_id"])

    if not nominee:
        raise DomainError("NOMINEE_NOT_FOUND", "Nominee not found.", 404)

    comp = nominee.competition
    if not comp or comp.voting_paused:
        raise DomainError("VOTING_PAUSED", "Voting for this competition is currently paused.", 403)
    if nominee.voting_paused:
        raise DomainError("NOMINEE_PAUSED", "Voting for this nominee is temporarily paused.", 403)
    if nominee.status in ("ELIMINATED", "DISQUALIFIED", "SUSPENDED", "PENDING"):
        raise DomainError("NOMINEE_INELIGIBLE", f"Nominee ({nominee.status}) is not eligible to receive votes.", 400)

    if not entry:
        if data.get("round_id"):
            entry = RoundEntry.query.filter_by(nominee_id=nominee.id, round_id=data["round_id"]).first()
        else:
            entry = nominee.get_active_round_entry()
        round_obj = entry.round if entry else None

    if not entry or not round_obj:
        raise DomainError("NO_ACTIVE_ROUND", "Nominee is not enrolled in an active voting round.", 400)

    if entry.status != "ACTIVE":
        raise DomainError("ENTRY_INELIGIBLE", f"Nominee round status is '{entry.status}'; votes cannot be cast.", 400)

    now = utcnow()
    if not round_obj.is_voting_window_open(now):
        raise DomainError(
            "ROUND_NOT_OPEN",
            f"Voting is not currently open for {round_obj.name}.",
            400,
        )

    # Calculate price exclusively from trusted server database pricing (Section 12.1 step 3)
    package = None
    if data.get("package_id"):
        package = db.session.get(VotePackage, data["package_id"])
        if not package or package.competition_id != comp.id or package.status != "ACTIVE":
            raise DomainError("INVALID_PACKAGE", "Selected vote package is not available.", 422)
        vote_qty = package.vote_quantity
        amount_minor = package.price_minor
        unit_price_minor = max(1, round(amount_minor / max(1, vote_qty)))
        package_name = package.name
    else:
        if not comp.allow_custom_quantity:
            raise DomainError("CUSTOM_QUANTITY_DISABLED", "Please choose one of the configured vote packages.", 422)
        vote_qty = int(data["vote_quantity"])
        unit_price_minor = comp.unit_vote_price_minor
        amount_minor = vote_qty * unit_price_minor
        package_name = f"Custom ({vote_qty} votes)"

    if vote_qty < comp.min_vote_quantity or vote_qty > comp.max_vote_quantity_per_order:
        raise DomainError(
            "VOTE_LIMIT_EXCEEDED",
            f"Vote quantity per order must be between {comp.min_vote_quantity} and {comp.max_vote_quantity_per_order}.",
            422,
        )

    voter_phone = (data.get("voter_phone") or (voter_user.phone if voter_user else "") or "").strip() or None
    voter_email = (data.get("voter_email") or (voter_user.email if voter_user else "") or "").strip().lower() or None

    # Enforce daily per-contact / per-account limit when configured (FR-VOTE-010)
    if comp.max_votes_per_day_per_contact and (voter_phone or voter_email or voter_user):
        since = now - timedelta(hours=24)
        q = db.session.query(func.coalesce(func.sum(Order.vote_quantity), 0)).filter(
            Order.round_id == round_obj.id,
            Order.status == "PAID",
            Order.created_at >= since,
        )
        filters = []
        if voter_user:
            filters.append(Order.voter_user_id == voter_user.id)
        if voter_phone:
            filters.append(Order.voter_phone == voter_phone)
        if voter_email:
            filters.append(Order.voter_email == voter_email)
        if filters:
            from sqlalchemy import or_
            recent_paid_votes = int(q.filter(or_(*filters)).scalar() or 0)
            if recent_paid_votes + vote_qty > comp.max_votes_per_day_per_contact:
                raise DomainError(
                    "DAILY_LIMIT_EXCEEDED",
                    f"Daily voting limit ({comp.max_votes_per_day_per_contact} votes per 24h) reached for this voter.",
                    429,
                )

    pub_ref = generate_reference("ORD")
    while Order.query.filter_by(public_reference=pub_ref).first():
        pub_ref = generate_reference("ORD")

    order = Order(
        public_reference=pub_ref,
        idempotency_key=idempotency_key.strip() if idempotency_key else None,
        voter_user_id=voter_user.id if voter_user else None,
        voter_name=(data.get("voter_name") or (voter_user.full_name if voter_user else "") or "").strip() or None,
        voter_email=voter_email,
        voter_phone=voter_phone,
        payment_channel=data.get("payment_channel") or "mobile_money",
        nominee_id=nominee.id,
        round_id=round_obj.id,
        round_entry_id=entry.id,
        package_id=package.id if package else None,
        package_name_snapshot=package_name,
        vote_quantity=vote_qty,
        unit_price_minor=unit_price_minor,
        fee_minor=0,
        amount_minor=amount_minor,
        currency=comp.currency,
        status="PENDING_PAYMENT",
        ip_hash=get_client_ip_hash(),
    )
    db.session.add(order)
    db.session.commit()
    return order


def initialize_order_payment(order_reference: str, callback_url: str | None = None, provider_name: str | None = None) -> Payment:
    order = Order.query.filter_by(public_reference=order_reference).first()
    if not order:
        raise DomainError("ORDER_NOT_FOUND", "Order not found.", 404)
    if order.status == "PAID":
        raise DomainError("ORDER_ALREADY_PAID", "This order has already been paid and credited.", 409)
    if order.status not in ("PENDING_PAYMENT", "FAILED"):
        raise DomainError("ORDER_NOT_PAYABLE", f"Order in status '{order.status}' cannot initiate payment.", 400)

    round_obj = order.round
    if not round_obj or not round_obj.is_voting_window_open():
        raise DomainError("ROUND_NOT_OPEN", "Voting round has closed; new payment initialization is blocked.", 400)

    adapter = get_payment_adapter(provider_name)
    init_res = adapter.initialize_payment(
        order_reference=order.public_reference,
        amount_minor=order.amount_minor,
        currency=order.currency,
        channel=order.payment_channel,
        customer_email=order.voter_email,
        customer_phone=order.voter_phone,
        callback_url=callback_url,
    )

    order.status = "PENDING_PAYMENT"
    payment = Payment(
        order_id=order.id,
        provider=init_res.provider,
        channel=order.payment_channel,
        provider_reference=init_res.provider_reference,
        checkout_url=init_res.checkout_url,
        amount_minor=order.amount_minor,
        currency=order.currency,
        status="PENDING",
        raw_metadata_safe=init_res.raw_metadata_safe,
    )
    db.session.add(payment)
    db.session.commit()
    return payment


def _settle_verified_transaction(
    *,
    payment: Payment,
    order: Order,
    provider_transaction_id: str | None,
    verified_amount_minor: int,
    verified_currency: str,
    verified_order_ref: str,
    verified_status: str,
    metadata: dict | None = None,
) -> dict:
    """Core atomic settlement & vote-ledger crediting with quarantine & grace-period checks."""
    now = utcnow()
    merged_meta = {**(payment.raw_metadata_safe or {}), **(metadata or {})}
    payment.raw_metadata_safe = merged_meta

    # Already paid idempotency guard
    existing_credit = VoteLedger.query.filter_by(payment_id=payment.id, entry_type="CREDIT").first()
    if existing_credit or order.status == "PAID":
        return {"outcome": "DUPLICATE_IGNORED", "order": order, "payment": payment, "votes_credited": 0}

    # Verify amount, currency, and order reference match (Acceptance Scenario 9)
    mismatch_reasons = []
    if verified_order_ref and verified_order_ref != order.public_reference:
        mismatch_reasons.append(f"order_reference mismatch ({verified_order_ref} != {order.public_reference})")
    if int(verified_amount_minor) != int(order.amount_minor):
        mismatch_reasons.append(f"amount mismatch ({verified_amount_minor} != {order.amount_minor})")
    if verified_currency.upper() != order.currency.upper():
        mismatch_reasons.append(f"currency mismatch ({verified_currency} != {order.currency})")

    # Check round grace period if round already closed (FR-VOTE-015)
    round_obj = order.round
    if round_obj:
        if round_obj.status == "FINALIZED":
            mismatch_reasons.append("round already finalized")
        elif round_obj.voting_closes_at and now > round_obj.voting_closes_at:
            grace_mins = int((round_obj.elimination_config or {}).get("pending_payment_grace_minutes", 30))
            if order.created_at > round_obj.voting_closes_at or now > (round_obj.voting_closes_at + timedelta(minutes=grace_mins)):
                mismatch_reasons.append("payment arrived outside post-close grace period")

    if mismatch_reasons:
        reason_str = "; ".join(mismatch_reasons)
        payment.status = "QUARANTINED"
        payment.provider_transaction_id = provider_transaction_id or payment.provider_transaction_id
        payment.raw_metadata_safe = {**merged_meta, "quarantine_reason": reason_str}
        order.status = "QUARANTINED"
        db.session.add(
            ModerationReport(
                entity_type="VOTING_ANOMALY",
                entity_id=order.id,
                reason="PAYMENT_QUARANTINED",
                details=f"Order {order.public_reference} / Payment {payment.provider_reference} quarantined: {reason_str}",
                status="OPEN",
            )
        )
        log_audit(
            actor_user_id=None,
            action="PAYMENT_QUARANTINED",
            entity_type="payment",
            entity_id=payment.id,
            after={"order_reference": order.public_reference, "reason": reason_str},
        )
        return {"outcome": "QUARANTINED", "reason": reason_str, "order": order, "payment": payment, "votes_credited": 0}

    if verified_status == "FAILED":
        payment.status = "FAILED"
        payment.provider_transaction_id = provider_transaction_id or payment.provider_transaction_id
        if order.status == "PENDING_PAYMENT":
            order.status = "FAILED"
        return {"outcome": "FAILED", "order": order, "payment": payment, "votes_credited": 0}

    if verified_status != "SUCCESS":
        return {"outcome": "PENDING", "order": order, "payment": payment, "votes_credited": 0}

    # Verified SUCCESS -> atomically credit exact vote quantity once
    payment.status = "SUCCESS"
    payment.provider_transaction_id = provider_transaction_id or payment.provider_transaction_id
    payment.verified_at = now

    receipt = order.receipt_code
    if not receipt:
        receipt = generate_reference("TH")
        while Order.query.filter_by(receipt_code=receipt).first():
            receipt = generate_reference("TH")
    order.receipt_code = receipt
    order.status = "PAID"
    order.paid_at = now

    ledger_entry = VoteLedger(
        order_id=order.id,
        payment_id=payment.id,
        nominee_id=order.nominee_id,
        round_id=order.round_id,
        quantity=order.vote_quantity,
        entry_type="CREDIT",
        reason=f"Verified payment {payment.provider_reference}",
    )
    db.session.add(ledger_entry)

    # Spike monitoring (Section 15: flag unusual spikes for human review, never auto-punish)
    if order.vote_quantity >= 250:
        db.session.add(
            ModerationReport(
                entity_type="VOTING_ANOMALY",
                entity_id=order.id,
                reason="HIGH_VOLUME_ORDER_REVIEW",
                details=f"Large verified vote purchase ({order.vote_quantity} votes) on order {order.public_reference}.",
                status="OPEN",
            )
        )

    if order.voter_user_id:
        notify_user(
            user_id=order.voter_user_id,
            notif_type="PAYMENT_RECEIPT",
            title=f"Vote Confirmed — Receipt {receipt}",
            body=f"Your {order.vote_quantity} vote(s) for {order.nominee.public_name if order.nominee else 'nominee'} have been verified and recorded.",
        )

    log_audit(
        actor_user_id=order.voter_user_id,
        action="VOTES_CREDITED",
        entity_type="order",
        entity_id=order.id,
        after={
            "order_reference": order.public_reference,
            "receipt_code": receipt,
            "payment_reference": payment.provider_reference,
            "vote_quantity": order.vote_quantity,
            "nominee_id": order.nominee_id,
            "round_id": order.round_id,
        },
    )
    return {"outcome": "CREDITED", "order": order, "payment": payment, "votes_credited": order.vote_quantity}


def process_webhook(provider_name: str, raw_body: bytes, headers: dict) -> dict:
    adapter = get_payment_adapter(provider_name)
    payload_hash = hashlib.sha256(raw_body).hexdigest()

    if not adapter.verify_webhook_signature(raw_body, headers):
        log_audit(
            actor_user_id=None,
            action="WEBHOOK_SIGNATURE_INVALID",
            entity_type="webhook",
            entity_id=provider_name,
            after={"payload_hash": payload_hash},
        )
        db.session.commit()
        raise DomainError("INVALID_WEBHOOK_SIGNATURE", "Webhook signature verification failed.", 401)

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception as exc:
        raise DomainError("INVALID_WEBHOOK_JSON", "Malformed webhook JSON body.", 400) from exc

    parsed = adapter.parse_webhook_event(payload)
    event_id = parsed["event_id"]
    if not event_id:
        raise DomainError("MISSING_EVENT_ID", "Webhook event_id is required.", 400)

    # Idempotency check on (provider, event_id)
    existing_evt = WebhookEvent.query.filter_by(provider=adapter.provider_name, event_id=event_id).first()
    if existing_evt and existing_evt.status in ("PROCESSED", "QUARANTINED", "DUPLICATE"):
        return {
            "duplicate": True,
            "event_id": event_id,
            "status": existing_evt.status,
            "votes_credited": 0,
        }

    webhook_rec = existing_evt or WebhookEvent(
        provider=adapter.provider_name,
        event_id=event_id,
        payload_hash=payload_hash,
        signature_valid=True,
        status="RECEIVED",
    )
    if not existing_evt:
        db.session.add(webhook_rec)
        try:
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            return {"duplicate": True, "event_id": event_id, "status": "DUPLICATE", "votes_credited": 0}

    provider_ref = parsed["provider_reference"]
    payment = (
        Payment.query.filter_by(provider_reference=provider_ref)
        .with_for_update()
        .first()
    )
    if not payment:
        webhook_rec.status = "IGNORED"
        webhook_rec.processed_at = utcnow()
        webhook_rec.notes = f"Unknown provider_reference {provider_ref}"
        db.session.commit()
        return {"duplicate": False, "status": "IGNORED", "votes_credited": 0}

    order = Order.query.filter_by(id=payment.order_id).with_for_update().first()

    # Cross-check with provider status inquiry when available (Section 4.3 step 7)
    inquired = adapter.inquire_transaction(provider_ref)
    if inquired:
        verified_amount = inquired.amount_minor
        verified_currency = inquired.currency
        verified_order_ref = inquired.order_reference or parsed["order_reference"]
        verified_status = inquired.status
        verified_tx_id = inquired.provider_transaction_id or parsed["provider_transaction_id"]
        extra_meta = {**parsed.get("raw_metadata_safe", {}), **(inquired.raw_metadata_safe or {})}
    else:
        verified_amount = parsed["amount_minor"]
        verified_currency = parsed["currency"]
        verified_order_ref = parsed["order_reference"]
        verified_status = parsed["status"]
        verified_tx_id = parsed["provider_transaction_id"]
        extra_meta = parsed.get("raw_metadata_safe", {})

    result = _settle_verified_transaction(
        payment=payment,
        order=order,
        provider_transaction_id=verified_tx_id,
        verified_amount_minor=verified_amount,
        verified_currency=verified_currency,
        verified_order_ref=verified_order_ref,
        verified_status=verified_status,
        metadata=extra_meta,
    )

    webhook_rec.processed_at = utcnow()
    webhook_rec.status = "QUARANTINED" if result["outcome"] == "QUARANTINED" else "PROCESSED"
    webhook_rec.notes = result["outcome"]
    db.session.commit()

    return {
        "duplicate": result["outcome"] == "DUPLICATE_IGNORED",
        "outcome": result["outcome"],
        "order_reference": order.public_reference,
        "receipt_code": order.receipt_code,
        "votes_credited": result["votes_credited"],
    }


def reconcile_payment(actor: User | None, payment_id: str) -> dict:
    payment = Payment.query.filter_by(id=payment_id).with_for_update().first()
    if not payment:
        raise DomainError("PAYMENT_NOT_FOUND", "Payment record not found.", 404)
    order = Order.query.filter_by(id=payment.order_id).with_for_update().first()

    adapter = get_payment_adapter(payment.provider)
    inquired = adapter.inquire_transaction(payment.provider_reference)
    if not inquired:
        log_audit(
            actor_user_id=actor.id if actor else None,
            action="PAYMENT_RECONCILE_NOT_FOUND_AT_PROVIDER",
            entity_type="payment",
            entity_id=payment.id,
        )
        db.session.commit()
        return {"outcome": "PROVIDER_NOT_FOUND", "payment": payment.to_dict(), "order": order.to_dict(include_finance=True)}

    result = _settle_verified_transaction(
        payment=payment,
        order=order,
        provider_transaction_id=inquired.provider_transaction_id,
        verified_amount_minor=inquired.amount_minor,
        verified_currency=inquired.currency,
        verified_order_ref=inquired.order_reference,
        verified_status=inquired.status,
        metadata=inquired.raw_metadata_safe,
    )
    log_audit(
        actor_user_id=actor.id if actor else None,
        action="PAYMENT_RECONCILED",
        entity_type="payment",
        entity_id=payment.id,
        after={"outcome": result["outcome"], "payment_status": payment.status},
    )
    db.session.commit()
    return {
        "outcome": result["outcome"],
        "votes_credited": result["votes_credited"],
        "payment": payment.to_dict(),
        "order": order.to_dict(include_finance=True),
    }


def refund_payment(actor: User, payment_id: str, reason: str) -> dict:
    if not (reason or "").strip() or len(reason.strip()) < 4:
        raise DomainError("REASON_REQUIRED", "A refund reason is required.", 422)

    payment = Payment.query.filter_by(id=payment_id).with_for_update().first()
    if not payment:
        raise DomainError("PAYMENT_NOT_FOUND", "Payment not found.", 404)
    if payment.status == "REFUNDED":
        raise DomainError("ALREADY_REFUNDED", "This payment has already been refunded.", 409)
    if payment.status != "SUCCESS":
        raise DomainError("INVALID_PAYMENT_STATE", f"Only successful payments can be refunded (current: {payment.status}).", 400)

    order = Order.query.filter_by(id=payment.order_id).with_for_update().first()
    credit_entry = VoteLedger.query.filter_by(payment_id=payment.id, entry_type="CREDIT").first()
    if not credit_entry:
        raise DomainError("LEDGER_CREDIT_NOT_FOUND", "No vote credit entry found for this payment.", 404)

    existing_rev = VoteLedger.query.filter_by(reverses_entry_id=credit_entry.id).first()
    if existing_rev:
        raise DomainError("ALREADY_REVERSED", "Votes for this payment were already reversed.", 409)

    adapter = get_payment_adapter(payment.provider)
    refund_res = adapter.refund_transaction(payment.provider_reference, payment.amount_minor, reason.strip())

    payment.status = "REFUNDED"
    payment.refunded_at = utcnow()
    payment.raw_metadata_safe = {**(payment.raw_metadata_safe or {}), "refund": refund_res}
    order.status = "REFUNDED"

    reversal = VoteLedger(
        order_id=order.id,
        payment_id=payment.id,
        nominee_id=credit_entry.nominee_id,
        round_id=credit_entry.round_id,
        quantity=-abs(credit_entry.quantity),
        entry_type="REVERSAL",
        reverses_entry_id=credit_entry.id,
        reason=f"Refund/chargeback reversal: {reason.strip()}",
        actor_user_id=actor.id,
    )
    db.session.add(reversal)

    log_audit(
        actor_user_id=actor.id,
        action="PAYMENT_REFUNDED_AND_VOTES_REVERSED",
        entity_type="payment",
        entity_id=payment.id,
        after={
            "order_reference": order.public_reference,
            "reversed_votes": reversal.quantity,
            "reason": reason.strip(),
        },
    )
    db.session.commit()
    return {
        "payment": payment.to_dict(),
        "order": order.to_dict(include_finance=True),
        "reversal_entry": reversal.to_dict(),
    }
