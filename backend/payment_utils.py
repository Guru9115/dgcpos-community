"""Community Edition payment helpers — cash/card-record only (no live gateways)."""
import json
import random
import string
from datetime import datetime

NEPAL_MARKERS = (
    "nepal", "np", "kathmandu", "pokhara", "lalitpur", "bhaktapur",
    "biratnagar", "birgunj", "dharan", "butwal", "nepalgunj", "hetauda",
)

GATEWAYS_DISABLED_MESSAGE = (
    "Online payment gateways require DGCPOS Enterprise. "
    "Community Edition supports Cash, Free / Complimentary, and Card (record only)."
)

SAFE_PAYMENT_METHODS = [
    {"id": "cash", "label": "Cash", "gateway": False, "configured": True, "icon": "banknote"},
    {"id": "free", "label": "Free / Complimentary", "gateway": False, "configured": True, "icon": "banknote"},
    {
        "id": "card",
        "label": "Card (record only)",
        "gateway": False,
        "terminal": True,
        "configured": True,
        "icon": "card",
        "note": "No live gateway — records the sale only",
    },
]


def gen_payment_reference():
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    rand = "".join(random.choices(string.digits, k=4))
    return f"PAY{ts}{rand}"


def detect_region(account=None, settings=None):
    settings = settings or {}
    forced = (settings.get("payment_region") or "").strip().lower()
    if forced in ("nepal", "global"):
        return forced
    if account:
        loc = (account.business_location or "").lower()
        if any(m in loc for m in NEPAL_MARKERS):
            return "nepal"
    currency = (settings.get("currency_code") or settings.get("currency") or "NPR").upper()
    if currency in ("NPR", "RS.", "RS", "रू"):
        return "nepal"
    return "global"


def gateways_enabled(app_config=None, settings=None, account=None, user=None):
    return False


def international_payments_enabled(account=None, user=None):
    return False


def safe_payment_methods():
    return [dict(m) for m in SAFE_PAYMENT_METHODS]


def gateway_capabilities(app_config=None, settings=None):
    return {
        "esewa": False,
        "khalti": False,
        "fonepay": False,
        "stripe": False,
        "paypal": False,
        "octopus": False,
    }


def methods_for_region(region, caps, app_config=None, settings=None, account=None, user=None):
    return safe_payment_methods()


def meta_dump(data):
    return json.dumps(data or {})


def meta_load(raw):
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}