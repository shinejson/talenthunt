from datetime import timedelta
import pytest
from app.extensions import db
from app.models.competition import Competition, Round
from app.services.seed_service import seed_demo_data_if_empty
from app.utils.time_utils import iso_utc, utcnow


def login_super_admin(client):
    res = client.post("/api/v1/auth/login", json={"identifier": "admin@stagelight.gh", "password": "Admin@2026!"})
    assert res.status_code == 200, f"Login failed: {res.get_json()}"
    token = res.get_json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


def test_competition_application_deadlines_api(app, client):
    with app.app_context():
        seed_demo_data_if_empty()

    headers = login_super_admin(client)
    res_comps = client.get("/api/v1/admin/competitions", headers=headers)
    assert res_comps.status_code == 200
    comps = res_comps.get_json()["data"]
    assert len(comps) > 0
    comp_id = comps[0]["id"]

    now = utcnow()
    open_time = now + timedelta(days=1)
    close_time = now + timedelta(days=15)

    # 1. Set schedule deadlines
    res = client.post(
        f"/api/v1/admin/competitions/{comp_id}/application-window",
        headers=headers,
        json={
            "action": "set_deadlines",
            "applications_open_at": iso_utc(open_time),
            "applications_close_at": iso_utc(close_time),
            "status": "SCHEDULED",
        },
    )
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["status"] == "SCHEDULED"
    assert data["applications_open_at"] is not None
    assert data["applications_close_at"] is not None

    # 2. Quick Close Applications Now
    res_close = client.post(
        f"/api/v1/admin/competitions/{comp_id}/application-window",
        headers=headers,
        json={"action": "close"},
    )
    assert res_close.status_code == 200
    close_data = res_close.get_json()["data"]
    assert close_data["status"] == "APPLICATIONS_CLOSED"
    assert close_data["accepts_applications"] is False

    # 3. Quick Open Applications Now
    res_open = client.post(
        f"/api/v1/admin/competitions/{comp_id}/application-window",
        headers=headers,
        json={"action": "open"},
    )
    assert res_open.status_code == 200
    open_data = res_open.get_json()["data"]
    assert open_data["status"] == "APPLICATIONS_OPEN"
    assert open_data["accepts_applications"] is True


def test_competition_deadlines_enforcement(app, client):
    with app.app_context():
        seed_demo_data_if_empty()
        comp = Competition.query.first()
        assert comp is not None

        now = utcnow()

        # Case 1: Deadline has passed
        comp.status = "APPLICATIONS_OPEN"
        comp.applications_open_at = now - timedelta(days=10)
        comp.applications_close_at = now - timedelta(minutes=5)
        db.session.commit()

        assert comp.accepts_applications(now) is False

        # Case 2: Applications have not opened yet (scheduled future open)
        comp.status = "SCHEDULED"
        comp.applications_open_at = now + timedelta(days=2)
        comp.applications_close_at = now + timedelta(days=16)
        db.session.commit()

        assert comp.accepts_applications(now) is False

        # Case 3: Currently open within window
        comp.status = "APPLICATIONS_OPEN"
        comp.applications_open_at = now - timedelta(days=1)
        comp.applications_close_at = now + timedelta(days=10)
        db.session.commit()

        assert comp.accepts_applications(now) is True

        # Case 4: Explicitly closed
        comp.status = "APPLICATIONS_CLOSED"
        db.session.commit()

        assert comp.accepts_applications(now) is False


def test_round_voting_deadlines_api(app, client):
    with app.app_context():
        seed_demo_data_if_empty()

    headers = login_super_admin(client)
    res_rounds = client.get("/api/v1/admin/rounds", headers=headers)
    assert res_rounds.status_code == 200
    rounds = res_rounds.get_json()["data"]
    assert len(rounds) > 0
    rnd_id = rounds[0]["id"]

    now = utcnow()
    open_time = now + timedelta(days=2)
    close_time = now + timedelta(days=9)

    # 1. Set schedule deadlines
    res = client.post(
        f"/api/v1/admin/rounds/{rnd_id}/voting-window",
        headers=headers,
        json={
            "action": "set_deadlines",
            "voting_opens_at": iso_utc(open_time),
            "voting_closes_at": iso_utc(close_time),
            "status": "SCHEDULED",
        },
    )
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["status"] == "SCHEDULED"
    assert data["voting_opens_at"] is not None
    assert data["voting_closes_at"] is not None

    # 2. Quick Close Voting Now
    res_close = client.post(
        f"/api/v1/admin/rounds/{rnd_id}/voting-window",
        headers=headers,
        json={"action": "close"},
    )
    assert res_close.status_code == 200
    close_data = res_close.get_json()["data"]
    assert close_data["status"] == "CLOSED"
    assert close_data["is_voting_open"] is False

    # 3. Quick Open Voting Now
    res_open = client.post(
        f"/api/v1/admin/rounds/{rnd_id}/voting-window",
        headers=headers,
        json={"action": "open"},
    )
    assert res_open.status_code == 200
    open_data = res_open.get_json()["data"]
    assert open_data["status"] == "OPEN"
    assert open_data["is_voting_open"] is True


def test_round_voting_deadlines_enforcement(app, client):
    with app.app_context():
        seed_demo_data_if_empty()
        rnd = Round.query.first()
        assert rnd is not None

        now = utcnow()

        # Case 1: Voting deadline passed
        rnd.status = "OPEN"
        rnd.voting_opens_at = now - timedelta(days=5)
        rnd.voting_closes_at = now - timedelta(minutes=1)
        db.session.commit()

        assert rnd.is_voting_window_open(now) is False

        # Case 2: Voting opens in future
        rnd.status = "OPEN"
        rnd.voting_opens_at = now + timedelta(hours=2)
        rnd.voting_closes_at = now + timedelta(days=3)
        db.session.commit()

        assert rnd.is_voting_window_open(now) is False

        # Case 3: Voting scheduled and open_at has arrived
        rnd.status = "SCHEDULED"
        rnd.voting_opens_at = now - timedelta(minutes=10)
        rnd.voting_closes_at = now + timedelta(days=3)
        db.session.commit()

        assert rnd.is_voting_window_open(now) is True

        # Case 4: Closed status
        rnd.status = "CLOSED"
        db.session.commit()

        assert rnd.is_voting_window_open(now) is False
