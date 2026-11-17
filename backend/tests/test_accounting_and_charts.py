from app.extensions import db
from app.models.financial import Payout
from app.models.user import User
from app.services.auth_service import grant_role


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, email, password):
    resp = client.post("/api/v1/auth/login", json={"identifier": email, "password": password})
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()["data"]["token"]


def test_dashboard_charts_and_accounting_suite(app, client):
    from app.services.seed_service import seed_demo_data_if_empty

    with app.app_context():
        seed_demo_data_if_empty()

    fin_token = _login(client, "finance@stagelight.gh", "Finance@2026!")
    mgr_token = _login(client, "manager@stagelight.gh", "Manager@2026!")
    app_token = _login(client, "applicant@stagelight.gh", "Applicant@2026!")

    # 1. Dashboard charts analytics
    dash_res = client.get("/api/v1/admin/dashboard", headers=_auth_headers(mgr_token))
    assert dash_res.status_code == 200
    dash_data = dash_res.get_json()["data"]
    assert "chart_analytics" in dash_data
    charts = dash_data["chart_analytics"]
    assert "revenue_trend" in charts
    assert len(charts["revenue_trend"]) == 14
    assert "category_distribution" in charts
    assert "channel_breakdown" in charts
    assert "round_breakdown" in charts

    # 2. Accounting Overview
    acct_res = client.get("/api/v1/admin/accounting/overview", headers=_auth_headers(fin_token))
    assert acct_res.status_code == 200
    acct_data = acct_res.get_json()["data"]
    summary = acct_data["summary"]
    assert "gross_collections_ghs" in summary
    assert "net_collections_ghs" in summary
    assert "prize_pool_budget_ghs" in summary
    assert summary["prize_pool_budget_ghs"] == 180000.00
    assert "payouts_disbursed_ghs" in summary
    assert len(acct_data["prize_framework"]) >= 5
    assert len(acct_data["recent_payouts"]) >= 1

    # 3. RBAC checks on accounting
    assert client.get("/api/v1/admin/accounting/overview", headers=_auth_headers(app_token)).status_code == 403

    # 4. Financial Transactions Ledger & CSV Export
    tx_res = client.get("/api/v1/admin/accounting/transactions?per_page=10", headers=_auth_headers(fin_token))
    assert tx_res.status_code == 200
    tx_body = tx_res.get_json()
    assert len(tx_body["data"]) >= 1
    assert "summary" in tx_body["meta"]

    csv_res = client.get("/api/v1/admin/accounting/transactions?format=csv", headers=_auth_headers(fin_token))
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.content_type
    assert b"gross_amount_ghs" in csv_res.data

    # 5. Payouts Lifecycle (Create -> Approve -> Disburse -> Delete)
    payout_create = client.post(
        "/api/v1/admin/accounting/payouts",
        headers=_auth_headers(fin_token),
        json={
            "title": "Category Excellence Grant Test",
            "payout_type": "GRANT",
            "beneficiary_type": "NOMINEE",
            "beneficiary_name": "Test Beneficiary",
            "amount_major": 1500.0,
            "tax_withheld_percent": 5.0,
            "payment_method": "MOBILE_MONEY",
            "account_details": "MTN MoMo 0240001122",
        },
    )
    assert payout_create.status_code == 201
    created_payout = payout_create.get_json()["data"]
    assert created_payout["amount_major"] == 1500.0
    assert created_payout["tax_withheld_major"] == 75.0
    assert created_payout["net_amount_major"] == 1425.0
    assert created_payout["status"] == "PENDING_APPROVAL"

    # Approve
    apprv = client.patch(
        f"/api/v1/admin/accounting/payouts/{created_payout['id']}",
        headers=_auth_headers(fin_token),
        json={"status": "APPROVED"},
    )
    assert apprv.status_code == 200
    assert apprv.get_json()["data"]["status"] == "APPROVED"

    # Disburse
    disb = client.patch(
        f"/api/v1/admin/accounting/payouts/{created_payout['id']}",
        headers=_auth_headers(fin_token),
        json={"status": "DISBURSED", "transaction_reference": "MM-TEST-99201"},
    )
    assert disb.status_code == 200
    assert disb.get_json()["data"]["status"] == "DISBURSED"
    assert disb.get_json()["data"]["transaction_reference"] == "MM-TEST-99201"

    # Disbursed payout cannot be deleted (conflict)
    assert client.delete(f"/api/v1/admin/accounting/payouts/{created_payout['id']}", headers=_auth_headers(fin_token)).status_code == 409

    # Payouts CSV
    po_csv = client.get("/api/v1/admin/accounting/payouts?format=csv", headers=_auth_headers(fin_token))
    assert po_csv.status_code == 200
    assert b"reference_no" in po_csv.data
