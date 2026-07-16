"""Superadmin-controlled platform module toggles (payments, features)."""
from datetime import datetime

from cache import cache_delete, cache_get, cache_set
from edition import edition_public_payload, module_allowed_in_edition
from models import Setting, db

_SETTINGS_CACHE_KEY = "platform:settings"
_PUBLIC_STATUS_CACHE_KEY = "platform:public_status"
_CACHE_TTL_SEC = 60


def _invalidate_settings_cache():
    cache_delete(_SETTINGS_CACHE_KEY, _PUBLIC_STATUS_CACHE_KEY)


def _load_platform_settings() -> dict:
    """Batch-load global (account_id=NULL) platform settings — one DB round-trip."""
    cached = cache_get(_SETTINGS_CACHE_KEY)
    if cached is not None:
        return cached

    keys = [defn["setting"] for defn in MODULE_DEFS.values()]
    keys += [
        "platform_maintenance_message",
        "platform_maintenance_drafted_at",
        "platform_maintenance_drafted_by",
        "platform_maintenance_drafted_by_name",
    ]
    rows = Setting.query.filter(
        Setting.account_id.is_(None),
        Setting.key.in_(keys),
    ).all()
    values = {row.key: row.value for row in rows}
    cache_set(_SETTINGS_CACHE_KEY, values, _CACHE_TTL_SEC)
    return values

DEFAULT_MAINTENANCE_MESSAGE = "DGC POS is temporarily offline for maintenance."

MODULE_DEFS = {
    "site_app": {
        "label": "RetailOS App (app.dgcpos.com)",
        "description": "Main POS application — when off, stores see maintenance (admin stays up)",
        "setting": "site_app_enabled",
        "default": True,
        "group": "sites",
    },
    "site_marketing": {
        "label": "Marketing website (dgcpos.com)",
        "description": "Public marketing site, legal pages, and signup funnel",
        "setting": "site_marketing_enabled",
        "default": True,
        "group": "sites",
    },
    "site_bazaar": {
        "label": "Public Marketplace server",
        "description": "Bazaar storefront, guest checkout, and marketplace API",
        "setting": "site_bazaar_enabled",
        "default": True,
        "group": "sites",
    },
    "bazaar_cod": {
        "label": "Bazaar — Cash on Delivery",
        "description": "Guest & buyer checkout with pay-on-delivery",
        "setting": "bazaar_cod_enabled",
        "default": True,
        "group": "payments",
    },
    "bazaar_online": {
        "label": "Bazaar — Online Pay (eSewa)",
        "description": "Live eSewa redirect on public bazaar checkout",
        "setting": "bazaar_online_enabled",
        "default": False,
        "group": "payments",
    },
    "pos_online": {
        "label": "POS — Online payment gateways",
        "description": "eSewa, Khalti, QR, Fonepay on in-store POS (Nepal online)",
        "setting": "payment_gateways_enabled",
        "default": False,
        "group": "payments",
    },
    "international_payments": {
        "label": "International payments (Stripe / PayPal)",
        "description": "Stripe, PayPal, Octopus for global-region merchants — superadmin per-store grant",
        "setting": "module_international_payments_enabled",
        "default": False,
        "group": "payments",
    },
    "bazaar_marketplace": {
        "label": "DGC Bazaar marketplace",
        "description": "Public product listings & in-app bazaar",
        "setting": "module_bazaar_enabled",
        "default": True,
        "group": "features",
    },
    "guest_checkout": {
        "label": "Guest checkout (no login)",
        "description": "Public bazaar cart without DGC POS account",
        "setting": "module_guest_checkout_enabled",
        "default": True,
        "group": "features",
    },
    "hospitality": {
        "label": "Hotel / Hospitality",
        "description": "Rooms, bookings, hotel dashboard",
        "setting": "module_hospitality_enabled",
        "default": True,
        "group": "features",
    },
    "payables": {
        "label": "Payables",
        "description": "Vendor bills & payment tracking",
        "setting": "module_payables_enabled",
        "default": True,
        "group": "features",
    },
    "bazaar_ads": {
        "label": "Bazaar advertising",
        "description": "Sponsored slots on marketplace",
        "setting": "module_bazaar_ads_enabled",
        "default": True,
        "group": "features",
    },
}


def _get_setting(key, default=None):
    values = _load_platform_settings()
    if key in values and values[key] is not None:
        return values[key]
    return default


def _set_setting(key, value):
    s = Setting.query.filter_by(key=key, account_id=None).first()
    if s:
        s.value = str(value)
    else:
        db.session.add(Setting(key=key, value=str(value), account_id=None))
    _invalidate_settings_cache()


def _as_bool(val, default=True):
    if val is None:
        return default
    return str(val).strip().lower() in ("true", "1", "yes", "on")


def module_enabled(key: str) -> bool:
    defn = MODULE_DEFS.get(key)
    if not defn:
        return False
    if not module_allowed_in_edition(key):
        return False
    return _as_bool(_get_setting(defn["setting"], "true" if defn["default"] else "false"), defn["default"])


def get_platform_modules():
    out = {}
    for key, defn in MODULE_DEFS.items():
        enabled = module_enabled(key)
        out[key] = {
            "key": key,
            "label": defn["label"],
            "description": defn["description"],
            "group": defn["group"],
            "enabled": enabled,
        }
    return out


def get_platform_modules_flat():
    return {key: module_enabled(key) for key in MODULE_DEFS}


def update_platform_modules(data: dict):
    for key in MODULE_DEFS:
        if key not in data:
            continue
        enabled = bool(data[key])
        _set_setting(MODULE_DEFS[key]["setting"], "true" if enabled else "false")
    return get_platform_modules()


def set_maintenance_draft(message: str, user) -> dict:
    """Persist maintenance copy — draft timestamp/author set by superadmin only."""
    if not user or getattr(user, "role", None) != "superadmin":
        raise PermissionError("Only superadmin may set the maintenance draft")
    msg = (message or "").strip() or DEFAULT_MAINTENANCE_MESSAGE
    _set_setting("platform_maintenance_message", msg)
    _set_setting("platform_maintenance_drafted_at", datetime.utcnow().isoformat() + "Z")
    _set_setting("platform_maintenance_drafted_by", str(user.id))
    _set_setting(
        "platform_maintenance_drafted_by_name",
        (user.full_name or user.username or "superadmin").strip(),
    )
    return get_maintenance_draft()


def get_maintenance_draft() -> dict:
    return {
        "message": get_maintenance_message(),
        "drafted_at": _get_setting("platform_maintenance_drafted_at"),
        "drafted_by": _get_setting("platform_maintenance_drafted_by"),
        "drafted_by_name": _get_setting("platform_maintenance_drafted_by_name"),
    }


def get_maintenance_message() -> str:
    return _get_setting("platform_maintenance_message", DEFAULT_MAINTENANCE_MESSAGE) or DEFAULT_MAINTENANCE_MESSAGE


def get_public_platform_status() -> dict:
    """Public-safe status for frontends (no probe internals)."""
    cached = cache_get(_PUBLIC_STATUS_CACHE_KEY)
    if cached is not None:
        return cached
    payload = {
        **edition_public_payload(),
        "sites": {
            "app": module_enabled("site_app"),
            "marketing": module_enabled("site_marketing"),
            "bazaar": module_enabled("site_bazaar"),
            "marketplace": module_enabled("bazaar_marketplace") and module_enabled("site_bazaar"),
        },
        "maintenance_message": get_maintenance_message(),
    }
    cache_set(_PUBLIC_STATUS_CACHE_KEY, payload, _CACHE_TTL_SEC)
    return payload


def site_app_available_for_user(role=None) -> bool:
    if module_enabled("site_app"):
        return True
    return role == "superadmin"


def bazaar_payment_method_defs(app_config=None):
    """Payment options for public bazaar shop-config."""
    from payment_utils import gateway_capabilities

    caps = gateway_capabilities(app_config or {})
    methods = []
    if module_enabled("bazaar_cod"):
        methods.append({
            "id": "cod",
            "label": "Cash on Delivery",
            "description": "Pay when your order arrives",
        })
    if module_enabled("bazaar_online") and caps.get("esewa"):
        methods.append({
            "id": "esewa",
            "label": "eSewa",
            "description": "Pay now securely with eSewa wallet",
        })
    elif module_enabled("bazaar_online"):
        methods.append({
            "id": "esewa",
            "label": "eSewa",
            "description": "Online pay (awaiting merchant configuration)",
            "configured": False,
            "disabled": True,
        })
    return methods


def assert_bazaar_payment_allowed(payment_method: str):
    """Raise ValueError if payment method is disabled."""
    method = (payment_method or "cod").strip().lower()
    if method == "cod" and not module_enabled("bazaar_cod"):
        raise ValueError("Cash on delivery is temporarily unavailable")
    if method == "esewa":
        if not module_enabled("bazaar_online"):
            raise ValueError("Online payment is not enabled on the platform")
        from flask import current_app
        from payment_utils import gateway_capabilities
        if not gateway_capabilities(current_app.config).get("esewa"):
            raise ValueError("eSewa is not configured on the server")
    elif method not in ("cod",):
        raise ValueError("Unsupported payment method")