from datetime import timedelta
import pytest
from app.extensions import db
from app.models.user import User, UserSession
from app.utils.time_utils import utcnow
from app.utils.totp import generate_totp_code


from accounts import provision_account


def test_login_and_session_tracking(client):
    reg = provision_account(client, "Session User", "sess_user@test.gh", "Password@123!")
    user_id = reg["user"]["id"]

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"identifier": "sess_user@test.gh", "password": "Password@123!"},
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"}
    )
    assert login_resp.status_code == 200
    data = login_resp.get_json()["data"]
    token = data["token"]
    assert token

    # Check active sessions endpoint
    sess_resp = client.get("/api/v1/auth/sessions", headers={"Authorization": f"Bearer {token}"})
    assert sess_resp.status_code == 200
    sess_data = sess_resp.get_json()["data"]
    sessions = sess_data["sessions"]
    assert len(sessions) >= 1
    current = next((s for s in sessions if s["is_current"]), None)
    assert current is not None
    assert "Chrome" in current["device_summary"] or "Windows" in current["device_summary"] or current["device_summary"] != ""


def test_session_inactivity_timeout(client, app):
    reg = provision_account(client, "Timeout User", "timeout_user@test.gh", "Password@123!")
    user_id = reg["user"]["id"]

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"identifier": "timeout_user@test.gh", "password": "Password@123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.get_json()["data"]["token"]

    # Protected request works
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200

    # Simulate inactivity by backdating user sessions beyond 30 minutes
    with app.app_context():
        user = db.session.get(User, user_id)
        for s in UserSession.query.filter_by(user_id=user.id).all():
            s.last_activity_at = utcnow() - timedelta(minutes=45)
        user.last_activity_at = utcnow() - timedelta(minutes=45)
        db.session.commit()

    # Now the next request must be rejected with 401 SESSION_EXPIRED
    expired_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert expired_resp.status_code == 401
    err = expired_resp.get_json()["error"]
    assert err["code"] == "SESSION_EXPIRED"


def test_terminate_session_and_logout_others(client, app):
    provision_account(client, "Multi Device", "multidev@test.gh", "Password@123!")

    # Establish session 1
    resp1 = client.post(
        "/api/v1/auth/login",
        json={"identifier": "multidev@test.gh", "password": "Password@123!"},
        headers={"User-Agent": "Device-1 / Firefox"}
    )
    token1 = resp1.get_json()["data"]["token"]

    # Establish session 2
    resp2 = client.post(
        "/api/v1/auth/login",
        json={"identifier": "multidev@test.gh", "password": "Password@123!"},
        headers={"User-Agent": "Device-2 / Safari"}
    )
    token2 = resp2.get_json()["data"]["token"]

    # From session 2, logout all other devices
    logout_others_resp = client.post(
        "/api/v1/auth/sessions/logout-others",
        headers={"Authorization": f"Bearer {token2}"}
    )
    assert logout_others_resp.status_code == 200
    assert logout_others_resp.get_json()["data"]["revoked_count"] >= 1

    # Session 2 is still valid
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token2}"}).status_code == 200

    # Session 1 is now revoked
    rev_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token1}"})
    assert rev_resp.status_code == 401
    assert rev_resp.get_json()["error"]["code"] == "SESSION_REVOKED"


def test_two_factor_setup_confirm_login_flow(client, app):
    reg = provision_account(client, "2FA Applicant", "2fa_app@test.gh", "Password@123!")
    token = reg["token"]

    # 1. Start 2FA setup
    setup_resp = client.post("/api/v1/auth/2fa/setup", headers={"Authorization": f"Bearer {token}"})
    assert setup_resp.status_code == 200
    setup_data = setup_resp.get_json()["data"]
    secret = setup_data["secret"]
    assert secret and len(secret) >= 16
    assert "data:image/png;base64," in setup_data["qr_code"]
    assert "otpauth://" in setup_data["otpauth_uri"]

    # 2. Confirm with bad code fails
    bad_conf = client.post(
        "/api/v1/auth/2fa/confirm",
        json={"code": "000000"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert bad_conf.status_code == 422
    assert bad_conf.get_json()["error"]["code"] == "INVALID_TOTP_CODE"

    # 3. Confirm with valid code succeeds
    valid_code = generate_totp_code(secret)
    good_conf = client.post(
        "/api/v1/auth/2fa/confirm",
        json={"code": valid_code},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert good_conf.status_code == 200
    conf_data = good_conf.get_json()["data"]
    assert conf_data["enabled"] is True
    backup_codes = conf_data["backup_codes"]
    assert len(backup_codes) == 8

    # 4. Attempt login with password -> receives 2FA challenge
    login_attempt = client.post(
        "/api/v1/auth/login",
        json={"identifier": "2fa_app@test.gh", "password": "Password@123!"}
    )
    assert login_attempt.status_code == 200
    challenge_data = login_attempt.get_json()["data"]
    assert challenge_data["requires_2fa"] is True
    temp_token = challenge_data["two_factor_temp_token"]
    assert temp_token

    # 5. Verify 2FA challenge with invalid code fails
    bad_verify = client.post(
        "/api/v1/auth/2fa/verify",
        json={"two_factor_temp_token": temp_token, "code": "999999"}
    )
    assert bad_verify.status_code == 422

    # 6. Verify 2FA challenge with valid TOTP code succeeds
    totp_now = generate_totp_code(secret)
    good_verify = client.post(
        "/api/v1/auth/2fa/verify",
        json={"two_factor_temp_token": temp_token, "code": totp_now}
    )
    assert good_verify.status_code == 200
    session_token = good_verify.get_json()["data"]["token"]
    assert session_token

    # 7. Test login with single-use backup code
    login_attempt_2 = client.post(
        "/api/v1/auth/login",
        json={"identifier": "2fa_app@test.gh", "password": "Password@123!"}
    )
    temp_token_2 = login_attempt_2.get_json()["data"]["two_factor_temp_token"]

    used_backup_code = backup_codes[0]
    backup_verify = client.post(
        "/api/v1/auth/2fa/verify",
        json={"two_factor_temp_token": temp_token_2, "code": used_backup_code}
    )
    assert backup_verify.status_code == 200

    # 8. Same backup code cannot be used again
    login_attempt_3 = client.post(
        "/api/v1/auth/login",
        json={"identifier": "2fa_app@test.gh", "password": "Password@123!"}
    )
    temp_token_3 = login_attempt_3.get_json()["data"]["two_factor_temp_token"]
    reuse_verify = client.post(
        "/api/v1/auth/2fa/verify",
        json={"two_factor_temp_token": temp_token_3, "code": used_backup_code}
    )
    assert reuse_verify.status_code == 422

    # 9. Disable 2FA
    disable_resp = client.post(
        "/api/v1/auth/2fa/disable",
        json={"password": "Password@123!"},
        headers={"Authorization": f"Bearer {session_token}"}
    )
    assert disable_resp.status_code == 200
    assert disable_resp.get_json()["data"]["disabled"] is True

    # 10. Login now works directly without 2FA challenge
    direct_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "2fa_app@test.gh", "password": "Password@123!"}
    )
    assert direct_login.status_code == 200
    assert "token" in direct_login.get_json()["data"]
