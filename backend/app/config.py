import os
from datetime import timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BASE_DIR)


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-talent-hunt-secret-change-me")
    _raw_db_url = os.environ.get("DATABASE_URL")
    if _raw_db_url and _raw_db_url.startswith("postgres://"):
        _raw_db_url = _raw_db_url.replace("postgres://", "postgresql://", 1)

    SQLALCHEMY_DATABASE_URI = _raw_db_url or (
        "sqlite:///" + os.path.join(BASE_DIR, "talent_hunt.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": int(os.environ.get("DB_POOL_RECYCLE", "300")),
    }
    JSON_SORT_KEYS = False
    MAX_CONTENT_LENGTH = 90 * 1024 * 1024  # Two 40 MiB videos, a 5 MiB photo, and form data.
    UPLOAD_FOLDER = os.environ.get(
        "UPLOAD_FOLDER",
        os.path.join(BASE_DIR, "uploads"),
    )
    FRONTEND_DIR = os.environ.get(
        "FRONTEND_DIR",
        os.path.join(REPO_ROOT, "frontend"),
    )
    ALLOWED_MEDIA_EXTENSIONS = {"mp4", "mov", "webm", "mp3", "wav", "jpg", "jpeg", "png", "gif"}
    MAX_UPLOAD_BYTES = 40 * 1024 * 1024
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true"
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_ENABLED = os.environ.get("RATELIMIT_ENABLED", "true").lower() == "true"
    PAYMENT_PROVIDER = os.environ.get("PAYMENT_PROVIDER", "mock")
    PAYMENT_WEBHOOK_SECRET = os.environ.get("PAYMENT_WEBHOOK_SECRET", "mock-webhook-secret")
    PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY", "")
    PAYSTACK_BASE_URL = os.environ.get("PAYSTACK_BASE_URL", "https://api.paystack.co")
    PLATFORM_NAME = os.environ.get("PLATFORM_NAME", "StageLight")
    PLATFORM_CURRENCY = os.environ.get("PLATFORM_CURRENCY", "GHS")
    DEFAULT_TIMEZONE = os.environ.get("DEFAULT_TIMEZONE", "Africa/Accra")
    FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "*")
    PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:5050")
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", "587"))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "true").lower() == "true"
    MAIL_USE_SSL = os.environ.get("MAIL_USE_SSL", "false").lower() == "true"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", "")
    TOKEN_EXPIRE_HOURS = int(os.environ.get("TOKEN_EXPIRE_HOURS", "72"))
    AUTO_SEED_DEMO = os.environ.get("AUTO_SEED_DEMO", "true").lower() == "true"


class StagingConfig(Config):
    SESSION_COOKIE_SECURE = True
    AUTO_SEED_DEMO = False


class ProductionConfig(Config):
    PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")
    SESSION_COOKIE_SECURE = True
    AUTO_SEED_DEMO = False
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", os.environ.get("REDIS_URL", "memory://"))


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False
    RATELIMIT_ENABLED = False
    AUTO_SEED_DEMO = False


CONFIG_MAP = {
    "development": Config,
    "local": Config,
    "staging": StagingConfig,
    "production": ProductionConfig,
    "testing": TestConfig,
}
