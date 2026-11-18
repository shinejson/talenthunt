import mimetypes
import os
import secrets
from pathlib import Path

from flask import current_app
from PIL import Image
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models.application import MediaAsset
from app.schemas import DomainError

FORBIDDEN_SIGNATURES = (b"MZ", b"\x7fELF", b"#!/", b"<?php")
PROFILE_IMAGE_FORMATS = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "gif": "GIF", "webp": "WEBP"}
VIDEO_TYPES = {"mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm"}
MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024


def _inspect_upload(file_obj: FileStorage, allowed_extensions, max_bytes: int):
    if not file_obj or not file_obj.filename:
        raise DomainError("NO_FILE", "Please select a file to upload.", 400)
    name = secure_filename(file_obj.filename)
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in allowed_extensions or len(name) > 255:
        raise DomainError("INVALID_FILE_TYPE", f"Use a file with a short name in one of these formats: {', '.join(sorted(allowed_extensions))}.", 422)

    stream = file_obj.stream
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    if not size:
        raise DomainError("EMPTY_FILE", "Uploaded file cannot be empty.", 422)
    if size > max_bytes:
        raise DomainError("FILE_TOO_LARGE", f"File exceeds the maximum allowed size of {max_bytes // (1024 * 1024)} MB.", 422)
    stream.seek(0)
    header = stream.read(512)
    stream.seek(0)
    if header.startswith(FORBIDDEN_SIGNATURES) or b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE" in header:
        raise DomainError("MALWARE_REJECTED", "File failed security inspection and was rejected.", 422)
    return name, ext, size, header


def remove_stored_media(asset: MediaAsset):
    Path(current_app.config["UPLOAD_FOLDER"], asset.storage_key).unlink(missing_ok=True)


def _store(file_obj, owner_user_id, name, ext, size, mime_type, *, private=False):
    asset = MediaAsset(
        owner_user_id=owner_user_id,
        original_filename=name,
        storage_key=f"{secrets.token_hex(16)}.{ext}",
        mime_type=mime_type,
        size_bytes=size,
        is_private=private,
        scan_status="CLEAN",
    )
    file_obj.stream.seek(0)
    try:
        file_obj.save(Path(current_app.config["UPLOAD_FOLDER"], asset.storage_key))
        db.session.add(asset)
        db.session.flush()
    except Exception:
        remove_stored_media(asset)
        raise
    return asset


def save_uploaded_profile_image(file_obj: FileStorage, owner_user_id: str | None, *, private=False) -> MediaAsset:
    name, ext, size, _ = _inspect_upload(file_obj, PROFILE_IMAGE_FORMATS, MAX_PROFILE_IMAGE_BYTES)
    try:
        with Image.open(file_obj.stream) as img:
            if img.format != PROFILE_IMAGE_FORMATS[ext]:
                raise ValueError("Image format does not match the extension")
            mime_type = Image.MIME[img.format]
            img.verify()
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise DomainError("INVALID_IMAGE", "Uploaded file is not a valid image of the selected format.", 422) from exc
    return _store(file_obj, owner_user_id, name, ext, size, mime_type, private=private)


def save_application_video(file_obj: FileStorage) -> MediaAsset:
    name, ext, size, header = _inspect_upload(file_obj, VIDEO_TYPES, current_app.config["MAX_UPLOAD_BYTES"])
    if ext == "webm":
        valid = header.startswith(b"\x1a\x45\xdf\xa3") and b"webm" in header
    else:
        valid = len(header) >= 12 and header[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free")
    if not valid:
        raise DomainError("INVALID_VIDEO", "Upload a valid MP4, MOV or WebM video.", 422)
    return _store(file_obj, None, name, ext, size, VIDEO_TYPES[ext], private=True)


def save_uploaded_media(file_obj: FileStorage, owner_user_id: str) -> MediaAsset:
    name, ext, size, _ = _inspect_upload(
        file_obj, current_app.config["ALLOWED_MEDIA_EXTENSIONS"], current_app.config["MAX_UPLOAD_BYTES"]
    )
    mime_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
    return _store(file_obj, owner_user_id, name, ext, size, mime_type)
