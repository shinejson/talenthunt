from app.extensions import db
from app.models.user import User
from app.services.auth_service import grant_role
from app.utils.security import hash_password


def provision_account(client, name, email, password="Password@123!", *, role="APPLICANT", **profile):
    """Give tests a pre-existing or staff account; public registration is disabled."""
    with client.application.app_context():
        user = User(full_name=name, email=email, password_hash=hash_password(password), **profile)
        db.session.add(user)
        db.session.flush()
        grant_role(user, role)
        db.session.commit()
    response = client.post("/api/v1/auth/login", json={"identifier": email, "password": password})
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]
