"""Platform-wide signup and regional access policy (superadmin-controlled)."""
from datetime import datetime

from payment_utils import NEPAL_MARKERS
from models import Setting, BetaLead, db

POLICY_WORLDWIDE = "worldwide"
POLICY_NEPAL_ONLY = "nepal_only"
POLICY_MANUAL_ONLY = "manual_only"

VALID_POLICIES = (POLICY_WORLDWIDE, POLICY_NEPAL_ONLY, POLICY_MANUAL_ONLY)


def _get_setting(key, default=None):
    s = Setting.get_setting(key, account_id=None, fallback=True)
    if s and s.value is not None:
        return s.value
    return default


def _set_setting(key, value):
    s = Setting.query.filter_by(key=key, account_id=None).first()
    if s:
        s.value = str(value)
    else:
        db.session.add(Setting(key=key, value=str(value), account_id=None))


def is_nepal_location(country):
    loc = (country or "").strip().lower()
    if not loc:
        return False
    if loc in ("nepal", "np", "npl"):
        return True
    return any(m in loc for m in NEPAL_MARKERS)


def get_access_policy():
    limit_raw = _get_setting("signup_daily_limit", "0") or "0"
    try:
        daily_limit = max(0, int(limit_raw))
    except (TypeError, ValueError):
        daily_limit = 0

    return {
        "access_policy": _get_setting("access_policy", POLICY_WORLDWIDE),
        "signup_open": (_get_setting("signup_open", "true") or "true").lower() != "false",
        "signup_daily_limit": daily_limit,
    }


def update_access_policy(data):
    policy = (data.get("access_policy") or "").strip().lower()
    if policy and policy not in VALID_POLICIES:
        raise ValueError(f"access_policy must be one of: {', '.join(VALID_POLICIES)}")

    if policy:
        _set_setting("access_policy", policy)

    if "signup_open" in data:
        _set_setting("signup_open", "true" if data["signup_open"] else "false")

    if "signup_daily_limit" in data:
        try:
            limit = max(0, int(data["signup_daily_limit"] or 0))
        except (TypeError, ValueError):
            raise ValueError("signup_daily_limit must be a non-negative integer")
        _set_setting("signup_daily_limit", str(limit))

    return get_access_policy()


def _signups_today():
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return BetaLead.query.filter(BetaLead.created_at >= today).count()


def evaluate_signup(country):
    """Return (allowed, requires_manual, message)."""
    policy = get_access_policy()

    if not policy["signup_open"]:
        return False, False, (
            "Beta signups are temporarily closed. "
            "Contact support@dgcpos.net for assistance."
        )

    access = policy["access_policy"]

    if access == POLICY_NEPAL_ONLY and not is_nepal_location(country):
        return False, False, (
            "Beta signups are currently limited to businesses in Nepal. "
            "Contact support@dgcpos.net for international access."
        )

    if access == POLICY_MANUAL_ONLY:
        return True, True, None

    limit = policy["signup_daily_limit"]
    if limit > 0 and _signups_today() >= limit:
        return False, False, (
            "Daily signup limit reached. Try again tomorrow or contact support@dgcpos.net."
        )

    return True, False, None