"""Store backup — SQLite, PostgreSQL account export, download & cloud upload."""
from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime

from flask import current_app
from sqlalchemy import inspect

ICLOUD_BACKUP_DIR = os.path.expanduser(
    "~/Library/Mobile Documents/com~apple~CloudDocs/DG RetailOS Backups"
)

# Models exported per tenant (account_id column required unless noted)
EXPORT_MODELS = [
    "Product", "Customer", "Supplier", "Sale", "SaleItem", "Setting",
    "Payable", "MarketplacePost", "HotelProperty", "HotelRoom", "RoomBooking",
    "MessengerThread", "SupportThread",
]


def _db_uri() -> str:
    return current_app.config.get("SQLALCHEMY_DATABASE_URI", "")


def _is_sqlite() -> bool:
    return _db_uri().startswith("sqlite")


def backup_filename(ext: str = "dgcbackup") -> str:
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return f"DGRetailOS_backup_{ts}.{ext}"


def _export_account_json_zip(account_id: int) -> tuple[str, bytes]:
    """Tenant-safe backup for cloud/multi-tenant Postgres."""
    from models import db, Account

    account = Account.query.get(account_id)
    if not account:
        raise ValueError("Account not found")

    payload = {
        "format": "dgc_account_backup_v1",
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "account_id": account_id,
        "account_name": account.name,
        "business_type": account.business_type,
        "tables": {},
    }

    import models as models_mod

    for name in EXPORT_MODELS:
        cls = getattr(models_mod, name, None)
        if not cls:
            continue
        mapper = inspect(cls)
        if "account_id" not in mapper.columns:
            continue
        rows = cls.query.filter_by(account_id=account_id).all()
        payload["tables"][name] = [
            {c.key: _serialize(getattr(r, c.key)) for c in mapper.columns}
            for r in rows
        ]

    # Account-scoped settings already in Setting rows; include account meta
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(payload, indent=2))
    buf.seek(0)
    return backup_filename("dgcbackup"), buf.getvalue()


def _serialize(val):
    if val is None:
        return None
    if isinstance(val, (datetime,)):
        return val.isoformat()
    if hasattr(val, "isoformat"):
        try:
            return val.isoformat()
        except Exception:
            pass
    try:
        json.dumps(val)
        return val
    except (TypeError, ValueError):
        return str(val)


def create_backup_file(account_id: int) -> tuple[str, str, bytes]:
    """
    Returns (filename, mime_type, content_bytes).
    SQLite dev: full DB copy. Postgres/production: per-account zip export.
    """
    if _is_sqlite():
        db_path = _db_uri().replace("sqlite:///", "")
        if not os.path.isfile(db_path):
            raise FileNotFoundError("Database file not found")
        name = backup_filename("db")
        with open(db_path, "rb") as f:
            return name, "application/octet-stream", f.read()

    return _export_account_json_zip(account_id)


def save_backup_local(account_id: int) -> dict:
    """Save backup to server local path (+ Mac iCloud folder if present)."""
    name, mime, data = create_backup_file(account_id)
    saved = []

    tmp_dir = os.path.join(tempfile.gettempdir(), "dgc_backups")
    os.makedirs(tmp_dir, exist_ok=True)
    local_path = os.path.join(tmp_dir, name)
    with open(local_path, "wb") as f:
        f.write(data)
    saved.append("Server temp")

    if os.path.isdir(ICLOUD_BACKUP_DIR):
        icloud_path = os.path.join(ICLOUD_BACKUP_DIR, name)
        with open(icloud_path, "wb") as f:
            f.write(data)
        saved.append("iCloud Drive")

    if _is_sqlite():
        db_path = _db_uri().replace("sqlite:///", "")
        sidecar = os.path.join(os.path.dirname(db_path), name)
        with open(sidecar, "wb") as f:
            f.write(data)
        saved.append("Local DB folder")

    return {
        "file": name,
        "mime": mime,
        "size": len(data),
        "locations": saved,
        "icloud_available": os.path.isdir(ICLOUD_BACKUP_DIR),
        "path": local_path,
    }


def pg_dump_available() -> bool:
    if _is_sqlite():
        return False
    try:
        subprocess.run(["pg_dump", "--version"], capture_output=True, check=True, timeout=5)
        return True
    except Exception:
        return False