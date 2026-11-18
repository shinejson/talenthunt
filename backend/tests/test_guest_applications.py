import hashlib
import io
import json
import re
from datetime import timedelta
from pathlib import Path

import pytest
from PIL import Image

from accounts import provision_account
from app.extensions import db
from app.models.application import Application, MediaAsset
from app.models.competition import Category, Competition, Round
from app.models.nominee import Nominee
from app.models.user import User
from app.utils.time_utils import utcnow

MEDIA_SAMPLE = Path(__file__).resolve().parents[2] / "frontend/assets/videos/demo-sample.mp4"
APPLICATION_EMAIL = "entry@example.com"
NEW_PASSWORD = "A different passphrase for my portal."


def _auth(account):
    return {"Authorization": f"Bearer {account['token']}"}


@pytest.fixture()
def contest(app):
    manager = app.test_client()
    provision_account(manager, "Contest Manager", "manager@example.com", role="COMPETITION_MANAGER")
    reviewer = app.test_client()
    provision_account(reviewer, "Contest Reviewer", "reviewer@example.com", role="REVIEWER")
    with app.app_context():
        comp = Competition(title="Ghana Talent Showcase", slug="ghana-showcase", status="APPLICATIONS_OPEN",
                           applications_close_at=utcnow() + timedelta(days=2))
        category = Category(competition=comp, name="Dance", slug="dance", status="ACTIVE")
        db.session.add_all([comp, category, Round(competition=comp, name="Auditions", sequence_no=1, status="DRAFT")])
        db.session.commit()
        payload = {
            "competition_id": comp.id, "category_id": category.id,
            "full_name": "Akua A. Mensah", "stage_name": "Rising Rhythm",
            "contact_email": "Entry@example.com", "contact_phone": "+233 20 123 4567",
            "date_of_birth": "2001-01-06", "location": "Accra, Greater Accra",
            "is_group": True, "group_name": "Rising Rhythm", "group_member_count": 3,
            "title": "An African contemporary dance set", "description": "An original dance piece performed by three dancers.",
            "biography": "Award-winning group from Accra.", "genre": "Contemporary",
            "consent_accepted": True, "rights_declaration": True,
        }
    return manager, reviewer, payload


def _photo():
    buffer = io.BytesIO()
    Image.new("RGB", (24, 24), "orange").save(buffer, format="PNG")
    buffer.seek(0)
    return buffer, "troupe.png"


def _apply(client, payload, **files):
    return client.post("/api/v1/applications/guest", data={"application": json.dumps(payload), **files}, content_type="multipart/form-data")


def _track(client, receipt, email=APPLICATION_EMAIL):
    return client.post("/api/v1/applications/track", json={"tracking_code": receipt["tracking_code"].lower(), "contact_email": email})


def _get_admin_entry(manager, receipt):
    entries = manager.get("/api/v1/admin/submissions", query_string={"q": receipt["tracking_code"]})
    assert entries.status_code == 200
    assert len(entries.get_json()["data"]) == 1
    return entries.get_json()["data"][0]


def test_guest_review_to_invitation_and_portal(app, client, contest, monkeypatch):
    manager, reviewer, payload = contest
    messages = []

    class RecordingSMTP:
        def __init__(self, host, port, **kwargs):
            assert (host, port) == ("mail.example.test", 587)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def starttls(self, *, context):
            assert context is not None

        def send_message(self, message):
            messages.append(message)
            return {}

    app.config.update(MAIL_SERVER="mail.example.test", MAIL_DEFAULT_SENDER="StageLight <nominees@example.test>",
                      MAIL_PORT=587, MAIL_USE_TLS=True, MAIL_USE_SSL=False, MAIL_USERNAME="", PUBLIC_BASE_URL="https://stage.example.test")
    monkeypatch.setattr("app.integrations.email.sender.smtplib.SMTP", RecordingSMTP)
    closed = client.post("/api/v1/auth/register", json={"full_name": payload["full_name"], "email": APPLICATION_EMAIL, "password": NEW_PASSWORD})
    assert closed.status_code == 403
    assert closed.get_json()["error"]["code"] == "REGISTRATION_CLOSED"
    submission = _apply(client, payload, photo=_photo(),
                        demo_video_1=(MEDIA_SAMPLE.open("rb"), "intro.mp4"),
                        demo_video_2=(MEDIA_SAMPLE.open("rb"), "encore.mp4"))
    assert submission.status_code == 201, submission.get_json()
    receipt = submission.get_json()["data"]
    assert re.fullmatch(r"APP-\d{4}-[A-Z0-9]{20}", receipt["tracking_code"])
    assert receipt["status"] == "SUBMITTED"
    assert submission.headers["Cache-Control"] == "no-store"
    assert client.get("/api/v1/auth/me").status_code == 401
    assert not messages
    assert _track(client, receipt, "someone@example.com").status_code == 404
    assert _track(client, receipt, "ENTRY@example.com").get_json()["data"] == receipt
    assert set(receipt) == {"tracking_code", "competition_title", "category_name", "status", "applicant_feedback", "submitted_at", "updated_at"}
    with app.app_context():
        assert User.query.filter_by(email=APPLICATION_EMAIL).first() is None
        assert Application.query.one().user_id is None
        assert MediaAsset.query.filter_by(owner_user_id=None, is_private=True).count() == 3

    item = _get_admin_entry(manager, receipt)
    base = f"/api/v1/admin/submissions/{item['id']}"
    assert item["applicant_name"] == "Akua A. Mensah" and item["stage_name"] == "Rising Rhythm"
    assert item["group_member_count"] == 3 and item["date_of_birth"] == "2001-01-06"
    assert item["contact_phone"] == payload["contact_phone"] and item["genre"] == "Contemporary"
    assert item["latest_submission"]["biography"] == payload["biography"]
    photo_url = item["profile_image"]["url"]
    demo_one_url = item["latest_submission"]["media_asset"]["url"]
    demo_two_url = item["latest_submission"]["second_media_asset"]["url"]
    assert manager.get(photo_url).content_type == "image/png"
    for path in (photo_url, demo_one_url, demo_two_url):
        assert client.get(path).status_code == 404
        assert reviewer.get(path, headers={"Range": "bytes=0-31"}).status_code == 206
    finance = app.test_client()
    provision_account(finance, "Finance Officer", "finance@example.com", role="FINANCE_OFFICER")
    assert finance.get(demo_one_url).status_code == 404
    assert reviewer.post(base + "/decision", json={"decision": "NOMINATE"}).status_code == 403
    assert manager.post(base + "/nomination-email").status_code == 409
    early = manager.post(base + "/decision", json={"decision": "NOMINATE"})
    assert early.get_json()["error"]["code"] == "REVIEW_REQUIRED"

    review = reviewer.post(base + "/review", json={"recommendation": "NOMINATE", "score": 91, "internal_notes": "private judge notes"})
    assert review.status_code == 201, review.get_json()
    mid = _track(client, receipt).get_json()["data"]
    assert mid["status"] == "UNDER_REVIEW" and "private judge notes" not in str(mid)
    approved = manager.post(base + "/decision", json={"decision": "APPROVE", "reason": "private decision rationale", "applicant_feedback": "Strong audition."})
    assert approved.status_code == 200
    lookup = _track(client, receipt).get_json()["data"]
    assert lookup["status"] == "APPROVED" and lookup["applicant_feedback"] == "Strong audition."
    assert not messages
    login = client.post("/api/v1/auth/login", json={"identifier": APPLICATION_EMAIL, "password": NEW_PASSWORD})
    assert login.status_code == 401
    with app.app_context():
        assert User.query.filter_by(email=APPLICATION_EMAIL).count() == 0

    nomination = manager.post(base + "/decision", json={"decision": "NOMINATE", "reason": "private decision rationale"})
    assert nomination.status_code == 200, nomination.get_json()
    result = nomination.get_json()["data"]
    assert result["nomination_email_sent"] and result["application"]["nomination_email_sent_at"]
    assert result["round_entry"]["judge_score"] == 91
    assert manager.post(base + "/decision", json={"decision": "NOMINATE"}).status_code == 409
    assert len(messages) == 1 and messages[0]["To"] == APPLICATION_EMAIL
    email = messages[0].get_content()
    assert "Sign-in email: entry@example.com" in email
    token = re.search(r"https://stage.example.test/portal/accept-invitation#([a-f0-9]{64})", email)[1]
    assert token not in nomination.get_data(as_text=True)

    nominated = _track(client, receipt).get_json()["data"]
    assert nominated["status"] == "NOMINATED" and nominated["applicant_feedback"] is None
    assert token not in str(nominated)
    with app.app_context():
        user = User.query.filter_by(email=APPLICATION_EMAIL).one()
        assert user.status == "INVITED" and user.reset_token == hashlib.sha256(token.encode()).hexdigest()
        assert user.phone is None and user.profile_image.is_private
        assert Nominee.query.count() == 1
    assert client.post("/api/v1/auth/login", json={"identifier": APPLICATION_EMAIL, "password": NEW_PASSWORD}).status_code == 401
    recovery = client.post("/api/v1/auth/forgot-password", json={"identifier": APPLICATION_EMAIL})
    assert recovery.status_code == 200 and "reset_token_preview" not in recovery.get_json()["data"] and len(messages) == 1
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}).status_code == 400
    setup = {"token": token, "password": NEW_PASSWORD}
    assert client.post("/api/v1/auth/accept-invitation", json=setup).status_code == 200
    assert client.post("/api/v1/auth/accept-invitation", json=setup).status_code == 400
    logged_in = client.post("/api/v1/auth/login", json={"identifier": APPLICATION_EMAIL.upper(), "password": NEW_PASSWORD})
    assert logged_in.status_code == 200, logged_in.get_json()
    account = logged_in.get_json()["data"]
    assert account["user"]["roles"] == ["NOMINEE"] and account["user"]["is_verified"]
    assert client.get("/api/v1/nominee/dashboard", headers=_auth(account)).status_code == 200
    owned = client.get("/api/v1/applications/mine", headers=_auth(account)).get_json()["data"]
    assert len(owned) == 1 and owned[0]["reference_no"] == receipt["tracking_code"]
    assert client.get(demo_two_url, headers=_auth(account)).headers["Cache-Control"] == "private, no-store"
    public = app.test_client().get(f"/api/v1/nominees/{result['nominee']['public_slug']}").get_json()["data"]
    assert public["profile_image"] is None and public["demo"] is None
    assert app.test_client().get(demo_two_url).status_code == 404


def test_validation_guardian_deadlines_and_atomic_upload(app, client, contest):
    manager, _, payload = contest
    options = client.get("/api/v1/applications/options").get_json()["data"]
    assert len(options) == 1 and options[0]["id"] == payload["competition_id"]
    assert options[0]["categories"][0]["id"] == payload["category_id"]

    url = "https://www.youtube.com/watch?v=sample"
    missing = _apply(client, payload)
    assert missing.get_json()["error"]["code"] == "DEMO_REQUIRED"
    bad = _apply(client, {**payload, "external_video_url": "https://youtube.com:443@other.example/sneaky"})
    assert bad.status_code == 422
    external = {**payload, "external_video_url": url}
    assert _apply(client, {**external, "email": "wrong-field@example.com"}).status_code == 422
    assert _apply(client, {**external, "date_of_birth": "2035-01-01"}).status_code == 422
    assert _apply(client, {**external, "group_member_count": 1}).status_code == 422
    assert _apply(client, {**external, "rights_declaration": False}).status_code == 422
    assert _apply(client, {**external, "category_id": "unknown"}).status_code == 422
    minor = {**external, "date_of_birth": (utcnow().date() - timedelta(days=365 * 16)).isoformat()}
    assert _apply(client, minor).get_json()["error"]["code"] == "GUARDIAN_CONSENT_REQUIRED"

    bad_video = _apply(client, payload, photo=_photo(), demo_video_1=(MEDIA_SAMPLE.open("rb"), "valid.mp4"),
                       demo_video_2=(io.BytesIO(b"not a video"), "invalid.mp4"))
    assert bad_video.status_code == 422 and "demo_video_2" in bad_video.get_json()["error"]["fields"]
    assert not list(Path(app.config["UPLOAD_FOLDER"]).iterdir())
    with app.app_context():
        assert MediaAsset.query.count() == 0 and Application.query.count() == 0
    extra_file = _apply(client, external, demo_video_3=(io.BytesIO(b"invalid"), "third.mp4"))
    assert extra_file.get_json()["error"]["code"] == "INVALID_UPLOADS"

    minor.update(guardian_name="Parent Mensah", guardian_contact="parent@example.com", guardian_consent=True)
    submitted = _apply(client, minor)
    assert submitted.status_code == 201, submitted.get_json()
    item = _get_admin_entry(manager, submitted.get_json()["data"])
    assert item["is_minor"] and item["guardian_name"] == minor["guardian_name"] and item["guardian_consent"] is True
    assert item["latest_submission"]["external_video_url"] == url
    assert _apply(client, {**minor, "contact_email": APPLICATION_EMAIL.upper()}).status_code == 409
    with app.app_context():
        comp = db.session.get(Competition, payload["competition_id"])
        comp.applications_close_at = utcnow() - timedelta(days=1)
        db.session.commit()
    assert client.get("/api/v1/applications/options").get_json()["data"] == []
    assert _apply(client, {**external, "contact_email": "new@example.com"}).get_json()["error"]["code"] == "DEADLINE_PASSED"


def test_invitation_retry_and_expiration(app, client, contest, monkeypatch):
    manager, reviewer, payload = contest
    submitted = _apply(client, {**payload, "external_video_url": "https://vimeo.com/1234"})
    assert submitted.status_code == 201
    item = _get_admin_entry(manager, submitted.get_json()["data"])
    url = f"/api/v1/admin/submissions/{item['id']}"
    assert reviewer.post(url + "/review", json={"recommendation": "NOMINATE", "score": 90}).status_code == 201
    monkeypatch.setattr("app.services.nominee_access_service.send_email_message", lambda *args: False)
    nominated = manager.post(url + "/decision", json={"decision": "NOMINATE"})
    assert nominated.status_code == 200 and nominated.get_json()["data"]["nomination_email_sent"] is False
    assert nominated.get_json()["data"]["application"]["status"] == "NOMINATED"
    assert nominated.get_json()["data"]["application"]["nomination_email_sent_at"] is None
    assert reviewer.post(url + "/nomination-email").status_code == 403
    assert manager.post(url + "/nomination-email").status_code == 503

    messages = []
    monkeypatch.setattr("app.services.nominee_access_service.send_email_message", lambda *args: messages.append(args) or True)
    assert manager.post(url + "/nomination-email").get_json()["data"]["nomination_email_sent_at"]
    token = re.search(r"accept-invitation#([a-f0-9]{64})", messages[-1][2])[1]
    with app.app_context():
        user = User.query.filter_by(email=APPLICATION_EMAIL).one()
        user.reset_token_expires_at = utcnow() - timedelta(seconds=1)
        db.session.commit()
    assert client.post("/api/v1/auth/accept-invitation", json={"token": token, "password": NEW_PASSWORD}).status_code == 400
    assert manager.post(url + "/nomination-email").status_code == 200
    replacement = re.search(r"accept-invitation#([a-f0-9]{64})", messages[-1][2])[1]
    assert replacement != token
    monkeypatch.setattr("app.services.nominee_access_service.send_email_message", lambda *args: False)
    assert manager.post(url + "/nomination-email").status_code == 503
    assert client.post("/api/v1/auth/accept-invitation", json={"token": replacement, "password": NEW_PASSWORD}).status_code == 200
    with app.app_context():
        assert User.query.filter_by(email=APPLICATION_EMAIL).count() == 1 and Nominee.query.count() == 1


def test_nomination_reuses_verified_account_without_resetting_password(app, client, contest, monkeypatch):
    manager, reviewer, payload = contest
    existing = app.test_client()
    account = provision_account(existing, "Existing Contestant", APPLICATION_EMAIL, is_verified=True)
    messages = []
    monkeypatch.setattr("app.services.nominee_access_service.send_email_message", lambda *args: messages.append(args) or True)
    submitted = _apply(client, {**payload, "external_video_url": "https://youtu.be/demo"})
    assert submitted.status_code == 201
    item = _get_admin_entry(manager, submitted.get_json()["data"])
    url = f"/api/v1/admin/submissions/{item['id']}"
    assert existing.get(f"/api/v1/applications/{item['id']}").status_code == 404
    assert reviewer.post(url + "/review", json={"recommendation": "NOMINATE"}).status_code == 201
    response = manager.post(url + "/decision", json={"decision": "NOMINATE"})
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["data"]["application"]["user_id"] == account["user"]["id"]
    assert len(messages) == 1 and "Sign in with your existing password." in messages[0][2]
    assert "accept-invitation" not in messages[0][2]
    login = existing.post("/api/v1/auth/login", json={"identifier": APPLICATION_EMAIL, "password": "Password@123!"})
    assert login.status_code == 200 and "NOMINEE" in login.get_json()["data"]["user"]["roles"]


def test_unverified_or_staff_accounts_are_not_linked_by_guest_email(app, client, contest):
    manager, reviewer, payload = contest
    unverified = app.test_client()
    provision_account(unverified, "Unverified Existing Contestant", APPLICATION_EMAIL, is_verified=False)
    for email in (APPLICATION_EMAIL, "reviewer@example.com"):
        submitted = _apply(client, {**payload, "external_video_url": "https://youtu.be/demo", "contact_email": email})
        assert submitted.status_code == 201
        item = _get_admin_entry(manager, submitted.get_json()["data"])
        url = f"/api/v1/admin/submissions/{item['id']}"
        assert manager.post(url + "/review", json={"recommendation": "NOMINATE"}).status_code == 201
        failed = manager.post(url + "/decision", json={"decision": "NOMINATE"})
        assert failed.status_code == 409 and failed.get_json()["error"]["code"] == "CONTACT_ACCOUNT_CONFLICT"
        with app.app_context():
            application = db.session.get(Application, item["id"])
            assert application.user_id is None and application.status == "UNDER_REVIEW"
