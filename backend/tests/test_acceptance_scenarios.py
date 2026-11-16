import io
import json
from datetime import timedelta

from app.extensions import db
from app.integrations.payments.mock_adapter import MockPaymentAdapter
from app.models.competition import Round
from app.models.user import User
from app.services.auth_service import grant_role
from app.utils.time_utils import iso_utc, utcnow


def _register_and_token(client, name, email, password="Password@123!"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"full_name": name, "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.get_json()
    body = resp.get_json()["data"]
    return body["user"], body["token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_competition_and_actors(app, client):
    """Create manager, reviewer, finance, super_admin, and an open competition with 2 rounds & packages."""
    mgr_user, mgr_token = _register_and_token(client, "Manager One", "mgr@test.gh")
    rev_user, rev_token = _register_and_token(client, "Reviewer One", "rev@test.gh")
    fin_user, fin_token = _register_and_token(client, "Finance One", "fin@test.gh")
    sup_user, sup_token = _register_and_token(client, "Super Admin", "super@test.gh")

    with app.app_context():
        grant_role(db.session.get(User, mgr_user["id"]), "COMPETITION_MANAGER")
        grant_role(db.session.get(User, rev_user["id"]), "REVIEWER")
        grant_role(db.session.get(User, fin_user["id"]), "FINANCE_OFFICER")
        grant_role(db.session.get(User, sup_user["id"]), "SUPER_ADMIN")
        db.session.commit()

    now = utcnow()
    comp_resp = client.post(
        "/api/v1/admin/competitions",
        headers=_auth_headers(mgr_token),
        json={
            "title": "Ghana Talent 2026",
            "slug": "ghana-talent-2026",
            "status": "APPLICATIONS_OPEN",
            "applications_open_at": iso_utc(now - timedelta(days=2)),
            "applications_close_at": iso_utc(now + timedelta(days=10)),
            "currency": "GHS",
            "public_leaderboard": True,
            "nominee_see_rank": True,
            "unit_vote_price_minor": 100,
            "min_vote_quantity": 1,
            "max_vote_quantity_per_order": 500,
        },
    )
    assert comp_resp.status_code == 201, comp_resp.get_json()
    comp = comp_resp.get_json()["data"]

    cat_resp = client.post(
        "/api/v1/admin/categories",
        headers=_auth_headers(mgr_token),
        json={"competition_id": comp["id"], "name": "Music & Vocals"},
    )
    assert cat_resp.status_code == 201
    cat = cat_resp.get_json()["data"]

    r1_resp = client.post(
        "/api/v1/admin/rounds",
        headers=_auth_headers(mgr_token),
        json={
            "competition_id": comp["id"],
            "name": "Round 1",
            "sequence_no": 1,
            "status": "OPEN",
            "voting_opens_at": iso_utc(now - timedelta(hours=2)),
            "voting_closes_at": iso_utc(now + timedelta(days=5)),
            "elimination_config": {
                "method": "top_n",
                "advance_count": 1,
                "tie_breakers": ["judge_score_desc", "earliest_qualifying_vote_timestamp"],
                "exclude_disqualified": True,
                "pending_payment_grace_minutes": 30,
            },
        },
    )
    assert r1_resp.status_code == 201
    r1 = r1_resp.get_json()["data"]

    r2_resp = client.post(
        "/api/v1/admin/rounds",
        headers=_auth_headers(mgr_token),
        json={
            "competition_id": comp["id"],
            "name": "Round 2 Finale",
            "sequence_no": 2,
            "status": "OPEN",
            "voting_opens_at": iso_utc(now - timedelta(hours=1)),
            "voting_closes_at": iso_utc(now + timedelta(days=10)),
            "is_finale": True,
            "elimination_config": {"method": "top_n", "advance_count": 1},
        },
    )
    assert r2_resp.status_code == 201
    r2 = r2_resp.get_json()["data"]

    pkg_resp = client.post(
        "/api/v1/admin/packages",
        headers=_auth_headers(mgr_token),
        json={"competition_id": comp["id"], "name": "10 Votes Pack", "vote_quantity": 10, "price_minor": 1000},
    )
    assert pkg_resp.status_code == 201
    pkg = pkg_resp.get_json()["data"]

    return {
        "mgr_token": mgr_token,
        "rev_token": rev_token,
        "fin_token": fin_token,
        "sup_token": sup_token,
        "comp": comp,
        "cat": cat,
        "r1": r1,
        "r2": r2,
        "pkg": pkg,
    }


def test_scenarios_1_to_5_submission_permissions_nomination_and_unique_links(app, client):
    ctx = _setup_competition_and_actors(app, client)
    app_user1, app_token1 = _register_and_token(client, "Applicant One", "app1@test.gh")
    app_user2, app_token2 = _register_and_token(client, "Applicant Two", "app2@test.gh")

    # Upload clean MP3 demo file
    upload_resp = client.post(
        "/api/v1/applications/media",
        headers=_auth_headers(app_token1),
        data={"file": (io.BytesIO(b"ID3-fake-clean-audio-demo-bytes"), "demo.mp3")},
        content_type="multipart/form-data",
    )
    assert upload_resp.status_code == 201, upload_resp.get_json()
    media_id = upload_resp.get_json()["data"]["id"]

    # Reject executable disguised file
    bad_upload = client.post(
        "/api/v1/applications/media",
        headers=_auth_headers(app_token1),
        data={"file": (io.BytesIO(b"MZ\x90\x00executable"), "evil.mp3")},
        content_type="multipart/form-data",
    )
    assert bad_upload.status_code == 422

    # Scenario 1: Valid applicant submits demo and receives reference
    sub1 = client.post(
        "/api/v1/applications",
        headers=_auth_headers(app_token1),
        json={
            "competition_id": ctx["comp"]["id"],
            "category_id": ctx["cat"]["id"],
            "stage_name": "Kobby Highlife",
            "title": "Accra Lights Live",
            "description": "Original live acoustic Highlife session recorded in Osu.",
            "media_asset_id": media_id,
            "consent_accepted": True,
            "rights_declaration": True,
        },
    )
    assert sub1.status_code == 201, sub1.get_json()
    app1_data = sub1.get_json()["data"]
    assert app1_data["reference_no"].startswith("APP-")
    assert app1_data["status"] == "SUBMITTED"

    sub2 = client.post(
        "/api/v1/applications",
        headers=_auth_headers(app_token2),
        json={
            "competition_id": ctx["comp"]["id"],
            "category_id": ctx["cat"]["id"],
            "stage_name": "Abena Soul",
            "title": "Kumasi Soul",
            "description": "Live vocal ballad recorded in Kumasi.",
            "external_video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "consent_accepted": True,
            "rights_declaration": True,
        },
    )
    assert sub2.status_code == 201
    app2_data = sub2.get_json()["data"]

    # Scenario 2 & 15: Unauthorised users (applicant AND reviewer AND finance) cannot approve/nominate
    for bad_token in (app_token1, ctx["rev_token"], ctx["fin_token"]):
        forbid = client.post(
            f"/api/v1/admin/submissions/{app1_data['id']}/decision",
            headers=_auth_headers(bad_token),
            json={"decision": "NOMINATE"},
        )
        assert forbid.status_code == 403

    # Reviewer CAN score & recommend
    rev_res = client.post(
        f"/api/v1/admin/submissions/{app1_data['id']}/review",
        headers=_auth_headers(ctx["rev_token"]),
        json={"score": 91.5, "recommendation": "NOMINATE", "internal_notes": "Great vocal tone"},
    )
    assert rev_res.status_code == 201
    # Applicant must NOT see reviewer internal_notes
    own_view = client.get(f"/api/v1/applications/{app1_data['id']}", headers=_auth_headers(app_token1)).get_json()["data"]
    assert "reviews" not in own_view

    # Scenario 3 & 4: Authorised manager nominates both applicants; unique non-colliding slugs generated
    nom1_res = client.post(
        f"/api/v1/admin/submissions/{app1_data['id']}/decision",
        headers=_auth_headers(ctx["mgr_token"]),
        json={"decision": "NOMINATE", "round_id": ctx["r1"]["id"], "reason": "Top audition"},
    )
    assert nom1_res.status_code == 200, nom1_res.get_json()
    nom1 = nom1_res.get_json()["data"]["nominee"]
    re1 = nom1_res.get_json()["data"]["round_entry"]

    nom2_res = client.post(
        f"/api/v1/admin/submissions/{app2_data['id']}/decision",
        headers=_auth_headers(ctx["mgr_token"]),
        json={"decision": "NOMINATE", "round_id": ctx["r1"]["id"], "reason": "Strong vocals"},
    )
    assert nom2_res.status_code == 200
    nom2 = nom2_res.get_json()["data"]["nominee"]
    re2 = nom2_res.get_json()["data"]["round_entry"]

    assert nom1["public_slug"] != nom2["public_slug"]
    assert re1["voting_slug"] != re2["voting_slug"]

    # Scenario 5: Voter opens nominee voting link and sees correct competition, round, and packages
    link_res = client.get(f"/api/v1/vote-links/{re1['voting_slug']}")
    assert link_res.status_code == 200
    link_data = link_res.get_json()["data"]
    assert link_data["can_vote"] is True
    assert link_data["competition"]["slug"] == "ghana-talent-2026"
    assert link_data["round"]["id"] == ctx["r1"]["id"]
    assert len(link_data["packages"]) == 1


def test_scenarios_6_to_10_and_14_payments_webhooks_idempotency_quarantine_privacy_and_refunds(app, client):
    ctx = _setup_competition_and_actors(app, client)
    _, app_token1 = _register_and_token(client, "Nominee Alpha", "alpha@test.gh")
    _, app_token2 = _register_and_token(client, "Nominee Beta", "beta@test.gh")

    # Submit & nominate both
    for tok, sname in ((app_token1, "Alpha Star"), (app_token2, "Beta Vibe")):
        s = client.post(
            "/api/v1/applications",
            headers=_auth_headers(tok),
            json={
                "competition_id": ctx["comp"]["id"],
                "category_id": ctx["cat"]["id"],
                "stage_name": sname,
                "title": f"{sname} Demo",
                "description": "Original live audition demo performance.",
                "external_video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "consent_accepted": True,
                "rights_declaration": True,
            },
        ).get_json()["data"]
        client.post(
            f"/api/v1/admin/submissions/{s['id']}/decision",
            headers=_auth_headers(ctx["mgr_token"]),
            json={"decision": "NOMINATE", "round_id": ctx["r1"]["id"]},
        )

    link1 = client.get("/api/v1/nominee/voting-link", headers=_auth_headers(app_token1)).get_json()["data"]
    voting_slug1 = link1["voting_slug"]

    # Scenario 6: Pending and failed payments create ZERO votes
    ord_fail = client.post(
        "/api/v1/orders",
        json={
            "voting_slug": voting_slug1,
            "package_id": ctx["pkg"]["id"],
            "payment_channel": "mobile_money",
            "voter_phone": "+233249991111",
            "voter_email": "secretvoter@example.com",
        },
    ).get_json()["data"]
    init_fail = client.post("/api/v1/payments/initialize", json={"order_reference": ord_fail["public_reference"]}).get_json()["data"]

    # Still pending -> 0 votes
    dash_pending = client.get("/api/v1/nominee/dashboard", headers=_auth_headers(app_token1)).get_json()["data"]
    assert dash_pending["current_round_votes"] == 0
    assert dash_pending["is_provisional"] is True

    # Failed webhook -> 0 votes
    raw_fail, sig_fail = MockPaymentAdapter.simulate_provider_settlement(
        provider_reference=init_fail["provider_reference"],
        order_reference=ord_fail["public_reference"],
        amount_minor=1000,
        currency="GHS",
        status="FAILED",
    )
    wh_fail = client.post("/api/v1/payments/webhooks/mock", data=raw_fail, headers={"X-Payment-Signature": sig_fail})
    assert wh_fail.status_code == 200
    dash_after_fail = client.get("/api/v1/nominee/dashboard", headers=_auth_headers(app_token1)).get_json()["data"]
    assert dash_after_fail["current_round_votes"] == 0

    # Forged signature is rejected with 401
    forged = client.post("/api/v1/payments/webhooks/mock", data=raw_fail, headers={"X-Payment-Signature": "forged-sig"})
    assert forged.status_code == 401

    # Scenario 7 & 8: Verified payment credits exact vote quantity ONCE; webhook replay creates 0 extra votes
    ord_ok = client.post(
        "/api/v1/orders",
        json={
            "voting_slug": voting_slug1,
            "package_id": ctx["pkg"]["id"],
            "payment_channel": "mobile_money",
            "voter_phone": "+233248887777",
            "voter_email": "privatevoter@example.com",
        },
    ).get_json()["data"]
    init_ok = client.post("/api/v1/payments/initialize", json={"order_reference": ord_ok["public_reference"]}).get_json()["data"]

    raw_ok, sig_ok = MockPaymentAdapter.simulate_provider_settlement(
        provider_reference=init_ok["provider_reference"],
        order_reference=ord_ok["public_reference"],
        amount_minor=1000,
        currency="GHS",
        status="SUCCESS",
        event_id="evt_unique_001",
    )
    wh1 = client.post("/api/v1/payments/webhooks/mock", data=raw_ok, headers={"X-Payment-Signature": sig_ok})
    assert wh1.status_code == 200
    assert wh1.get_json()["data"]["votes_credited"] == 10
    assert wh1.get_json()["data"]["receipt_code"].startswith("TH-")

    # Replay exact same webhook AND replay with a different event_id for same payment -> still 10 votes!
    wh_replay1 = client.post("/api/v1/payments/webhooks/mock", data=raw_ok, headers={"X-Payment-Signature": sig_ok})
    assert wh_replay1.status_code == 200
    assert wh_replay1.get_json()["data"]["duplicate"] is True
    assert wh_replay1.get_json()["data"]["votes_credited"] == 0

    raw_ok_dup_evt, sig_ok_dup_evt = MockPaymentAdapter.simulate_provider_settlement(
        provider_reference=init_ok["provider_reference"],
        order_reference=ord_ok["public_reference"],
        amount_minor=1000,
        currency="GHS",
        status="SUCCESS",
        event_id="evt_unique_002_same_tx",
    )
    wh_replay2 = client.post("/api/v1/payments/webhooks/mock", data=raw_ok_dup_evt, headers={"X-Payment-Signature": sig_ok_dup_evt})
    assert wh_replay2.status_code == 200
    assert wh_replay2.get_json()["data"]["votes_credited"] == 0

    dash_alpha = client.get("/api/v1/nominee/dashboard", headers=_auth_headers(app_token1)).get_json()["data"]
    assert dash_alpha["current_round_votes"] == 10

    # Scenario 10: Nominee sees own dashboard without voter PII, and Beta sees only Beta's 0 votes
    serialized_dash = json.dumps(dash_alpha)
    assert "+233248887777" not in serialized_dash
    assert "privatevoter@example.com" not in serialized_dash

    dash_beta = client.get("/api/v1/nominee/dashboard", headers=_auth_headers(app_token2)).get_json()["data"]
    assert dash_beta["current_round_votes"] == 0
    assert dash_beta["nominee"]["public_name"] == "Beta Vibe"

    # Scenario 9: Mismatched amount is quarantined and creates ZERO votes
    ord_mis = client.post("/api/v1/orders", json={"voting_slug": voting_slug1, "package_id": ctx["pkg"]["id"]}).get_json()["data"]
    init_mis = client.post("/api/v1/payments/initialize", json={"order_reference": ord_mis["public_reference"]}).get_json()["data"]
    raw_mis, sig_mis = MockPaymentAdapter.simulate_provider_settlement(
        provider_reference=init_mis["provider_reference"],
        order_reference=ord_mis["public_reference"],
        amount_minor=500,  # Paid 5.00 GHS instead of required 10.00 GHS
        currency="GHS",
        status="SUCCESS",
    )
    wh_mis = client.post("/api/v1/payments/webhooks/mock", data=raw_mis, headers={"X-Payment-Signature": sig_mis})
    assert wh_mis.status_code == 200
    assert wh_mis.get_json()["data"]["outcome"] == "QUARANTINED"
    assert wh_mis.get_json()["data"]["votes_credited"] == 0
    assert client.get("/api/v1/nominee/dashboard", headers=_auth_headers(app_token1)).get_json()["data"]["current_round_votes"] == 10

    # Scenario 14: Refund creates an auditable reversal entry and reduces valid votes to 0
    ref_res = client.post(
        f"/api/v1/admin/payments/{init_ok['payment_id']}/refund",
        headers=_auth_headers(ctx["fin_token"]),
        json={"reason": "Confirmed customer chargeback"},
    )
    assert ref_res.status_code == 200, ref_res.get_json()
    assert ref_res.get_json()["data"]["reversal_entry"]["entry_type"] == "REVERSAL"
    assert ref_res.get_json()["data"]["reversal_entry"]["quantity"] == -10
    assert client.get("/api/v1/nominee/dashboard", headers=_auth_headers(app_token1)).get_json()["data"]["current_round_votes"] == 0


def test_scenarios_11_12_13_voting_windows_elimination_progression_and_closed_links(app, client):
    ctx = _setup_competition_and_actors(app, client)
    _, tok_a = _register_and_token(client, "Nominee A", "noma@test.gh")
    _, tok_b = _register_and_token(client, "Nominee B", "nomb@test.gh")

    nominees = []
    for tok, name, jscore in ((tok_a, "Star A", 95.0), (tok_b, "Star B", 80.0)):
        s = client.post(
            "/api/v1/applications",
            headers=_auth_headers(tok),
            json={
                "competition_id": ctx["comp"]["id"],
                "category_id": ctx["cat"]["id"],
                "stage_name": name,
                "title": f"{name} Entry",
                "description": "Valid audition performance entry.",
                "external_video_url": "https://vimeo.com/76979871",
                "consent_accepted": True,
                "rights_declaration": True,
            },
        ).get_json()["data"]
        client.post(
            f"/api/v1/admin/submissions/{s['id']}/review",
            headers=_auth_headers(ctx["rev_token"]),
            json={"score": jscore, "recommendation": "NOMINATE"},
        )
        dec = client.post(
            f"/api/v1/admin/submissions/{s['id']}/decision",
            headers=_auth_headers(ctx["mgr_token"]),
            json={"decision": "NOMINATE", "round_id": ctx["r1"]["id"]},
        ).get_json()["data"]
        nominees.append((dec["nominee"], dec["round_entry"]))

    (_, re_a), (_, re_b) = nominees

    # Credit 10 votes to Star A and 5 votes to Star B in Round 1
    for slug, qty in ((re_a["voting_slug"], 10), (re_b["voting_slug"], 5)):
        o = client.post("/api/v1/orders", json={"voting_slug": slug, "vote_quantity": qty}).get_json()["data"]
        p = client.post("/api/v1/payments/initialize", json={"order_reference": o["public_reference"]}).get_json()["data"]
        raw, sig = MockPaymentAdapter.simulate_provider_settlement(
            provider_reference=p["provider_reference"],
            order_reference=o["public_reference"],
            amount_minor=o["amount_minor"],
            currency="GHS",
            status="SUCCESS",
        )
        client.post("/api/v1/payments/webhooks/mock", data=raw, headers={"X-Payment-Signature": sig})

    # Scenario 11: Voting blocked when round window hasn't opened yet or has closed
    with app.app_context():
        r1_db = db.session.get(Round, ctx["r1"]["id"])
        r1_db.voting_opens_at = utcnow() + timedelta(hours=3)
        db.session.commit()

    future_block = client.post("/api/v1/orders", json={"voting_slug": re_a["voting_slug"], "vote_quantity": 2})
    assert future_block.status_code == 400

    with app.app_context():
        r1_db = db.session.get(Round, ctx["r1"]["id"])
        r1_db.voting_opens_at = utcnow() - timedelta(days=2)
        r1_db.voting_closes_at = utcnow() - timedelta(minutes=5)
        db.session.commit()

    closed_block = client.post("/api/v1/orders", json={"voting_slug": re_a["voting_slug"], "vote_quantity": 2})
    assert closed_block.status_code == 400

    # Scenario 12: Elimination preview matches configured top_n=1 rule; finalisation creates immutable snapshot & advances Star A to Round 2
    preview = client.get(
        f"/api/v1/admin/eliminations/{ctx['r1']['id']}/preview",
        headers=_auth_headers(ctx["mgr_token"]),
    )
    assert preview.status_code == 200
    pdata = preview.get_json()["data"]
    assert pdata["summary"]["qualified_count"] == 1
    assert pdata["summary"]["eliminated_count"] == 1
    assert pdata["results"][0]["public_name"] == "Star A"
    assert pdata["results"][0]["outcome"] == "QUALIFIED"
    assert pdata["results"][1]["public_name"] == "Star B"
    assert pdata["results"][1]["outcome"] == "ELIMINATED"

    fin = client.post(
        f"/api/v1/admin/eliminations/{ctx['r1']['id']}/finalise",
        headers=_auth_headers(ctx["mgr_token"]),
        json={"confirmed": True, "publish_results": True, "notes": "Confirmed Round 1"},
    )
    assert fin.status_code == 201, fin.get_json()
    run_data = fin.get_json()["data"]
    assert run_data["status"] == "FINALIZED"

    # Re-finalising without explicit correction flag is blocked (immutable snapshot safeguard)
    dup_fin = client.post(
        f"/api/v1/admin/eliminations/{ctx['r1']['id']}/finalise",
        headers=_auth_headers(ctx["mgr_token"]),
        json={"confirmed": True},
    )
    assert dup_fin.status_code == 409

    # Scenario 13 & FR-NOM-006: Old Round 1 links resolve to closed-round info and block voting; eliminated Star B cannot receive votes
    old_link_a = client.get(f"/api/v1/vote-links/{re_a['voting_slug']}").get_json()["data"]
    assert old_link_a["can_vote"] is False
    assert old_link_a["is_closed_round_link"] is True
    assert old_link_a["has_newer_open_round"] is True

    elim_vote = client.post("/api/v1/orders", json={"voting_slug": re_b["voting_slug"], "vote_quantity": 5})
    assert elim_vote.status_code == 400

    # Meanwhile Star A automatically received a NEW Round 2 voting link that accepts votes!
    r2_link_a = client.get("/api/v1/nominee/voting-link", headers=_auth_headers(tok_a)).get_json()["data"]
    assert r2_link_a["voting_slug"] != re_a["voting_slug"]
    assert r2_link_a["current_round"]["id"] == ctx["r2"]["id"]
    r2_order = client.post("/api/v1/orders", json={"voting_slug": r2_link_a["voting_slug"], "vote_quantity": 3})
    assert r2_order.status_code == 201


def test_seed_demo_reconciliation_pause_adjustments_and_reports(app, client):
    from app.services.seed_service import seed_demo_data_if_empty

    with app.app_context():
        seed_demo_data_if_empty()

    # Public home & directory work out-of-the-box
    home = client.get("/api/v1/public/home")
    assert home.status_code == 200
    home_data = home.get_json()["data"]
    assert home_data["active_competition"]["slug"] == "stagelight-ghana-2026"
    assert len(home_data["featured_nominees"]) >= 4

    # Login with seeded Super Admin, Manager, and Finance Officer
    sup_login = client.post("/api/v1/auth/login", json={"identifier": "admin@stagelight.gh", "password": "Admin@2026!"}).get_json()["data"]
    mgr_login = client.post("/api/v1/auth/login", json={"identifier": "manager@stagelight.gh", "password": "Manager@2026!"}).get_json()["data"]
    fin_login = client.post("/api/v1/auth/login", json={"identifier": "finance@stagelight.gh", "password": "Finance@2026!"}).get_json()["data"]

    sup_tok = sup_login["token"]
    mgr_tok = mgr_login["token"]
    fin_tok = fin_login["token"]

    # Pause voting globally -> blocks new orders; resume -> allows orders
    target_nom = home_data["featured_nominees"][0]
    pause_res = client.post(
        "/api/v1/admin/pause-voting",
        headers=_auth_headers(mgr_tok),
        json={"scope": "global", "paused": True, "incident_message": "Routine gateway check"},
    )
    assert pause_res.status_code == 200
    blocked = client.post("/api/v1/orders", json={"voting_slug": target_nom["voting_slug"], "vote_quantity": 2})
    assert blocked.status_code == 403

    client.post(
        "/api/v1/admin/pause-voting",
        headers=_auth_headers(mgr_tok),
        json={"scope": "global", "paused": False, "incident_message": ""},
    )

    # Server-to-server reconciliation when webhook didn't fire yet
    ord_rec = client.post("/api/v1/orders", json={"voting_slug": target_nom["voting_slug"], "vote_quantity": 4}).get_json()["data"]
    pay_rec = client.post("/api/v1/payments/initialize", json={"order_reference": ord_rec["public_reference"]}).get_json()["data"]
    # Provider settles internally, before webhook arrives
    MockPaymentAdapter.simulate_provider_settlement(
        provider_reference=pay_rec["provider_reference"],
        order_reference=ord_rec["public_reference"],
        amount_minor=ord_rec["amount_minor"],
        currency="GHS",
        status="SUCCESS",
    )
    recon = client.post(
        f"/api/v1/admin/payments/{pay_rec['payment_id']}/reconcile",
        headers=_auth_headers(fin_tok),
    )
    assert recon.status_code == 200
    assert recon.get_json()["data"]["outcome"] == "CREDITED"
    assert recon.get_json()["data"]["votes_credited"] == 4

    # Vote adjustment blocked for Manager/Finance, allowed for Super Admin with approval ref
    active_round_id = home_data["active_round"]["id"]
    mgr_adj = client.post(
        "/api/v1/admin/votes/adjustments",
        headers=_auth_headers(mgr_tok),
        json={
            "nominee_id": target_nom["id"],
            "round_id": active_round_id,
            "quantity": 5,
            "reason": "Test adjustment",
            "approval_reference": "APR-001",
        },
    )
    assert mgr_adj.status_code == 403

    sup_adj = client.post(
        "/api/v1/admin/votes/adjustments",
        headers=_auth_headers(sup_tok),
        json={
            "nominee_id": target_nom["id"],
            "round_id": active_round_id,
            "quantity": 5,
            "reason": "Verified batch settlement discrepancy resolution",
            "approval_reference": "FIN-APR-2026-09",
        },
    )
    assert sup_adj.status_code == 201

    # CSV Finance export & RBAC check
    csv_resp = client.get("/api/v1/admin/reports/finance?format=csv", headers=_auth_headers(fin_tok))
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.content_type
    assert "public_reference" in csv_resp.get_data(as_text=True)

    # Finance officer cannot export applications report
    fin_apps = client.get("/api/v1/admin/reports/applications", headers=_auth_headers(fin_tok))
    assert fin_apps.status_code == 403


def test_admin_page_filters_across_all_endpoints(app, client):
    from app.services.seed_service import seed_demo_data_if_empty

    with app.app_context():
        seed_demo_data_if_empty()

    sup_login = client.post("/api/v1/auth/login", json={"identifier": "admin@stagelight.gh", "password": "Admin@2026!"}).get_json()["data"]
    mod_login = client.post("/api/v1/auth/login", json={"identifier": "moderator@stagelight.gh", "password": "Moderator@2026!"}).get_json()["data"]
    sup_tok = sup_login["token"]
    mod_tok = mod_login["token"]

    # Competitions & Categories filters (including Moderator dropdown read access)
    comps = client.get("/api/v1/admin/competitions?q=StageLight&voting_paused=false", headers=_auth_headers(mod_tok))
    assert comps.status_code == 200
    comp_list = comps.get_json()["data"]
    assert len(comp_list) >= 1
    comp_id = comp_list[0]["id"]

    cats = client.get(f"/api/v1/admin/categories?competition_id={comp_id}&status=ACTIVE", headers=_auth_headers(mod_tok))
    assert cats.status_code == 200
    assert len(cats.get_json()["data"]) >= 1

    # Dashboard filters
    dash = client.get(f"/api/v1/admin/dashboard?competition_id={comp_id}&audit_entity=competition", headers=_auth_headers(sup_tok))
    assert dash.status_code == 200
    assert "kpis" in dash.get_json()["data"]

    # Rounds & Packages filters
    rounds = client.get(f"/api/v1/admin/rounds?competition_id={comp_id}&status=OPEN", headers=_auth_headers(sup_tok))
    assert rounds.status_code == 200
    assert all(r["status"] == "OPEN" for r in rounds.get_json()["data"])

    pkgs = client.get(f"/api/v1/admin/packages?competition_id={comp_id}&is_featured=true", headers=_auth_headers(sup_tok))
    assert pkgs.status_code == 200
    assert all(p["is_featured"] is True for p in pkgs.get_json()["data"])

    # Submissions filters
    subs = client.get("/api/v1/admin/submissions?q=Ama&sort=stage_name&moderation_status=VISIBLE", headers=_auth_headers(sup_tok))
    assert subs.status_code == 200
    assert len(subs.get_json()["data"]) >= 1

    # Nominees filters (search, featured, sort by votes)
    noms = client.get("/api/v1/admin/nominees?is_featured=true&sort=votes_desc&q=Ama", headers=_auth_headers(sup_tok))
    assert noms.status_code == 200
    assert any("Ama" in n["public_name"] for n in noms.get_json()["data"])

    # Votes, Orders, Payments filters
    votes = client.get("/api/v1/admin/votes?entry_type=CREDIT&q=Ama", headers=_auth_headers(sup_tok))
    assert votes.status_code == 200
    assert all(v["entry_type"] == "CREDIT" for v in votes.get_json()["data"])

    orders = client.get("/api/v1/admin/orders?status=PAID&payment_channel=mobile_money", headers=_auth_headers(sup_tok))
    assert orders.status_code == 200
    assert all(o["status"] == "PAID" for o in orders.get_json()["data"])

    payments = client.get("/api/v1/admin/payments?status=SUCCESS&provider=mock", headers=_auth_headers(sup_tok))
    assert payments.status_code == 200
    assert all(p["status"] == "SUCCESS" for p in payments.get_json()["data"])

    # Users, Moderation, Support Tickets, Reports, Audit Logs filters
    users = client.get("/api/v1/admin/users?role=SUPER_ADMIN&status=ACTIVE&q=admin", headers=_auth_headers(sup_tok))
    assert users.status_code == 200
    assert len(users.get_json()["data"]) == 1

    mod_cases = client.get("/api/v1/admin/moderation?status=OPEN", headers=_auth_headers(sup_tok))
    assert mod_cases.status_code == 200

    tickets = client.get("/api/v1/admin/support-tickets?category=PAYMENT&status=OPEN", headers=_auth_headers(sup_tok))
    assert tickets.status_code == 200

    rep = client.get(f"/api/v1/admin/reports/finance?competition_id={comp_id}&status=PAID", headers=_auth_headers(sup_tok))
    assert rep.status_code == 200
    assert all(r["status"] == "PAID" for r in rep.get_json()["data"]["rows"])

    audits = client.get("/api/v1/admin/audit-logs?q=REPORT&entity_type=report", headers=_auth_headers(sup_tok))
    assert audits.status_code == 200
    assert len(audits.get_json()["data"]) >= 1


