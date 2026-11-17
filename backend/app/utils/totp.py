import base64
import hashlib
import hmac
import secrets
import struct
import time
import urllib.parse


def generate_totp_secret(length: int = 20) -> str:
    """Generate a random base32-encoded secret for TOTP (160 bits)."""
    random_bytes = secrets.token_bytes(length)
    return base64.b32encode(random_bytes).decode("ascii").replace("=", "")


def generate_totp_code(secret_b32: str, time_step: int = 30, for_time: float | None = None) -> str:
    """Generate 6-digit TOTP code according to RFC 6238."""
    now = time.time() if for_time is None else for_time
    counter = int(now // time_step)

    secret_cleaned = secret_b32.strip().replace(" ", "").upper()
    padding = (8 - len(secret_cleaned) % 8) % 8
    key = base64.b32decode(secret_cleaned + "=" * padding, casefold=True)

    msg = struct.pack(">Q", counter)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    offset = h[-1] & 0x0F
    code_int = struct.unpack(">I", h[offset : offset + 4])[0] & 0x7FFFFFFF
    code = code_int % 1000000
    return f"{code:06d}"


def verify_totp_code(secret_b32: str, code: str, window: int = 1, time_step: int = 30) -> bool:
    """Verify code with time drift window (-window, 0, +window)."""
    if not code:
        return False
    code_str = str(code).strip().replace(" ", "").replace("-", "")
    if len(code_str) != 6 or not code_str.isdigit():
        return False

    now = time.time()
    for drift in range(-window, window + 1):
        test_time = now + drift * time_step
        if generate_totp_code(secret_b32, time_step, for_time=test_time) == code_str:
            return True
    return False


def get_totp_uri(secret_b32: str, account_name: str, issuer: str = "StageLight") -> str:
    """Generate otpauth:// URI compatible with Google Authenticator, Authy, etc."""
    label = urllib.parse.quote(f"{issuer}:{account_name}")
    issuer_q = urllib.parse.quote(issuer)
    sec = secret_b32.strip().replace(" ", "").upper()
    return f"otpauth://totp/{label}?secret={sec}&issuer={issuer_q}&algorithm=SHA1&digits=6&period=30"


def generate_backup_codes(count: int = 8) -> list[str]:
    """Generate a list of human-friendly recovery backup codes (e.g. '8492-1049')."""
    codes = []
    for _ in range(count):
        part1 = "".join(secrets.choice("23456789ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(4))
        part2 = "".join(secrets.choice("23456789ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(4))
        codes.append(f"{part1}-{part2}")
    return codes


def hash_backup_code(code: str) -> str:
    """Compute SHA-256 hash of normalized backup code."""
    cleaned = code.strip().replace(" ", "").replace("-", "").upper()
    return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()


def verify_and_consume_backup_code(code: str, stored_hashes: list[str] | None) -> tuple[bool, list[str]]:
    """Check if code matches an unused backup code hash. If so, return (True, remaining_hashes)."""
    if not code or not stored_hashes:
        return False, stored_hashes or []

    target_hash = hash_backup_code(code)
    for i, h in enumerate(stored_hashes):
        if hmac.compare_digest(h, target_hash):
            remaining = list(stored_hashes)
            remaining.pop(i)
            return True, remaining
    return False, stored_hashes
