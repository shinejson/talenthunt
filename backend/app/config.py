import os
from datetime import timedelta


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-talent-hunt-secret-change-me")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "sqlite:///" + os.path.join(os.path.dirname(os.path.dirname(__file__)), "talent_hunt.db"),
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024
    UPLOAD_FOLDER = os.environ.get(
        "UPLOAD_FOLDER",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads"),
    )
    ALLOWED_MEDIA_EXTENSIONS = {"mp4", "mov", "webm", "mp3", "wav", "jpg", "jpeg", "png", "gif"}
    MAX_UPLOAD_BYTES = 40 * 1024 * 1024
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")
    PAYMENT_PROVIDER = os.environ.get("PAYMENT_PROVIDER", "mock")
    PAYMENT_WEBHOOK_SECRET = os.environ.get("PAYMENT_WEBHOOK_SECRET", "mock-webhook-secret")
    PLATFORM_NAME = os.environ.get("PLATFORM_NAME", "StageLight")
    PLATFORM_CURRENCY = "GHS"
    DEFAULT_TIMEZONE = "Africa/Accra"
    FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
    TOKEN_EXPIRE_HOURS = 72


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False
