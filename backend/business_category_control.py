"""
Superadmin business category control — performance, module upstream/downstream,
category defaults, and manual premium billing grants per account.
"""
from __future__ import annotations

import json
import uuid
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import func

from models import db, Setting, Account, User, Sale
from store_engine import normalize_store_type
from platform_modules import MODULE_DEFS, module_enabled

CATEGORY_SETTING_KEY = "business_category_modules"
REQUESTS_SETTING_KEY = "premium_service_requests"
ACCOUNT_MODULES_KEY = "premium_module_grants"

# Canonical superadmin business categories (signup + command center)
BUSINESS_CATEGORIES: dict[str, dict] = {
    "general_retail": {
        "label": "General Retail",
        "store_type": "retail",
        "aliases": ["general retail", "retail", "general"],
        "upstream": [
            {"key": "pos_core", "label": "POS Core"},
            {"key": "inventory", "label": "Inventory & Stock"},
        ],
        "downstream": [
            {"key": "bazaar_marketplace", "label": "DGC Bazaar"},
            {"key": "payables", "label": "Payables"},
            {"key": "bazaar_ads", "label": "Bazaar Ads"},
        ],
        "modules": {
            "bazaar_marketplace": {"label": "DGC Bazaar listings", "premium": False, "default": True},
            "guest_checkout": {"label": "Guest checkout", "premium": False, "default": True},
            "payables": {"label": "Payables", "premium": True, "default": False},
            "bazaar_ads": {"label": "Bazaar advertising", "premium": True, "default": False},
            "pos_online": {"label": "Online POS payments", "premium": True, "default": False, "superadmin_only": True},
            "international_payments": {"label": "International payments (Stripe / PayPal)", "premium": True, "default": False, "superadmin_only": True},
        },
        "customer_experience": {
            "signup_label": "General Retail",
            "dashboard_route": "/",
            "dashboard_label": "Retail Dashboard",
            "sidebar_sections": [
                "Dashboard", "Point of Sale", "Customers", "DGC Bazaar",
                "Products", "Inventory", "Sales & Returns", "Finance & Reports", "Payables", "Settings",
            ],
        },
    },
    "restaurant": {
        "label": "Restaurant",
        "store_type": "restaurant",
        "aliases": ["restaurant", "cafe", "food"],
        "upstream": [
            {"key": "pos_core", "label": "POS Core"},
            {"key": "table_service", "label": "Table service"},
        ],
        "downstream": [
            {"key": "kitchen_display", "label": "Kitchen display"},
            {"key": "bazaar_marketplace", "label": "DGC Bazaar"},
            {"key": "payables", "label": "Payables"},
        ],
        "modules": {
            "table_service": {"label": "Table & split bill", "premium": False, "default": True},
            "kitchen_display": {"label": "Kitchen display", "premium": True, "default": False},
            "bazaar_marketplace": {"label": "DGC Bazaar", "premium": False, "default": True},
            "payables": {"label": "Payables", "premium": True, "default": False},
            "pos_online": {"label": "Online POS payments", "premium": True, "default": False, "superadmin_only": True},
            "international_payments": {"label": "International payments (Stripe / PayPal)", "premium": True, "default": False, "superadmin_only": True},
        },
        "customer_experience": {
            "signup_label": "Restaurant",
            "dashboard_route": "/",
            "dashboard_label": "Restaurant Dashboard",
            "sidebar_sections": [
                "Dashboard", "Point of Sale", "Table service", "Customers", "DGC Bazaar",
                "Products", "Kitchen display", "Sales & Returns", "Finance & Reports", "Settings",
            ],
        },
    },
    "hotel_lodge": {
        "label": "Hotel / Lodge",
        "store_type": "hotel",
        "aliases": ["hotel", "lodge", "guesthouse", "hostel", "homestay", "hotel / lodge"],
        "upstream": [
            {"key": "pos_core", "label": "POS Core"},
            {"key": "hospitality", "label": "Hospitality engine"},
        ],
        "downstream": [
            {"key": "room_bookings", "label": "Rooms & bookings"},
            {"key": "restaurant_pos", "label": "Restaurant POS"},
            {"key": "bazaar_marketplace", "label": "DGC Bazaar"},
        ],
        "modules": {
            "hospitality": {"label": "Hotel / rooms module", "premium": False, "default": True},
            "room_bookings": {"label": "Room bookings", "premium": False, "default": True},
            "bazaar_marketplace": {"label": "DGC Bazaar", "premium": True, "default": False},
            "payables": {"label": "Payables", "premium": True, "default": False},
            "pos_online": {"label": "Online POS payments", "premium": True, "default": False, "superadmin_only": True},
            "international_payments": {"label": "International payments (Stripe / PayPal)", "premium": True, "default": False, "superadmin_only": True},
        },
        "customer_experience": {
            "signup_label": "Hotel / Lodge",
            "dashboard_route": "/hotel",
            "dashboard_label": "Hotel Dashboard",
            "sidebar_sections": [
                "Hotel Dashboard", "Rooms", "Bookings", "Point of Sale", "Customers",
                "DGC Bazaar", "Products", "Finance & Reports", "Payables", "Settings",
            ],
        },
    },
    "supermarket": {
        "label": "Supermarket",
        "store_type": "supermarket",
        "aliases": ["supermarket", "grocery", "kirana"],
        "upstream": [
            {"key": "pos_core", "label": "POS Core"},
            {"key": "inventory", "label": "Inventory & expiry"},
        ],
        "downstream": [
            {"key": "weight_scale", "label": "Weight / bulk SKU"},
            {"key": "bazaar_marketplace", "label": "DGC Bazaar"},
            {"key": "payables", "label": "Payables"},
        ],
        "modules": {
            "weight_scale": {"label": "Weight & bulk SKU", "premium": False, "default": True},
            "bazaar_marketplace": {"label": "DGC Bazaar", "premium": False, "default": True},
            "payables": {"label": "Payables", "premium": True, "default": False},
            "bazaar_ads": {"label": "Bazaar advertising", "premium": True, "default": False},
            "pos_online": {"label": "Online POS payments", "premium": True, "default": False, "superadmin_only": True},
            "international_payments": {"label": "International payments (Stripe / PayPal)", "premium": True, "default": False, "superadmin_only": True},
        },
        "customer_experience": {
            "signup_label": "Supermarket",
            "dashboard_route": "/",
            "dashboard_label": "Supermarket Dashboard",
            "sidebar_sections": [
                "Dashboard", "Point of Sale", "Weight & bulk SKU", "Customers", "DGC Bazaar",
                "Products", "Inventory & expiry", "Sales & Returns", "Finance & Reports", "Settings",
            ],
        },
    },
    "pharmacy": {
        "label": "Pharmacy",
        "store_type": "pharmacy",
        "aliases": ["pharmacy", "chemist", "medical store"],
        "upstream": [
            {"key": "pos_core", "label": "POS Core"},
            {"key": "batch_expiry", "label": "Batch & expiry"},
        ],
        "downstream": [
            {"key": "bazaar_marketplace", "label": "DGC Bazaar"},
            {"key": "payables", "label": "Payables"},
            {"key": "reports", "label": "Compliance reports"},
        ],
        "modules": {
            "batch_expiry": {"label": "Batch / expiry tracking", "premium": False, "default": True},
            "bazaar_marketplace": {"label": "DGC Bazaar", "premium": False, "default": True},
            "payables": {"label": "Payables", "premium": True, "default": False},
            "pos_online": {"label": "Online POS payments", "premium": True, "default": False, "superadmin_only": True},
            "international_payments": {"label": "International payments (Stripe / PayPal)", "premium": True, "default": False, "superadmin_only": True},
        },
        "customer_experience": {
            "signup_label": "Pharmacy",
            "dashboard_route": "/",
            "dashboard_label": "Pharmacy Dashboard",
            "sidebar_sections": [
                "Dashboard", "Point of Sale", "Batch & expiry", "Customers", "DGC Bazaar",
                "Products", "Inventory", "Compliance reports", "Finance & Reports", "Settings",
            ],
        },
    },
}

# Map category-only module keys to platform MODULE_DEFS keys when applicable
PLATFORM_MODULE_ALIAS = {
    "bazaar_marketplace": "bazaar_marketplace",
    "guest_checkout": "guest_checkout",
    "hospitality": "hospitality",
    "payables": "payables",
    "bazaar_ads": "bazaar_ads",
    "pos_online": "pos_online",
    "international_payments": "international_payments",
}


def _load_json_setting(key: str, default):
    raw = Setting.get_setting(key, account_id=None, fallback=True)
    if not raw or not raw.value:
        return default
    try:
        return json.loads(raw.value)
    except (json.JSONDecodeError, TypeError):
        return default


def _save_json_setting(key: str, data):
    s = Setting.query.filter_by(key=key, account_id=None).first()
    payload = json.dumps(data)
    if s:
        s.value = payload
    else:
        db.session.add(Setting(key=key, value=payload, account_id=None, type="json"))


def account_category_id(account: Account | None) -> str:
    if not account:
        return "general_retail"
    raw = (account.business_type or "General Retail").strip().lower()
    store = normalize_store_type(account.business_type)
    for cat_id, cfg in BUSINESS_CATEGORIES.items():
        if store == cfg["store_type"]:
            return cat_id
        if raw in [a.lower() for a in cfg.get("aliases", [])]:
            return cat_id
    if "restaurant" in raw or "cafe" in raw:
        return "restaurant"
    if "hotel" in raw or "lodge" in raw:
        return "hotel_lodge"
    if "super" in raw or "grocery" in raw:
        return "supermarket"
    if "pharm" in raw:
        return "pharmacy"
    return "general_retail"


def get_category_module_policy() -> dict:
    """Global per-category module defaults { category_id: { module_key: bool } }."""
    stored = _load_json_setting(CATEGORY_SETTING_KEY, {})
    out = {}
    for cat_id, cfg in BUSINESS_CATEGORIES.items():
        cat_policy = stored.get(cat_id, {})
        modules = {}
        for mod_key, mod in cfg["modules"].items():
            modules[mod_key] = bool(cat_policy.get(mod_key, mod.get("default", False)))
        out[cat_id] = modules
    return out


def update_category_module_policy(category_id: str, modules: dict) -> dict:
    if category_id not in BUSINESS_CATEGORIES:
        raise ValueError("Unknown business category")
    policy = _load_json_setting(CATEGORY_SETTING_KEY, {})
    allowed = BUSINESS_CATEGORIES[category_id]["modules"].keys()
    cat_policy = policy.get(category_id, {})
    for key, enabled in modules.items():
        if key in allowed:
            cat_policy[key] = bool(enabled)
    policy[category_id] = cat_policy
    _save_json_setting(CATEGORY_SETTING_KEY, policy)
    return get_category_module_policy()


def _get_account_grants(account_id: int) -> dict:
    s = Setting.get_setting(ACCOUNT_MODULES_KEY, account_id=account_id, fallback=False)
    if not s or not s.value:
        return {}
    try:
        data = json.loads(s.value)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def set_account_module_grants(account_id: int, grants: dict, *, billing_mode: str = "manual"):
    payload = {
        "billing_mode": billing_mode,
        "modules": {k: bool(v) for k, v in grants.items()},
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    s = Setting.get_setting(ACCOUNT_MODULES_KEY, account_id=account_id, fallback=False)
    if s:
        s.value = json.dumps(payload)
        s.type = "json"
    else:
        db.session.add(Setting(
            key=ACCOUNT_MODULES_KEY,
            value=json.dumps(payload),
            account_id=account_id,
            type="json",
        ))


def list_premium_requests() -> list[dict]:
    return _load_json_setting(REQUESTS_SETTING_KEY, [])


def create_premium_request(account_id: int, user_id: int, module_key: str, note: str = "") -> dict:
    from user_access_control import is_superadmin_only_module
    if is_superadmin_only_module(module_key):
        raise ValueError(
            "Online and international payment services are activated by DGC superadmin only. "
            "Contact support for manual billing activation."
        )
    cat_id = account_category_id(Account.query.get(account_id))
    cfg = BUSINESS_CATEGORIES.get(cat_id, {})
    if module_key not in cfg.get("modules", {}):
        raise ValueError("Module not available for your business category")
    mod = cfg["modules"][module_key]
    if mod.get("superadmin_only"):
        raise ValueError(
            "This service requires superadmin activation — contact DGC support."
        )
    if not mod.get("premium"):
        raise ValueError("This module is included — no premium request needed")

    requests = list_premium_requests()
    for r in requests:
        if r.get("account_id") == account_id and r.get("module_key") == module_key and r.get("status") == "pending":
            raise ValueError("A pending request already exists for this module")

    item = {
        "id": str(uuid.uuid4()),
        "account_id": account_id,
        "user_id": user_id,
        "category_id": cat_id,
        "module_key": module_key,
        "module_label": mod.get("label", module_key),
        "note": (note or "").strip()[:500],
        "status": "pending",
        "billing_mode": "manual",
        "created_at": datetime.utcnow().isoformat() + "Z",
        "resolved_at": None,
        "resolved_by": None,
    }
    requests.insert(0, item)
    _save_json_setting(REQUESTS_SETTING_KEY, requests[:200])
    return item


def resolve_premium_request(request_id: str, *, approve: bool, resolver_id: int, billing_note: str = "") -> dict:
    requests = list_premium_requests()
    target = None
    for r in requests:
        if r.get("id") == request_id:
            target = r
            break
    if not target:
        raise ValueError("Request not found")
    if target.get("status") != "pending":
        raise ValueError("Request already resolved")

    target["status"] = "approved" if approve else "rejected"
    target["resolved_at"] = datetime.utcnow().isoformat() + "Z"
    target["resolved_by"] = resolver_id
    if billing_note:
        target["billing_note"] = billing_note[:300]

    if approve:
        account_id = target["account_id"]
        grants = _get_account_grants(account_id)
        modules = grants.get("modules", {}) if isinstance(grants.get("modules"), dict) else grants
        if not isinstance(modules, dict):
            modules = {}
        modules[target["module_key"]] = True
        set_account_module_grants(account_id, modules, billing_mode="manual")

    _save_json_setting(REQUESTS_SETTING_KEY, requests)
    return target


def module_enabled_for_account(account: Account | None, module_key: str, user=None) -> bool:
    """Effective module access for a tenant account. Superadmin: full test access."""
    if user is not None and getattr(user, "role", None) == "superadmin":
        return True
    platform_key = PLATFORM_MODULE_ALIAS.get(module_key)
    if platform_key and not module_enabled(platform_key):
        return False

    cat_id = account_category_id(account)
    policy = get_category_module_policy()
    cat_modules = policy.get(cat_id, {})
    default_on = bool(cat_modules.get(module_key, False))

    if not account:
        return default_on

    grants = _get_account_grants(account.id)
    modules = grants.get("modules", grants) if isinstance(grants, dict) else {}
    if isinstance(modules, dict) and module_key in modules:
        return bool(modules[module_key])

    cfg = BUSINESS_CATEGORIES.get(cat_id, {}).get("modules", {}).get(module_key, {})
    if cfg.get("premium") and not default_on:
        return False
    return default_on


def get_category_performance(week_ago: datetime) -> dict[str, dict]:
    accounts = Account.query.all()
    by_cat: dict[str, list[int]] = defaultdict(list)
    for acc in accounts:
        by_cat[account_category_id(acc)].append(acc.id)

    perf = {}
    for cat_id in BUSINESS_CATEGORIES:
        ids = by_cat.get(cat_id, [])
        if not ids:
            perf[cat_id] = {
                "accounts": 0,
                "sales_7d": 0,
                "revenue_7d": 0.0,
                "active_users_7d": 0,
                "premium_accounts": 0,
            }
            continue
        sales_7d = db.session.query(func.count(Sale.id)).filter(
            Sale.account_id.in_(ids),
            Sale.sale_date >= week_ago,
            Sale.status == "completed",
        ).scalar() or 0
        revenue_7d = db.session.query(func.sum(Sale.total)).filter(
            Sale.account_id.in_(ids),
            Sale.sale_date >= week_ago,
            Sale.status == "completed",
        ).scalar() or 0
        premium_accounts = Account.query.filter(
            Account.id.in_(ids),
            Account.subscription_plan.in_(("starter", "pro")),
        ).count()
        perf[cat_id] = {
            "accounts": len(ids),
            "sales_7d": int(sales_7d),
            "revenue_7d": float(revenue_7d or 0),
            "active_users_7d": User.query.filter(
                User.account_id.in_(ids),
                User.is_active.is_(True),
            ).count(),
            "premium_accounts": premium_accounts,
        }
    return perf


def get_business_categories_dashboard() -> dict:
    week_ago = datetime.utcnow() - timedelta(days=7)
    policy = get_category_module_policy()
    performance = get_category_performance(week_ago)
    categories = []

    for cat_id, cfg in BUSINESS_CATEGORIES.items():
        modules_out = []
        for mod_key, mod in cfg["modules"].items():
            platform_key = PLATFORM_MODULE_ALIAS.get(mod_key)
            platform_on = module_enabled(platform_key) if platform_key else True
            modules_out.append({
                "key": mod_key,
                "label": mod.get("label", mod_key),
                "premium": bool(mod.get("premium")),
                "enabled": bool(policy.get(cat_id, {}).get(mod_key, mod.get("default", False))),
                "platform_on": platform_on,
                "effective": platform_on and bool(policy.get(cat_id, {}).get(mod_key, mod.get("default", False))),
            })
        categories.append({
            "id": cat_id,
            "label": cfg["label"],
            "store_type": cfg["store_type"],
            "upstream": cfg.get("upstream", []),
            "downstream": cfg.get("downstream", []),
            "customer_experience": cfg.get("customer_experience", {}),
            "performance": performance.get(cat_id, {}),
            "modules": modules_out,
        })

    pending = [r for r in list_premium_requests() if r.get("status") == "pending"]
    for req in pending:
        acc = Account.query.get(req.get("account_id"))
        if acc:
            req["account_name"] = acc.name
            req["business_type"] = acc.business_type
            req["subscription_plan"] = acc.subscription_plan

    return {
        "categories": categories,
        "pending_requests": pending[:50],
        "billing_mode": "manual",
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def get_account_available_modules(account: Account) -> list[dict]:
    cat_id = account_category_id(account)
    cfg = BUSINESS_CATEGORIES.get(cat_id, {})
    policy = get_category_module_policy()
    grants = _get_account_grants(account.id)
    grant_modules = grants.get("modules", {}) if isinstance(grants, dict) else {}
    out = []
    for mod_key, mod in cfg.get("modules", {}).items():
        enabled = module_enabled_for_account(account, mod_key)
        out.append({
            "key": mod_key,
            "label": mod.get("label", mod_key),
            "premium": bool(mod.get("premium")),
            "superadmin_only": bool(mod.get("superadmin_only")),
            "enabled": enabled,
            "category_default": bool(policy.get(cat_id, {}).get(mod_key, mod.get("default", False))),
            "manually_granted": bool(grant_modules.get(mod_key)) if isinstance(grant_modules, dict) else False,
        })
    return out