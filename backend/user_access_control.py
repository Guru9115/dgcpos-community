"""Superadmin user & merchant access — menus, modules, service toggle, device reset."""
from __future__ import annotations

import json
from datetime import datetime

from models import db, Setting, User, Account, AuthToken

# Nav keys — tick to grant/restrict menu items per user or merchant account
APP_MENU_ITEMS: list[dict] = [
    {"key": "dashboard", "label": "Dashboard", "path": "/"},
    {"key": "pos", "label": "Point of Sale", "path": "/pos"},
    {"key": "customers", "label": "Customers", "path": "/customers"},
    {"key": "hotel", "label": "Hotel Dashboard", "path": "/hotel"},
    {"key": "hotel_rooms", "label": "Rooms", "path": "/hotel/rooms"},
    {"key": "hotel_bookings", "label": "Bookings", "path": "/hotel/bookings"},
    {"key": "marketplace", "label": "DGC Bazaar", "path": "/marketplace"},
    {"key": "products", "label": "Products", "path": "/products"},
    {"key": "inventory", "label": "Inventory", "path": "/inventory"},
    {"key": "stock_take", "label": "Stock Take", "path": "/stock-take"},
    {"key": "suppliers", "label": "Suppliers", "path": "/suppliers"},
    {"key": "purchase_orders", "label": "Purchase Orders", "path": "/purchase-orders"},
    {"key": "sales", "label": "Sales History", "path": "/sales"},
    {"key": "returns", "label": "Returns", "path": "/returns"},
    {"key": "layaway", "label": "Layaway", "path": "/layaway"},
    {"key": "finance", "label": "Finance", "path": "/finance"},
    {"key": "reports", "label": "Reports", "path": "/reports"},
    {"key": "payables", "label": "Payables", "path": "/payables"},
    {"key": "dsr", "label": "DSR Register", "path": "/dsr"},
    {"key": "promotions", "label": "Promotions", "path": "/promotions"},
    {"key": "gift_cards", "label": "Gift Cards", "path": "/gift-cards"},
    {"key": "staff_targets", "label": "Staff Targets", "path": "/staff-targets"},
    {"key": "assistant", "label": "AI Assistant", "path": "/assistant"},
    {"key": "support", "label": "DGC Support", "path": "/support"},
    {"key": "settings", "label": "Settings", "path": "/settings"},
    {"key": "audit", "label": "Audit Logs", "path": "/audit"},
]

MENU_KEYS = {m["key"] for m in APP_MENU_ITEMS}

PLATFORM_ROLES = frozenset({
    "superadmin", "owner", "manager", "sales_staff",
    "staff", "operations_staff", "engineer",
})

ROLE_LABELS = {
    "superadmin": "Super Admin",
    "owner": "Owner",
    "manager": "Manager",
    "sales_staff": "Sales Staff",
    "staff": "Staff",
    "operations_staff": "Operations Staff",
    "engineer": "Engineer",
}

MERCHANT_CUSTOMER_ID_KEY = "merchant_customer_id"
MERCHANT_SERVICE_KEY = "merchant_service_enabled"
USER_MENU_KEY = "user_menu_permissions"
ACCOUNT_MENU_KEY = "account_menu_permissions"

# Online + international payments — superadmin manual activation only (no merchant self-request)
SUPERADMIN_ONLY_MODULES = frozenset({"pos_online", "international_payments"})

ROLE_MENU_TEMPLATES: dict[str, list[str] | None] = {
    "owner": None,
    "manager": [
        "dashboard", "pos", "customers", "products", "inventory", "sales", "returns",
        "reports", "finance", "payables", "settings", "audit",
    ],
    "sales_staff": ["dashboard", "pos", "customers", "sales", "returns", "layaway"],
    "staff": ["dashboard", "pos", "customers", "sales", "returns"],
    "operations_staff": [
        "dashboard", "inventory", "stock_take", "suppliers", "purchase_orders", "products",
    ],
    "engineer": ["dashboard", "settings", "audit", "assistant"],
}


def normalize_role(role: str | None) -> str:
    r = (role or "sales_staff").strip().lower()
    if r == "staff":
        return "sales_staff"
    return r


def expand_roles_for_check(*roles: str) -> set[str]:
    """Map require_roles tuples to include alias roles."""
    out = set(roles)
    if "sales_staff" in out:
        out |= {"sales_staff", "staff", "engineer"}
    if "manager" in out:
        out |= {"manager", "operations_staff"}
    return out


def _load_json_setting(key: str, account_id=None, default=None):
    s = Setting.get_setting(key, account_id=account_id, fallback=False)
    if not s or not s.value:
        return default
    try:
        return json.loads(s.value)
    except (json.JSONDecodeError, TypeError):
        return default


def _save_json_setting(key: str, data, account_id=None):
    payload = json.dumps(data)
    s = Setting.query.filter_by(key=key, account_id=account_id).first()
    if s:
        s.value = payload
        s.type = "json"
    else:
        db.session.add(Setting(key=key, value=payload, account_id=account_id, type="json"))


def _save_string_setting(key: str, value: str, account_id=None):
    s = Setting.query.filter_by(key=key, account_id=account_id).first()
    if s:
        s.value = value
    else:
        db.session.add(Setting(key=key, value=value, account_id=account_id))


def get_merchant_customer_id(account_id: int) -> str | None:
    s = Setting.get_setting(MERCHANT_CUSTOMER_ID_KEY, account_id=account_id, fallback=False)
    return (s.value or "").strip() or None if s else None


def merchant_service_enabled(account_id: int | None) -> bool:
    if account_id is None:
        return True
    s = Setting.get_setting(MERCHANT_SERVICE_KEY, account_id=account_id, fallback=False)
    if s and (s.value or "").lower() in ("false", "0", "off", "disabled"):
        return False
    return True


def set_merchant_service_enabled(account_id: int, enabled: bool):
    was_enabled = merchant_service_enabled(account_id)
    _save_string_setting(MERCHANT_SERVICE_KEY, "true" if enabled else "false", account_id=account_id)
    if was_enabled and not enabled:
        from auth_utils import revoke_account_sessions
        revoke_account_sessions(account_id)


def get_user_menu_permissions(user_id: int, account_id: int | None) -> list[str] | None:
    per_user = _load_json_setting(f"{USER_MENU_KEY}_{user_id}", account_id=account_id)
    if isinstance(per_user, list) and per_user:
        return [k for k in per_user if k in MENU_KEYS]
    if account_id:
        account_menus = _load_json_setting(ACCOUNT_MENU_KEY, account_id=account_id)
        if isinstance(account_menus, list) and account_menus:
            return [k for k in account_menus if k in MENU_KEYS]
    return None


def set_user_menu_permissions(user_id: int, account_id: int | None, keys: list[str] | None):
    cleaned = None
    if keys is not None:
        cleaned = [k for k in keys if k in MENU_KEYS]
    _save_json_setting(f"{USER_MENU_KEY}_{user_id}", cleaned or [], account_id=account_id)


def set_account_menu_permissions(account_id: int, keys: list[str] | None):
    cleaned = None
    if keys is not None:
        cleaned = [k for k in keys if k in MENU_KEYS]
    _save_json_setting(ACCOUNT_MENU_KEY, cleaned or [], account_id=account_id)


def reset_user_device(user: User, *, force_password_change: bool = False):
    from auth_utils import bump_security_epoch
    bump_security_epoch(user)
    user.failed_login_count = 0
    user.locked_until = None
    if force_password_change:
        user.must_change_password = True


def enrich_user_dict(user: User) -> dict:
    data = user.to_dict()
    aid = user.account_id
    data["role_label"] = ROLE_LABELS.get(user.role, user.role)
    data["menu_permissions"] = get_user_menu_permissions(user.id, aid)
    data["menu_items"] = APP_MENU_ITEMS
    if aid:
        data["merchant_customer_id"] = get_merchant_customer_id(aid)
        data["merchant_service_enabled"] = merchant_service_enabled(aid)
        from business_category_control import get_account_available_modules
        acc = Account.query.get(aid)
        if acc:
            data["service_modules"] = get_account_available_modules(acc)
    if user.role == "superadmin":
        data["menu_permissions"] = None
        data["merchant_service_enabled"] = True
    try:
        from hospitality.feature_gate import hospitality_enabled_for_account
        acc = Account.query.get(aid) if aid else None
        data["hospitality_enabled"] = hospitality_enabled_for_account(acc, user=user)
    except Exception:
        data["hospitality_enabled"] = False
    return data


def get_account_access_profile(account_id: int) -> dict:
    from business_category_control import (
        get_account_available_modules,
        account_category_id,
        BUSINESS_CATEGORIES,
        _get_account_grants,
    )

    acc = Account.query.get_or_404(account_id)
    cat_id = account_category_id(acc)
    grants = _get_account_grants(account_id)
    modules = grants.get("modules", grants) if isinstance(grants, dict) else {}
    return {
        "account_id": account_id,
        "account_name": acc.name,
        "business_type": acc.business_type,
        "category_id": cat_id,
        "category_label": BUSINESS_CATEGORIES.get(cat_id, {}).get("label", cat_id),
        "merchant_customer_id": get_merchant_customer_id(account_id),
        "service_enabled": merchant_service_enabled(account_id),
        "subscription_plan": acc.subscription_plan,
        "subscription_status": acc.subscription_status,
        "module_grants": modules if isinstance(modules, dict) else {},
        "service_modules": get_account_available_modules(acc),
        "menu_permissions": _load_json_setting(ACCOUNT_MENU_KEY, account_id=account_id) or [],
        "menu_items": APP_MENU_ITEMS,
        "users_count": User.query.filter_by(account_id=account_id, is_active=True).count(),
    }


def update_account_access_profile(account_id: int, data: dict) -> dict:
    acc = Account.query.get_or_404(account_id)
    if "merchant_customer_id" in data:
        from merchant_customer_id import set_merchant_customer_id_manual
        try:
            set_merchant_customer_id_manual(
                account_id,
                data.get("merchant_customer_id"),
            )
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
    if "service_enabled" in data:
        set_merchant_service_enabled(account_id, bool(data["service_enabled"]))
    if "subscription_plan" in data:
        acc.subscription_plan = str(data["subscription_plan"])[:32]
    if "subscription_status" in data:
        acc.subscription_status = str(data["subscription_status"])[:32]
    if "menu_permissions" in data:
        keys = data["menu_permissions"]
        set_account_menu_permissions(account_id, keys if keys else None)
    if "module_grants" in data and isinstance(data["module_grants"], dict):
        from business_category_control import set_account_module_grants
        set_account_module_grants(account_id, data["module_grants"], billing_mode="manual")
    if "subscription_status" in data or "subscription_plan" in data:
        sync_billing_service_access(acc)
    return get_account_access_profile(account_id)


def is_superadmin_only_module(module_key: str) -> bool:
    return (module_key or "").strip() in SUPERADMIN_ONLY_MODULES


def get_role_menu_template(role: str | None) -> list[str] | None:
    return ROLE_MENU_TEMPLATES.get(normalize_role(role))


def get_role_menu_templates_payload() -> list[dict]:
    return [
        {"role": role, "role_label": ROLE_LABELS.get(role, role), "menu_keys": keys or []}
        for role, keys in ROLE_MENU_TEMPLATES.items()
        if role != "owner"
    ]


def get_account_allowed_menu_keys(account_id: int | None) -> list[str] | None:
    """Menus the store is allowed to use (account-level restriction). None = all."""
    if not account_id:
        return None
    account_menus = _load_json_setting(ACCOUNT_MENU_KEY, account_id=account_id)
    if isinstance(account_menus, list) and account_menus:
        return [k for k in account_menus if k in MENU_KEYS]
    return None


def clamp_menu_keys_for_account(account_id: int | None, keys: list[str] | None) -> list[str] | None:
    """Intersect user menu keys with account-allowed menus."""
    if not keys:
        return None
    cleaned = [k for k in keys if k in MENU_KEYS]
    allowed = get_account_allowed_menu_keys(account_id)
    if allowed is not None:
        allowed_set = set(allowed)
        cleaned = [k for k in cleaned if k in allowed_set]
    return cleaned or None


def apply_role_menu_template_to_account(account_id: int, role: str) -> list[str] | None:
    template = get_role_menu_template(role)
    if template is None:
        set_account_menu_permissions(account_id, None)
        return None
    keys = clamp_menu_keys_for_account(account_id, template) or []
    set_account_menu_permissions(account_id, keys if keys else None)
    return keys


def apply_role_menu_template_to_user(user_id: int, account_id: int | None, role: str) -> list[str] | None:
    template = get_role_menu_template(role)
    if template is None:
        set_user_menu_permissions(user_id, account_id, None)
        return None
    keys = clamp_menu_keys_for_account(account_id, template) or []
    set_user_menu_permissions(user_id, account_id, keys if keys else None)
    return keys


def sync_billing_service_access(account: Account) -> bool:
    """Auto service OFF on past_due/canceled; ON when active/trialing."""
    status = (account.subscription_status or "").strip().lower()
    if status in ("past_due", "canceled", "unpaid"):
        if merchant_service_enabled(account.id):
            set_merchant_service_enabled(account.id, False)
            return False
    elif status in ("active", "trialing", "beta"):
        if not merchant_service_enabled(account.id):
            set_merchant_service_enabled(account.id, True)
            return True
    return merchant_service_enabled(account.id)


def owner_can_manage_actor(actor: User, target: User) -> bool:
    if actor.role == "superadmin":
        return True
    if target.role == "superadmin":
        return False
    if actor.account_id != target.account_id:
        return False
    if actor.role == "owner":
        return True
    if actor.role == "manager":
        return target.role in ("sales_staff", "staff", "operations_staff", "engineer")
    return False