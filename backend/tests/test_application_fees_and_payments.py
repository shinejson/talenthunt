import io
import json
import pytest
from app.extensions import db
from app.models.competition import Competition
from app.models.application import Application, ApplicationPayment
from app.services.seed_service import seed_demo_data_if_empty
from accounts import provision_account


def test_application_fee_admin_settings_and_competition_patch(client, app):
    with app.app_context():
        seed_demo_data_if_empty()
        comp = Competition.query.first()
        comp_id = comp.id

    admin = provision_account(client, "Super Admin User", "super_admin_pricing@test.gh", role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {admin['token']}"}

    # 1. Admin gets settings and sees application_pricing & competitions_pricing
    resp = client.get("/api/v1/admin/settings", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert "application_pricing" in data
    assert "competitions_pricing" in data
    assert data["application_pricing"]["default_fee_major"] == 50.0

    # 2. Admin updates pricing
    patch_resp = client.patch(
        "/api/v1/admin/settings",
        headers=headers,
        json={
            "application_pricing": {
                "default_fee_major": 75.0,
                "require_application_fee": True,
                "currency": "GHS",
                "allow_offline_vouchers": True
            }
        }
    )
    assert patch_resp.status_code == 200

    # 3. Admin patches competition fee directly
    comp_patch = client.patch(
        f"/api/v1/admin/competitions/{comp_id}",
        headers=headers,
        json={"application_fee_major": 60.0}
    )
    assert comp_patch.status_code == 200

    with app.app_context():
        c = db.session.get(Competition, comp_id)
        assert c.application_fee_major == 60.0
        assert c.application_fee_minor == 6000


def test_application_payment_flow_bounced_and_success(client, app):
    with app.app_context():
        seed_demo_data_if_empty()
        comp = Competition.query.filter_by(status="APPLICATIONS_OPEN").first() or Competition.query.first()
        comp.application_fee_minor = 5000
        cat = comp.categories[0]
        comp_id, cat_id = comp.id, cat.id
        db.session.commit()

    # 1. Initialize payment
    init_resp = client.post(
        "/api/v1/applications/payment/initialize",
        json={
            "competition_id": comp_id,
            "category_id": cat_id,
            "applicant_name": "Kofi Test",
            "applicant_email": "kofi_test@example.com",
            "applicant_phone": "+233240001122",
            "network": "MTN Mobile Money",
            "payment_method": "MOBILE_MONEY"
        }
    )
    assert init_resp.status_code == 201
    init_data = init_resp.get_json()["data"]
    ref = init_data["payment_reference"]
    code = init_data["payment_code"]
    assert ref.startswith("APPREF-2026-")
    assert code.startswith("APPPAY-2026-")

    # 2. Simulate Bounced Payment (insufficient funds)
    bounce_resp = client.post(
        "/api/v1/applications/payment/complete",
        json={
            "payment_reference": ref,
            "outcome": "BOUNCED",
            "bounced_reason": "Insufficient wallet balance"
        }
    )
    assert bounce_resp.status_code == 200
    bounce_data = bounce_resp.get_json()["data"]
    assert bounce_data["status"] == "BOUNCED"
    assert bounce_data["bounced_reason"] == "Insufficient wallet balance"

    # Verify code cannot be used when bounced
    ver_bounce = client.post(
        "/api/v1/applications/payment/verify-code",
        json={"payment_code": code, "competition_id": comp_id}
    )
    assert ver_bounce.status_code == 422
    assert "bounced" in ver_bounce.get_json()["error"]["message"].lower()

    # 3. Applicant recovers / retries and completes payment successfully
    success_resp = client.post(
        "/api/v1/applications/payment/complete",
        json={
            "payment_reference": ref,
            "outcome": "SUCCESS"
        }
    )
    assert success_resp.status_code == 200
    assert success_resp.get_json()["data"]["status"] == "SUCCESS"

    # 4. Verify code is now valid
    ver_success = client.post(
        "/api/v1/applications/payment/verify-code",
        json={"payment_code": code, "competition_id": comp_id}
    )
    assert ver_success.status_code == 200
    assert ver_success.get_json()["data"]["valid"] is True
    assert ver_success.get_json()["data"]["amount_major"] == 50.0

    # 5. Submit guest application with the verified payment code
    app_payload = {
        "competition_id": comp_id,
        "category_id": cat_id,
        "full_name": "Kofi Test",
        "stage_name": "Kofi Star",
        "contact_email": "kofi_test@example.com",
        "contact_phone": "+233240001122",
        "location": "Kumasi, Ashanti",
        "date_of_birth": "2000-01-15",
        "is_group": False,
        "title": "Acoustic Highlife",
        "genre": "Highlife",
        "description": "Live acoustic guitar and vocals performing timeless Ghanaian rhythms.",
        "biography": "Self-taught guitarist from Ashanti region.",
        "external_video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "consent_accepted": True,
        "rights_declaration": True,
        "payment_code": code
    }

    sub_resp = client.post(
        "/api/v1/applications/guest",
        data={"application": json.dumps(app_payload)},
        content_type="multipart/form-data"
    )
    assert sub_resp.status_code == 201
    receipt = sub_resp.get_json()["data"]
    assert receipt["tracking_code"].startswith("APP-")
    assert receipt["payment_code"] == code
    assert receipt["payment_status"] == "PAID"

    # 6. Attempt to reuse redeemed code -> fails
    sub_reuse = client.post(
        "/api/v1/applications/guest",
        data={"application": json.dumps(app_payload)},
        content_type="multipart/form-data"
    )
    assert sub_reuse.status_code in (409, 422)
    err = sub_reuse.get_json()
    assert "already" in str(err).lower() or "used" in str(err).lower() or "duplicate" in str(err).lower()
