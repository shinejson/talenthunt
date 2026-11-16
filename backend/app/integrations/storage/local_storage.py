import mimetypes
import os
import secrets
from flask import current_app
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models.application import MediaAsset
from app.schemas import DomainError

FORBIDDEN_SIGNATURES = (
    b"MZ",          # Windows PE executable
    b"\x7fELF",     # Linux ELF binary
    b"#!/",         # Shell script
    b"<?php",       # PHP script
)


def save_uploaded_media(file_obj: FileStorage, owner_user_id: str) -> MediaAsset:
    if not file_obj or not file_obj.filename:
        raise DomainError("NO_FILE", "Please select a media file to upload.", 400)

    original_name = secure_filename(file_obj.filename)
    if "." not in original_name:
        raise DomainError("INVALID_FILE_TYPE", "Uploaded file must have a valid extension.", 422)

    ext = original_name.rsplit(".", 1)[1].lower()
    allowed_exts = current_app.config.get("ALLOWED_MEDIA_EXTENSIONS", set())
    if ext not in allowed_exts:
        raise DomainError(
            "INVALID_FILE_TYPE",
            f"File type '.{ext}' is not permitted. Allowed types: {', '.join(sorted(allowed_exts))}.",
            422,
        )

    raw_bytes = file_obj.read()
    size_bytes = len(raw_bytes)
    max_bytes = current_app.config.get("MAX_UPLOAD_BYTES", 40 * 1024 * 1024)
    if size_bytes == 0:
        raise DomainError("EMPTY_FILE", "Uploaded file cannot be empty.", 422)
    if size_bytes > max_bytes:
        raise DomainError(
            "FILE_TOO_LARGE",
            f"File exceeds the maximum allowed size of {max_bytes // (1024 * 1024)} MB.",
            422,
        )

    # Basic malware / executable header inspection
    header = raw_bytes[:16]
    scan_status = "CLEAN"
    if any(header.startswith(sig) for sig in FORBIDDEN_SIGNATURES) or b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE" in raw_bytes[:512]:
        raise DomainError("MALWARE_REJECTED", "File failed security inspection and was rejected.", 422)

    upload_dir = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_dir, exist_ok=True)
    storage_key = f"{secrets.token_hex(16)}.{ext}"
    dest_path = os.path.join(upload_dir, storage_key)
    with open(dest_path, "wb") as fp:
        fp.write(raw_bytes)

    guessed_mime, _ = mimetypes.guess_type(original_name)
    mime_type = file_obj.mimetype or guessed_mime or "application/octet-stream"

    asset = MediaAsset(
        owner_user_id=owner_user_id,
        original_filename=original_name,
        storage_key=storage_key,
        mime_type=mime_type,
        size_bytes=size_bytes,
        scan_status=scan_status,
    )
    db.session.add(asset)
    db.session.flush()
    return asset
