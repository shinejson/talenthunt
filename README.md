# StageLight — Talent Hunt & Verified Public Voting Platform

Implementation of the **Talent Hunt Platform PRD & Technical Design (`design.md`)** built with:

- **Backend:** Python 3.11+ & Flask (`Flask`, `Flask-SQLAlchemy`, `Flask-Migrate`, `Marshmallow`, `Flask-Limiter`, `Flask-CORS`, `PyJWT`, `qrcode`, `Pillow`, `Gunicorn`)
- **Frontend:** AngularJS 1.x (`angular@1.8.3`, `angular-route@1.8.3`, `angular-sanitize@1.8.3`, `Chart.js`, `DataTables 3` — vendored in `frontend/vendor`, no jQuery or CDN)
- **Database:** PostgreSQL-compatible SQLAlchemy schema (`DATABASE_URL=postgresql://...`), defaulting to local SQLite (`backend/talent_hunt.db`) for zero-config local development.

---

## Key Capabilities Implemented

1. **Public Website & Discovery (`/`):**
   - Responsive mobile-first landing page (360px+ viewport support), active competition spotlight, featured categories, searchable/filterable nominee directory (`/nominees`), public nominee demo profiles (`/nominee/:slug`), official sponsors directory & tier packages (`/sponsors`, `/sponsors/:slug`), strategic & ecosystem partners directory (`/partners`, `/partners/:slug`) with partnership inquiry submissions, published round results & leaderboards (`/results`), FAQ, competition rules, terms, privacy, and support ticket submission (`/contact`).
2. **Authentication & Role-Based Access Control (RBAC):**
   - Roles enforced server-side: `VISITOR`, `APPLICANT`, `NOMINEE`, `REVIEWER`, `MODERATOR`, `COMPETITION_MANAGER`, `FINANCE_OFFICER`, `SUPER_ADMIN`.
   - Invitation-only contestant accounts, login, contact verification, password recovery, session revocation on password change, and account deactivation.
3. **Demo Submission, Review & Nomination:**
   - Public applications with detailed contact and act information, optional photo, up to two demos, and guardian consent where required. Track an application with its code and email; no applicant account is created on submission.
   - Private audition files, reviewer scorecards and notes, and Competition Manager decisions. Nomination provisions portal access, emails a one-time password setup link, and generates the nominee and round-specific voting links.
4. **Payment Provider Adapter & Immutable Vote Ledger:**
   - Pluggable payment adapters (`MockPaymentAdapter` GhanaPay Sandbox + `PaystackPaymentAdapter`).
   - Server-calculated pricing in integer minor units (GHS pesewas).
   - Votes credited **only** after HMAC-verified webhook + server-to-server status inquiry; idempotent webhook tracking (`webhook_events` + `vote_ledger` unique constraints) prevents duplicate vote crediting; mismatched amounts/currencies are automatically `QUARANTINED`.
   - Append-only `vote_ledger` (`CREDIT`, `REVERSAL` on confirmed refund/chargeback, `ADJUSTMENT` with mandatory reason & second-person approval reference).
5. **Nominee & Admin Dashboards + Multi-Model Elimination:**
   - Nominee dashboard (`/portal/voting`) with ledger-derived round totals, provisional status badge, copyable voting link, downloadable PNG QR code, Chart.js daily vote trend, round history, and zero voter PII exposure.
   - Configurable round elimination (`top_n`, `percentage`, `threshold`, `manual`, `hybrid`), tie-breakers, preview with anomaly warnings, immutable `EliminationRun` snapshots, automatic advancement to the next round with fresh voting slugs, CSV report exports, emergency voting pause, and full `AuditLog` coverage.

---

## Quick Start

### Windows (Quickest)
Simply double-click or run:
```cmd
start_server.bat
```
*(To stop the server at any time, run `stop_server.bat`)*

Or manually via PowerShell:
```powershell
# 1. Install dependencies (if not already installed)
.\.venv\Scripts\pip.exe install -r backend\requirements.txt

# 2. Run automated test suite
.\.venv\Scripts\pytest.exe -v backend\tests

# 3. Start unified server (binds http://localhost:5050)
.\.venv\Scripts\python.exe backend\wsgi.py
```

### Linux / macOS
```bash
# 1. Create virtual environment & install dependencies
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

# 2. Run automated acceptance & security test suite
.venv/bin/pytest -v backend/tests

# 3. Start the unified Flask API + AngularJS 1.x server (binds 0.0.0.0:5050)
PORT=5050 PYTHONPATH=backend .venv/bin/python backend/wsgi.py
```

> [!NOTE]
> StageLight is a unified single-server application (Flask serves both the API and the AngularJS SPA). It uses an embedded SQLite database (`backend/talent_hunt.db`) with zero external service dependencies—XAMPP Apache and MySQL are not required.

### Seeded Demo Accounts (Local / Sandbox Mode)

| Role | Email | Password |
| :--- | :--- | :--- |
| **Super Admin** | `admin@stagelight.gh` | `Admin@2026!` |
| **Competition Manager** | `manager@stagelight.gh` | `Manager@2026!` |
| **Reviewer / Judge** | `judge@stagelight.gh` | `Judge@2026!` |
| **Finance Officer** | `finance@stagelight.gh` | `Finance@2026!` |
| **Moderator** | `moderator@stagelight.gh` | `Moderator@2026!` |
| **Nominee (Ama Gold)** | `ama@stagelight.gh` | `Nominee@2026!` |
| **Legacy applicant (Benaiah)** | `applicant@stagelight.gh` | `Applicant@2026!` |

---

## Applications, tracking, and portal invitations

1. Applicants visit `/apply`, select an open competition and category, and enter their contact and talent details. They can attach a photo (up to 5 MiB) and two videos (MP4, MOV, or WebM, up to 40 MiB each). An approved hosted link can replace the first demo. The site displays a tracking code when the submission is saved.
2. At `/track-application`, applicants enter the code and the email they applied with. The result shows status and feedback meant for the applicant, not internal reviews or audition files.
3. In **Admin → Review Queue**, staff search by tracking code or name. A reviewer or manager records a scorecard. A Competition Manager or Super Admin can then nominate the contestant.
4. Nomination sends the sign-in email address and a one-time password setup link (valid for 48 hours) to a new nominee. Existing verified contestant accounts keep their passwords. The Review Queue shows when the nomination email was sent and lets managers resend it if delivery fails or the link expires. A successful resend for an invited user replaces their previous link.

The audition photo and demos uploaded through the public application are available to the review team and, after sign-in, the nominee. They are not published on the public nominee profile. Existing accounts and applications remain available in the portal; public account registration is disabled.

### Upgrading an existing database

Back up your database and uploads first. Stop running instances during the migration. With `DATABASE_URL` pointing to your existing database, run this from the repository root before starting the updated app:

```bash
AUTO_SEED_DEMO=false .venv/bin/flask --app backend/wsgi.py db upgrade --directory backend/migrations
```

With Docker Compose, build the new image, then run `docker compose run --rm web flask --app wsgi:app db upgrade` before bringing the app back up. New local databases include the latest schema automatically. In production, route `/uploads/` through Flask (as in `nginx.conf`) so private audition files aren't served directly by the web server.

### Email setup

Set `PUBLIC_BASE_URL` to the public HTTPS URL nominees should open. Set `MAIL_SERVER`, `MAIL_PORT`, `MAIL_DEFAULT_SENDER`, and, if required by your SMTP provider, `MAIL_USERNAME` and `MAIL_PASSWORD`. Use `MAIL_USE_TLS=true` for STARTTLS (usually port 587) or `MAIL_USE_SSL=true` for implicit TLS (usually port 465). See `.env.example`. Configure these as deployment environment variables; don't commit credentials.

Without working SMTP settings, the nomination is saved but the browser reports that email was not sent. Once SMTP is configured, use **Send nomination email** in the Review Queue. Local tests simulate SMTP so they never deliver real mail.

---

## Data Tables & Pagination

Every table on the admin console and the applicant/nominee portal is rendered by
[DataTables](https://datatables.net) through the `th-datatable` directive
(`frontend/app/components/datatable/datatable.directive.js`). DataTables owns the page-size
selector, numbered paging, the "Showing X to Y of Z" summary and column ordering; each row is
still an ordinary AngularJS template, so buttons, filters and components keep working.

- **Server-side tables** (submissions, nominees, vote ledger, orders, payments, users, moderation
  cases, support tickets, audit logs): DataTables requests one page at a time from the API with
  `page`, `per_page` (max 100) and, when a column header is clicked, `sort_by` + `sort_dir=asc|desc`.
  Sortable columns are whitelisted per endpoint (`apply_sort` in `backend/app/utils/pagination.py`).

  ```js
  vm.table = DataTableSource.server('/admin/orders',
    function () { return AdminFilterUtils.cleanParams(vm.filters); },   // current filter values
    function (res) { vm.meta = res.meta || {}; });                      // optional, after each page
  vm.table.load(1);   // filters changed: back to page 1      vm.table.load();   // refresh in place
  ```
  ```html
  <table class="data-table" th-datatable="vm.table" dt-row="o" dt-empty="No orders found.">
    <thead><tr><th dt-sort="public_reference">Order Ref</th><th>Nominee</th></tr></thead>
    <tbody><tr><td>{{ o.public_reference }}</td><td>{{ o.nominee_name }}</td></tr></tbody>
  </table>
  ```
- **Client-side tables** (categories, rounds, vote packages, sponsors & partners, elimination
  standings, report previews, webhook events, dashboard and portal lists): the list is already
  loaded, so pass it with `dt-data="vm.categories"` and DataTables pages and sorts it in the browser.

After upgrading the package, run `npm run sync-vendor` in `frontend/` to refresh the vendored copy.
