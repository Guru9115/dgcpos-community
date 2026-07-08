"""Runtime license state — unlock Enterprise on self-hosted Community builds."""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Optional

from license.keys import verify_license_key
from license.storage import clear_license_record, load_license_record, save_license_record

_CACHE: dict[str, Any] = {"checked_at": None, "status": None}


def _cache_ttl_seconds() -> int:
    try:
        return max(30, int(os.environ.get("DGCPOS_LICENSE_CACHE_SECONDS", "300")))
    except ValueError:
        return 300


def _read_env_license_key() -> Optional[str]:
    key = (os.environ.get("DGCPOS_LICENSE_KEY") or "").strip()
    return key or None


def _has_app_context() -> bool:
    try:
        from flask import has_app_context

        return has_app_context()
    except ImportError:
        return False


def _primary_account_id() -> Optional[int]:
    if not _has_app_context():
        return None
    try:
        from models import Account

        account = Account.query.order_by(Account.id.asc()).first()
        return account.id if account else None
    except Exception:
        return None


def _evaluate_key(key: str) -> dict[str, Any]:
    info = verify_license_key(key)
    return {
        **info,
        "activated_at": datetime.utcnow().isoformat(),
        "source": "env" if key == _read_env_license_key() else "settings",
    }


def get_active_license(*, force_refresh: bool = False) -> Optional[dict[str, Any]]:
    """Return validated license metadata or None."""
    now = datetime.utcnow()
    cached_at = _CACHE.get("checked_at")
    if (
        not force_refresh
        and cached_at
        and (now - cached_at).total_seconds() < _cache_ttl_seconds()
    ):
        return _CACHE.get("status")

    status: Optional[dict[str, Any]] = None

    env_key = _read_env_license_key()
    if env_key:
        try:
            status = _evaluate_key(env_key)
            status["source"] = "env"
        except ValueError:
            status = None

    if status is None:
        record = load_license_record(_primary_account_id())
        stored_key = (record or {}).get("key") or ""
        if stored_key:
            try:
                status = _evaluate_key(stored_key)
                status["source"] = "settings"
                status["activated_at"] = record.get("activated_at")
            except ValueError:
                status = {"valid": False, "error": "Stored license is invalid or expired"}

    _CACHE["checked_at"] = now
    _CACHE["status"] = status
    return status


def license_unlocks_enterprise() -> bool:
    lic = get_active_license()
    return bool(lic and lic.get("valid"))


def activate_license(key: str, account_id: Optional[int] = None) -> dict[str, Any]:
    info = verify_license_key(key)
    target_account = account_id if account_id is not None else _primary_account_id()
    record = {
        "key": key.strip(),
        "activated_at": datetime.utcnow().isoformat(),
        **{k: info[k] for k in ("customer_id", "expires_at", "max_staff", "features", "key_fingerprint")},
    }
    save_license_record(record, account_id=target_account)
    _CACHE["checked_at"] = None
    return get_public_license_status(force_refresh=True)


def deactivate_license(account_id: Optional[int] = None) -> None:
    if _read_env_license_key():
        raise ValueError("Cannot deactivate a license set via DGCPOS_LICENSE_KEY environment variable")
    target_account = account_id if account_id is not None else _primary_account_id()
    clear_license_record(account_id=target_account)
    _CACHE["checked_at"] = None
    _CACHE["status"] = None


def get_public_license_status(*, force_refresh: bool = False) -> dict[str, Any]:
    lic = get_active_license(force_refresh=force_refresh)
    if not lic:
        return {
            "licensed": False,
            "edition": "community",
            "label": "Community",
        }
    if not lic.get("valid", True):
        return {
            "licensed": False,
            "edition": "community",
            "label": "Community",
            "error": lic.get("error", "Invalid license"),
        }
    return {
        "licensed": True,
        "edition": "enterprise",
        "label": "Enterprise (Licensed)",
        "customer_id": lic.get("customer_id"),
        "expires_at": lic.get("expires_at"),
        "max_staff": lic.get("max_staff"),
        "features": lic.get("features") or [],
        "key_fingerprint": lic.get("key_fingerprint"),
        "source": lic.get("source"),
        "activated_at": lic.get("activated_at"),
    }


def clear_license_cache() -> None:
    _CACHE["checked_at"] = None
    _CACHE["status"] = None