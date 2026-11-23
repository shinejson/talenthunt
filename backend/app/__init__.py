import logging
import os
import uuid
from flask import Flask, g, request, send_from_directory
from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.exceptions import HTTPException

from app.config import CONFIG_MAP, Config
from app.extensions import cors, db, limiter, migrate
from app.models.application import MediaAsset
from app.policies.rbac import get_current_user
from app.schemas import DomainError
from app.utils.responses import api_error, api_success


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    module_name = type(dbapi_connection).__module__
    if "sqlite" in module_name:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_app(config_object=None) -> Flask:
    flask_app = Flask(__name__, static_folder=None)

    if config_object is None:
        env_name = os.environ.get("FLASK_ENV", "development").lower()
        config_cls = CONFIG_MAP.get(env_name, Config)
        flask_app.config.from_object(config_cls)
    elif isinstance(config_object, str):
        flask_app.config.from_object(CONFIG_MAP.get(config_object, Config))
    else:
        flask_app.config.from_object(config_object)

    os.makedirs(flask_app.config["UPLOAD_FOLDER"], exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    )

    db.init_app(flask_app)
    migrate.init_app(flask_app, db)
    cors.init_app(
        flask_app,
        resources={r"/api/*": {"origins": flask_app.config.get("FRONTEND_ORIGIN", "*")}},
        supports_credentials=True,
    )
    limiter.enabled = bool(flask_app.config.get("RATELIMIT_ENABLED", True))
    limiter.init_app(flask_app)

    @flask_app.before_request
    def _assign_request_id():
        g.request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

    @flask_app.after_request
    def _apply_headers(response):
        response.headers["X-Request-ID"] = getattr(g, "request_id", "")
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    from app.api.admin.routes import admin_bp
    from app.api.auth.routes import auth_bp
    from app.api.nominees.routes import nominees_bp
    from app.api.notifications.routes import notifications_bp
    from app.api.payments.routes import payments_bp
    from app.api.public.routes import public_bp
    from app.api.submissions.routes import submissions_bp
    from app.api.voting.routes import voting_bp

    api_prefix = "/api/v1"
    flask_app.register_blueprint(public_bp, url_prefix=api_prefix)
    flask_app.register_blueprint(auth_bp, url_prefix=f"{api_prefix}/auth")
    flask_app.register_blueprint(submissions_bp, url_prefix=f"{api_prefix}/applications")
    flask_app.register_blueprint(nominees_bp, url_prefix=f"{api_prefix}/nominee")
    flask_app.register_blueprint(notifications_bp, url_prefix=f"{api_prefix}/notifications")
    flask_app.register_blueprint(voting_bp, url_prefix=api_prefix)
    flask_app.register_blueprint(payments_bp, url_prefix=f"{api_prefix}/payments")
    flask_app.register_blueprint(admin_bp, url_prefix=f"{api_prefix}/admin")

    @flask_app.route("/invalid", methods=["GET", "HEAD", "POST"])
    @flask_app.route("/invalid/", methods=["GET", "HEAD", "POST"])
    @flask_app.route("/invalid/<path:subpath>", methods=["GET", "HEAD", "POST"])
    @limiter.exempt
    def handle_invalid_probe(subpath=None):
        return ("", 204)

    @flask_app.get("/api/v1/health")
    @limiter.exempt
    def health_check():
        db_status = "connected"
        try:
            db.session.execute(db.text("SELECT 1"))
        except Exception as e:
            db_status = f"unavailable: {str(e)}"
            return api_error("DATABASE_UNAVAILABLE", "Database connection check failed", 503)

        return api_success(
            {
                "status": "healthy",
                "database": db_status,
                "service": flask_app.config.get("PLATFORM_NAME", "StageLight"),
                "version": "1.0.0",
                "environment": os.environ.get("FLASK_ENV", "development"),
            }
        )

    @flask_app.get("/api/v1/openapi.json")
    def openapi_spec():
        return api_success(
            {
                "openapi": "3.0.3",
                "info": {
                    "title": f"{flask_app.config.get('PLATFORM_NAME', 'StageLight')} Talent Hunt API",
                    "version": "1.0.0",
                },
                "servers": [{"url": "/api/v1"}],
            }
        )

    @flask_app.get("/uploads/<path:storage_key>")
    @limiter.exempt
    def serve_uploaded_media(storage_key: str):
        asset = MediaAsset.query.filter_by(storage_key=storage_key, scan_status="CLEAN").first()
        if not asset:
            return api_error("MEDIA_NOT_FOUND", "Media file not found.", 404)
        if asset.is_private:
            user = get_current_user()
            if not user or (user.id != asset.owner_user_id and not user.has_role("SUPER_ADMIN", "COMPETITION_MANAGER", "REVIEWER", "MODERATOR")):
                response, status = api_error("MEDIA_NOT_FOUND", "Media file not found.", 404)
                response.headers["Cache-Control"] = "private, no-store"
                return response, status
        response = send_from_directory(
            flask_app.config["UPLOAD_FOLDER"], storage_key, mimetype=asset.mime_type, conditional=True
        )
        if asset.is_private:
            response.headers["Cache-Control"] = "private, no-store"
        return response

    frontend_dir = flask_app.config.get("FRONTEND_DIR")

    @flask_app.get("/")
    @limiter.exempt
    def serve_spa_index():
        if frontend_dir and os.path.isfile(os.path.join(frontend_dir, "index.html")):
            return send_from_directory(frontend_dir, "index.html")
        return api_success({"service": "StageLight API", "docs": "/api/v1/health"})

    @flask_app.get("/<path:req_path>")
    @limiter.exempt
    def serve_spa_assets_or_fallback(req_path: str):
        if req_path.startswith("api/"):
            return api_error("ENDPOINT_NOT_FOUND", f"API endpoint '/{req_path}' does not exist.", 404)
        if frontend_dir:
            candidate = os.path.normpath(os.path.join(frontend_dir, req_path))
            if candidate.startswith(os.path.abspath(frontend_dir)) and os.path.isfile(candidate):
                rel = os.path.relpath(candidate, frontend_dir).replace("\\", "/")
                return send_from_directory(frontend_dir, rel)
            index_file = os.path.join(frontend_dir, "index.html")
            if os.path.isfile(index_file):
                return send_from_directory(frontend_dir, "index.html")
        return api_error("NOT_FOUND", "Resource not found.", 404)

    @flask_app.errorhandler(DomainError)
    def handle_domain_error(exc: DomainError):
        return api_error(exc.code, exc.message, exc.status_code, exc.fields)

    @flask_app.errorhandler(429)
    def handle_rate_limit(exc):
        return api_error("RATE_LIMITED", "Too many requests. Please wait a moment and try again.", 429)

    @flask_app.errorhandler(HTTPException)
    def handle_http_exception(exc: HTTPException):
        if request.path.startswith("/api/"):
            return api_error(
                exc.name.upper().replace(" ", "_"),
                exc.description or "Request failed.",
                exc.code or 400,
            )
        return exc

    @flask_app.errorhandler(Exception)
    def handle_unexpected_exception(exc: Exception):
        flask_app.logger.exception("Unhandled exception on %s", request.path)
        db.session.rollback()
        return api_error("INTERNAL_ERROR", "An unexpected server error occurred.", 500)

    @flask_app.cli.command("seed-demo")
    def cli_seed_demo():
        from app.services.seed_service import seed_demo_data_if_empty
        seed_demo_data_if_empty()
        print("Demo data seeded.")

    @flask_app.cli.command("reconcile-payments")
    def cli_reconcile_payments():
        from app.tasks.jobs import reconcile_all_pending_payments
        res = reconcile_all_pending_payments()
        print("Reconciliation summary:", res)

    with flask_app.app_context():
        from app import models as _models  # noqa: F401
        db.create_all()
        from app.models.user import ensure_auth_schema
        ensure_auth_schema()
        from app.services.auth_service import ensure_roles_exist
        ensure_roles_exist()
        db.session.commit()
        if flask_app.config.get("AUTO_SEED_DEMO", False) and not flask_app.config.get("TESTING", False):
            from app.services.seed_service import seed_demo_data_if_empty
            seed_demo_data_if_empty()

    return flask_app
