"""Object storage — Cloudflare R2 (S3-compatible) with local disk fallback."""
from __future__ import annotations

import mimetypes
import os
from typing import Optional

from flask import Response, send_from_directory, current_app
from werkzeug.utils import secure_filename

_s3_client = None

SETTINGS_KEYS = (
    "R2_ENABLED",
    "R2_BUCKET",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_PUBLIC_BASE_URL",
    "R2_PREFIX",
    "BACKUP_S3_ENDPOINT",
    "BACKUP_AWS_ACCESS_KEY_ID",
    "BACKUP_AWS_SECRET_ACCESS_KEY",
    "CDN_S3_BUCKET",
)


def _cfg(name: str, default: str = "") -> str:
    if current_app:
        val = current_app.config.get(name)
        if val is not None:
            return str(val).strip()
    return (os.environ.get(name, default) or "").strip()


def r2_enabled() -> bool:
    flag = _cfg("R2_ENABLED", "true").lower()
    if flag in ("0", "false", "no"):
        return False
    return bool(_bucket() and _endpoint() and _access_key() and _secret_key())


def _bucket() -> str:
    return _cfg("R2_BUCKET") or _cfg("CDN_S3_BUCKET") or "dgcpos-cdn-prod"


def _endpoint() -> str:
    return _cfg("R2_ENDPOINT") or _cfg("BACKUP_S3_ENDPOINT")


def _access_key() -> str:
    return _cfg("R2_ACCESS_KEY_ID") or _cfg("BACKUP_AWS_ACCESS_KEY_ID")


def _secret_key() -> str:
    return _cfg("R2_SECRET_ACCESS_KEY") or _cfg("BACKUP_AWS_SECRET_ACCESS_KEY")


def _prefix() -> str:
    p = _cfg("R2_PREFIX", "uploads")
    return p.strip("/")


def _object_key(relative_key: str) -> str:
    rel = relative_key.lstrip("/")
    prefix = _prefix()
    return f"{prefix}/{rel}" if prefix else rel


def _s3():
    global _s3_client
    if _s3_client is not None:
        return _s3_client
    if not r2_enabled():
        return None
    try:
        import boto3
        from botocore.config import Config

        _s3_client = boto3.client(
            "s3",
            endpoint_url=_endpoint(),
            aws_access_key_id=_access_key(),
            aws_secret_access_key=_secret_key(),
            region_name=_cfg("R2_REGION") or _cfg("BACKUP_AWS_REGION") or "auto",
            config=Config(signature_version="s3v4"),
        )
        return _s3_client
    except Exception:
        return None


def save_bytes(relative_key: str, data: bytes, content_type: Optional[str] = None) -> None:
    """Persist bytes to R2 when configured, always mirror to local uploads/."""
    local_path = local_path_for(relative_key)
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    with open(local_path, "wb") as fh:
        fh.write(data)

    client = _s3()
    if not client:
        return
    ctype = content_type or mimetypes.guess_type(local_path)[0] or "application/octet-stream"
    try:
        client.put_object(
            Bucket=_bucket(),
            Key=_object_key(relative_key),
            Body=data,
            ContentType=ctype,
        )
    except Exception as exc:
        current_app.logger.warning("R2 upload failed for %s: %s", relative_key, exc)


def get_bytes(relative_key: str) -> Optional[bytes]:
    client = _s3()
    if client:
        try:
            obj = client.get_object(Bucket=_bucket(), Key=_object_key(relative_key))
            return obj["Body"].read()
        except Exception:
            pass

    local_path = local_path_for(relative_key)
    if os.path.isfile(local_path):
        with open(local_path, "rb") as fh:
            return fh.read()
    return None


def local_path_for(relative_key: str) -> str:
    base = current_app.config.get("UPLOAD_FOLDER") if current_app else os.path.join(
        os.path.dirname(__file__), "uploads"
    )
    return os.path.join(base, relative_key.replace("/", os.sep))


def serve_upload(relative_key: str, *, directory: str, filename: str) -> Optional[Response]:
    """Serve file from R2 or local disk."""
    safe = secure_filename(filename)
    if not safe:
        return None

    data = get_bytes(relative_key)
    if data is None:
        if os.path.isfile(os.path.join(directory, safe)):
            return send_from_directory(directory, safe, as_attachment=False)
        return None

    ctype = mimetypes.guess_type(safe)[0] or "application/octet-stream"
    return Response(data, mimetype=ctype)


def public_url(relative_key: str) -> Optional[str]:
    base = _cfg("R2_PUBLIC_BASE_URL").rstrip("/")
    if not base:
        return None
    return f"{base}/{_object_key(relative_key)}"