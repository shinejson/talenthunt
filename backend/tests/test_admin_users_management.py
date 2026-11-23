import pytest
from app import create_app
from app.models.user import User


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        with app.app_context():
            yield client


def login_super_admin(client):
    res = client.post("/api/v1/auth/login", json={"identifier": "admin@stagelight.gh", "password": "Admin@2026!"})
    assert res.status_code == 200, f"Login failed: {res.get_json()}"
    token = res.get_json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


def test_admin_users_group_separation(client):
    headers = login_super_admin(client)
    
    # 1. Admin / Staff Group
    res_admin = client.get("/api/v1/admin/users?group=admin", headers=headers)
    assert res_admin.status_code == 200
    admin_data = res_admin.get_json()["data"]
    admin_meta = res_admin.get_json()["meta"]
    
    assert admin_meta["admin_count"] > 0
    assert len(admin_data) > 0
    admin_role_set = {"SUPER_ADMIN", "COMPETITION_MANAGER", "FINANCE_OFFICER", "MODERATOR", "REVIEWER"}
    for u in admin_data:
        # Every user in the admin group must have at least one admin role
        assert any(r in admin_role_set for r in u["roles"]), f"User {u['full_name']} has no admin roles: {u['roles']}"

    # 2. Applicants Group
    res_app = client.get("/api/v1/admin/users?group=applicants", headers=headers)
    assert res_app.status_code == 200
    app_data = res_app.get_json()["data"]
    app_meta = res_app.get_json()["meta"]
    
    assert app_meta["applicant_count"] > 0
    assert len(app_data) > 0
    for u in app_data:
        # None of the users in the applicant group should have admin roles
        assert not any(r in admin_role_set for r in u["roles"]), f"Applicant {u['full_name']} has admin roles: {u['roles']}"


def test_admin_password_reset(client):
    headers = login_super_admin(client)
    
    # Get an applicant
    res_app = client.get("/api/v1/admin/users?group=applicants", headers=headers)
    target = res_app.get_json()["data"][0]
    target_id = target["id"]
    target_email = target["email"]
    
    # 1. Test validation error (< 8 chars)
    short_res = client.post(f"/api/v1/admin/users/{target_id}/reset-password", json={"password": "short"}, headers=headers)
    assert short_res.status_code == 422
    
    # 2. Reset password
    new_pwd = "ResetPass@2026!#"
    reset_res = client.post(f"/api/v1/admin/users/{target_id}/reset-password", json={"password": new_pwd}, headers=headers)
    assert reset_res.status_code == 200
    assert "reset successfully" in reset_res.get_json()["data"]["message"]
    
    # 3. Verify login works with new password
    login_res = client.post("/api/v1/auth/login", json={"identifier": target_email, "password": new_pwd})
    assert login_res.status_code == 200
    
    # 4. Restore original password
    orig_pwd = "Nominee@2026!" if "ama" in target_email else "Applicant@2026!"
    restore_res = client.post(f"/api/v1/admin/users/{target_id}/reset-password", json={"password": orig_pwd}, headers=headers)
    assert restore_res.status_code == 200
