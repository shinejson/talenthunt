import base64
import hashlib
import hmac
import io
import re
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import qrcode
from flask import current_app, request
from werkzeug.security import check_password_hash, generate_password_hash

ALPHABET = string.ascii_letters + string.digits
UPPER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_uuid() -> str:
    return str(uuid.uuid4())


def hash_password(password: str) -> str:
    return generate_password_hash(password, method="scrypt")


def verify_password(password_hash: str, password: str) -> bool:
    if not password_hash or not password:
        return False
    return check_password_hash(password_hash, password)


def generate_opaque_slug(length: int = 11) -> str:
    """Generate a non-sequential, cryptographically random voting/nominee slug."""
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def generate_reference(prefix: str, year: int | None = None, length: int = 8) -> str:
    yr = year or datetime.now(timezone.utc).year
    token = "".join(secrets.choice(UPPER_ALPHABET) for _ in range(length))
    return f"{prefix}-{yr}-{token}"


def generate_verification_code(length: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(length))


def slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").strip().lower()).strip("-")
    return cleaned or f"item-{secrets.token_hex(3)}"


def hash_ip(ip_addr: str | None) -> str | None:
    if not ip_addr:
        return None
    salt = current_app.config.get("SECRET_KEY", "salt")
    return hashlib.sha256(f"{salt}:{ip_addr}".encode("utf-8")).hexdigest()[:32]


def get_client_ip_hash() -> str | None:
    forwarded = request.headers.get("X-Forwarded-For", "")
    ip = forwarded.split(",")[0].strip() if forwarded else request.remote_addr
    return hash_ip(ip)


def create_access_token(user_id: str, token_version: int = 1, session_id: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    exp_hours = current_app.config.get("TOKEN_EXPIRE_HOURS", 72)
    payload = {
        "sub": user_id,
        "ver": token_version,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=exp_hours)).timestamp()),
    }
    if session_id:
        payload["sid"] = session_id
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def create_2fa_temp_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "purpose": "2fa_pending",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def decode_2fa_temp_token(token: str) -> str | None:
    try:
        data = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
        if data.get("purpose") == "2fa_pending":
            return data.get("sub")
    except jwt.PyJWTError:
        pass
    return None


def parse_device_summary(ua_string: str | None) -> str:
    if not ua_string:
        return "Web Browser"
    ua = ua_string.lower()

    # Detect OS / Device
    device = "Unknown Device"
    if "iphone" in ua:
        device = "iPhone"
    elif "ipad" in ua:
        device = "iPad"
    elif "android" in ua:
        device = "Android"
    elif "windows" in ua:
        device = "Windows"
    elif "macintosh" in ua or "mac os" in ua:
        device = "Mac"
    elif "linux" in ua:
        device = "Linux"

    # Detect Browser
    browser = "Browser"
    if "edg" in ua:
        browser = "Edge"
    elif "chrome" in ua and "chromium" not in ua:
        browser = "Chrome"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "safari" in ua and "chrome" not in ua:
        browser = "Safari"
    elif "opera" in ua or "opr" in ua:
        browser = "Opera"

    return f"{browser} on {device}"


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def compute_hmac_sha256(secret: str, raw_body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


def verify_hmac_sha256(secret: str, raw_body: bytes, signature: str | None) -> bool:
    if not signature or not secret:
        return False
    expected = compute_hmac_sha256(secret, raw_body)
    return hmac.compare_digest(expected, signature.strip())


def generate_qr_png_bytes(url: str) -> bytes:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#111827", back_color="#ffffff")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_qr_data_uri(url: str) -> str:
    png_bytes = generate_qr_png_bytes(url)
    encoded = base64.b64encode(png_bytes).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def mask_contact(value: str | None) -> str | None:
    if not value:
        return None
    val = value.strip()
    if "@" in val:
        local, domain = val.split("@", 1)
        masked_local = (local[:2] + "***") if len(local) > 2 else "***"
        return f"{masked_local}@{domain}"
    if len(val) > 4:
        return f"{val[:3]}***{val[-2:]}"
    return "***"
