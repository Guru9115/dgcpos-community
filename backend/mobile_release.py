"""Published iOS/Android native app release metadata for in-app update prompts."""
import json
from datetime import datetime, timezone

from models import Setting, db

SETTING_KEY = "mobile_release_ios"
DEFAULT_DOWNLOAD_URL = "https://dgcpos.com/install"


def _default_release():
    web_version = "1.0.0"
    try:
        from version_info import VERSION_INFO
        web_version = VERSION_INFO.get("version", web_version)
    except ImportError:
        pass
    return {
        "ios_version": "1.1",
        "ios_build": "1",
        "min_ios_version": "1.0",
        "download_url": DEFAULT_DOWNLOAD_URL,
        "release_notes": "Bug fixes and performance improvements.",
        "force_update": False,
        "notify_users": True,
        "published_at": None,
        "published_by": None,
        "web_version": web_version,
    }


def get_mobile_release():
    row = Setting.query.filter_by(key=SETTING_KEY, account_id=None).first()
    if not row or not row.value:
        return _default_release()
    try:
        data = json.loads(row.value)
        base = _default_release()
        base.update(data)
        return base
    except (json.JSONDecodeError, TypeError):
        return _default_release()


def set_mobile_release(data: dict, user=None):
    current = get_mobile_release()
    for key in (
        "ios_version", "ios_build", "min_ios_version", "download_url",
        "release_notes", "force_update", "notify_users",
    ):
        if key in data:
            current[key] = data[key]
    current["published_at"] = datetime.now(timezone.utc).isoformat()
    current["published_by"] = getattr(user, "username", None) if user else None
    payload = json.dumps(current)
    row = Setting.query.filter_by(key=SETTING_KEY, account_id=None).first()
    if row:
        row.value = payload
    else:
        db.session.add(Setting(key=SETTING_KEY, value=payload, account_id=None))
    return current