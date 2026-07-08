"""Central API security policy — public routes, menu IAM, session rules."""
from __future__ import annotations

from flask import request, jsonify
from flask_login import current_user

# ── Public API (no bearer required) ───────────────────────────────────────────

PUBLIC_API_EXACT = frozenset({
    ("GET", "/api/health"),
    ("GET", "/api/edition"),
    ("GET", "/api/license/status"),
    ("GET", "/api/platform-status"),
    ("GET", "/api/mobile-release"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/signup"),
    ("POST", "/api/auth/google"),
    ("POST", "/api/auth/beta-guest"),
    ("POST", "/api/auth/refresh"),
    ("POST", "/api/auth/verify-email"),
    ("POST", "/api/auth/reset-password-request"),
    ("POST", "/api/auth/reset-password"),
    ("POST", "/api/auth/forgot-password"),
    ("POST", "/api/auth/reset-superadmin"),
})

PUBLIC_API_PREFIXES = (
    "/api/marketplace/public/",
    "/api/marketplace/guest/",
    "/api/hospitality/public/",
)

# Authenticated but not gated by sidebar menu keys
MENU_EXEMPT_PREFIXES = (
    "/api/auth/me",
    "/api/auth/logout",
    "/api/auth/change-password",
    "/api/auth/force-change-password",
    "/api/auth/users",
    "/api/notifications",
    "/api/billing",
    "/api/onboarding",
    "/api/admin/",
    "/api/team/",
    "/api/import/",
    "/api/messenger/",
    "/api/variants/",
    "/api/cashier-sessions/",
    "/api/payments/methods",
    "/api/license/",
)

# Allowed when must_change_password is True
PASSWORD_CHANGE_PREFIXES = (
    "/api/auth/me",
    "/api/auth/logout",
    "/api/auth/change-password",
    "/api/auth/force-change-password",
)

# Longest-prefix wins for API → menu key(s). Tuple = any key grants access.
API_MENU_PREFIXES: tuple[tuple[str, str | tuple[str, ...]], ...] = (
    ("/api/hospitality/rooms", "hotel_rooms"),
    ("/api/hospitality/bookings", "hotel_bookings"),
    ("/api/hospitality", "hotel"),
    ("/api/dashboard", "dashboard"),
    ("/api/sales", ("pos", "sales")),
    ("/api/payments", "pos"),
    ("/api/products", ("products", "pos")),
    ("/api/customers", ("customers", "pos")),
    ("/api/inventory", "inventory"),
    ("/api/import", "products"),
    ("/api/customers", "customers"),
    ("/api/suppliers", "suppliers"),
    ("/api/purchase-orders", "purchase_orders"),
    ("/api/reports", "reports"),
    ("/api/finance", "finance"),
    ("/api/payables", "payables"),
    ("/api/dsr", "dsr"),
    ("/api/promotions", "promotions"),
    ("/api/gift-cards", "gift_cards"),
    ("/api/staff-targets", "staff_targets"),
    ("/api/ai", "assistant"),
    ("/api/support", "support"),
    ("/api/settings", "settings"),
    ("/api/audit", "audit"),
    ("/api/marketplace/ads", "marketplace"),
    ("/api/marketplace", "marketplace"),
    ("/api/returns", "returns"),
    ("/api/layaway", "layaway"),
    ("/api/alterations", "alterations"),
    ("/api/deliveries", "deliveries"),
    ("/api/cashier-sessions", "pos"),
)


def is_public_api(path: str, method: str) -> bool:
    m = (method or "GET").upper()
    if (m, path) in PUBLIC_API_EXACT:
        return True
    return any(path.startswith(p) for p in PUBLIC_API_PREFIXES)


def is_menu_exempt(path: str) -> bool:
    return any(path.startswith(p) for p in MENU_EXEMPT_PREFIXES)


def is_password_change_exempt(path: str) -> bool:
    return any(path.startswith(p) for p in PASSWORD_CHANGE_PREFIXES)


def menu_keys_for_api_path(path: str) -> tuple[str, ...] | None:
    for prefix, keys in API_MENU_PREFIXES:
        if path.startswith(prefix):
            if isinstance(keys, tuple):
                return keys
            return (keys,)
    return None


def menu_key_allowed_for_user(user, menu_keys: str | tuple[str, ...] | None) -> bool:
    from user_access_control import get_user_menu_permissions, merchant_service_enabled

    if not user or getattr(user, "role", None) == "superadmin":
        return True
    if not menu_keys:
        return True
    if isinstance(menu_keys, str):
        menu_keys = (menu_keys,)
    if user.account_id and not merchant_service_enabled(user.account_id):
        return False
    perms = get_user_menu_permissions(user.id, user.account_id)
    if not perms:
        return True
    return any(k in perms for k in menu_keys)


def enforce_authenticated_policy(user, path: str | None = None) -> tuple | None:
    """Return a Flask response tuple if access must be denied, else None."""
    from user_access_control import merchant_service_enabled

    path = path or request.path

    if getattr(user, "role", None) == "superadmin":
        return None

    if not user.is_active:
        return jsonify({
            "error": "Account disabled",
            "code": "account_disabled",
        }), 401

    if hasattr(user, "is_locked") and user.is_locked():
        return jsonify({
            "error": "Account locked due to failed login attempts",
            "code": "account_locked",
        }), 429

    if user.account_id and not merchant_service_enabled(user.account_id):
        return jsonify({
            "error": "Merchant service is disabled. Contact DGC support.",
            "code": "merchant_service_disabled",
        }), 403

    if getattr(user, "must_change_password", False) and not is_password_change_exempt(path):
        return jsonify({
            "error": "Password change required",
            "code": "must_change_password",
        }), 403

    if not is_menu_exempt(path):
        menu_keys = menu_keys_for_api_path(path)
        if menu_keys and not menu_key_allowed_for_user(user, menu_keys):
            return jsonify({
                "error": "This feature is not enabled for your account",
                "code": "menu_access_denied",
                "menu_keys": list(menu_keys),
            }), 403

    return None