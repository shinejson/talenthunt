import io
import pytest
from app import create_app
from app.extensions import db
from app.models.operations import PlatformSetting
from app.models.user import User


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        with app.app_context():
            yield client


def login_admin(client, email="manager@stagelight.gh", password="Manager@2026!"):
    res = client.post("/api/v1/auth/login", json={"identifier": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.get_json()}"
    token = res.get_json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


def test_get_settings_contains_defaults(client):
    headers = login_admin(client)
    res = client.get("/api/v1/admin/settings", headers=headers)
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert "basic_info" in data
    assert "payment_gateway" in data
    assert "sms_config" in data
    assert "email_config" in data
    assert "backup_config" in data
    assert "announcements" in data
    assert "ad_settings" in data
    # Check payment_gateway structure
    pg = data["payment_gateway"]
    assert "active_provider" in pg
    assert "paystack" in pg
    assert "hubtel" in pg
    assert "flutterwave" in pg


def test_patch_settings_and_readback(client):
    headers = login_admin(client)
    payload = {
        "basic_info": {
            "platform_name": "StageLight Ghana 2026",
            "currency": "GHS",
            "timezone": "Africa/Accra",
            "contact_email": "hello@stagelight.gh",
            "contact_phone": "+233 24 555 1234",
        },
        "payment_gateway": {
            "active_provider": "paystack",
            "environment": "sandbox",
            "currency": "GHS",
            "allow_mobile_money": True,
            "allow_card": True,
            "min_amount_ghs": 2.5,
            "max_daily_spend_ghs": 8000.0,
            "paystack": {
                "enabled": True,
                "public_key": "pk_test_sample_12345",
                "secret_key": "sk_test_sample_67890",
            },
        },
        "sms_config": {
            "provider": "hubtel",
            "api_key": "test-key-123",
            "sender_id": "SLGhana",
            "test_phone": "+233241234567",
        },
    }
    res = client.patch("/api/v1/admin/settings", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["basic_info"]["platform_name"] == "StageLight Ghana 2026"
    assert data["payment_gateway"]["active_provider"] == "paystack"
    assert data["payment_gateway"]["min_amount_ghs"] == 2.5
    assert data["sms_config"]["provider"] == "hubtel"

    # Verify public/info reflects updated basic_info
    pub_res = client.get("/api/v1/public/info")
    assert pub_res.status_code == 200
    pub_data = pub_res.get_json()["data"]
    assert pub_data["platform_name"] == "StageLight Ghana 2026"
    assert pub_data["contact_email"] == "hello@stagelight.gh"


def test_upload_logo_and_favicon(client):
    headers = login_admin(client)
    logo_data = io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
    res = client.post(
        "/api/v1/admin/settings/logo",
        data={"file": (logo_data, "test_logo.png")},
        content_type="multipart/form-data",
        headers=headers,
    )
    assert res.status_code == 201
    res_data = res.get_json()["data"]
    assert "url" in res_data
    assert res_data["url"].startswith("/uploads/")

    # Favicon
    fav_data = io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
    res_fav = client.post(
        "/api/v1/admin/settings/favicon",
        data={"file": (fav_data, "favicon.png")},
        content_type="multipart/form-data",
        headers=headers,
    )
    assert res_fav.status_code == 201
    fav_url = res_fav.get_json()["data"]["url"]
    assert fav_url.startswith("/uploads/")

    # Check that settings basic_info has both urls
    settings_res = client.get("/api/v1/admin/settings", headers=headers)
    binfo = settings_res.get_json()["data"]["basic_info"]
    assert binfo["logo_url"] == res_data["url"]
    assert binfo["favicon_url"] == fav_url


def test_sms_test_endpoint(client):
    headers = login_admin(client)
    res = client.post(
        "/api/v1/admin/settings/sms-test",
        json={"provider": "arkesel", "sender_id": "StageLight", "test_phone": "+233241234567"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.get_json()["data"]["sent"] is True

    # Bad phone
    bad_res = client.post(
        "/api/v1/admin/settings/sms-test",
        json={"provider": "arkesel", "sender_id": "StageLight", "test_phone": ""},
        headers=headers,
    )
    assert bad_res.status_code == 422


def test_email_test_endpoint(client):
    headers = login_admin(client)
    res = client.post(
        "/api/v1/admin/settings/email-test",
        json={
            "server": "smtp.sendgrid.net",
            "port": 587,
            "use_tls": True,
            "default_sender": "StageLight <noreply@stagelight.gh>",
        },
        headers=headers,
    )
    assert res.status_code == 200
    assert res.get_json()["data"]["sent"] is True


def test_trigger_backup(client):
    headers = login_admin(client)
    res = client.post("/api/v1/admin/settings/backup-now", headers=headers)
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert "timestamp" in data
    assert "filename" in data
    assert data["filename"].startswith("backup_stagelight_")
    assert data["size_bytes"] > 0


def test_payment_gateway_test_endpoint(client):
    headers = login_admin(client)

    # 1. Test mock provider
    res_mock = client.post(
        "/api/v1/admin/settings/payment-gateway-test",
        json={"provider": "mock", "config": {}},
        headers=headers,
    )
    assert res_mock.status_code == 200
    mock_data = res_mock.get_json()["data"]
    assert mock_data["success"] is True
    assert mock_data["provider"] == "mock"

    # 2. Test paystack provider with secret key format
    res_pstk = client.post(
        "/api/v1/admin/settings/payment-gateway-test",
        json={
            "provider": "paystack",
            "config": {
                "paystack": {
                    "public_key": "pk_test_12345",
                    "secret_key": "sk_test_mock_secret_key",
                }
            },
        },
        headers=headers,
    )
    assert res_pstk.status_code == 200
    pstk_data = res_pstk.get_json()["data"]
    assert pstk_data["provider"] == "paystack"

    # 3. Test paystack missing secret key
    res_bad = client.post(
        "/api/v1/admin/settings/payment-gateway-test",
        json={"provider": "paystack", "config": {"paystack": {"secret_key": ""}}},
        headers=headers,
    )
    assert res_bad.status_code == 200
    bad_data = res_bad.get_json()["data"]
    assert bad_data["success"] is False
    assert "missing" in bad_data["message"].lower()
