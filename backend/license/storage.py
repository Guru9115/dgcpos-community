"""Persist activated license in store settings."""
from __future__ import annotations

import json
from typing import Any, Optional

SETTING_KEY = "enterprise_license"


def _get_setting_model():
    from models import Setting

    return Setting


def load_license_record(account_id: Optional[int] = None) -> Optional[dict[str, Any]]:
    try:
        from flask import has_app_context

        if not has_app_context():
            return None
    except ImportError:
        return None

    Setting = _get_setting_model()
    row = Setting.query.filter_by(key=SETTING_KEY, account_id=account_id).first()
    if not row or not row.value:
        return None
    try:
        data = json.loads(row.value)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


def save_license_record(data: dict[str, Any], account_id: Optional[int] = None) -> None:
    from models import db

    Setting = _get_setting_model()
    raw = json.dumps(data, separators=(",", ":"), sort_keys=True)
    row = Setting.query.filter_by(key=SETTING_KEY, account_id=account_id).first()
    if row:
        row.value = raw
    else:
        db.session.add(Setting(key=SETTING_KEY, value=raw, account_id=account_id))
    db.session.commit()


def clear_license_record(account_id: Optional[int] = None) -> None:
    from models import db

    Setting = _get_setting_model()
    row = Setting.query.filter_by(key=SETTING_KEY, account_id=account_id).first()
    if row:
        db.session.delete(row)
        db.session.commit()