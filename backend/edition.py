"""DGCPOS edition — Community vs Enterprise (Phase P1 gating + P5 license unlock)."""
import os
from typing import Optional

COMMUNITY = "community"
ENTERPRISE = "enterprise"
VALID_EDITIONS = frozenset({COMMUNITY, ENTERPRISE})

# Platform module keys disabled in Community Edition
EE_ONLY_MODULES = frozenset({
    "pos_online",
    "international_payments",
    "bazaar_online",
    "guest_checkout",
    "hospitality",
    "payables",
    "bazaar_ads",
    "site_marketing",
    "site_bazaar",
})

# API paths that require Enterprise (prefix or exact match)
EE_API_PREFIXES = (
    "/api/admin",
    "/api/hospitality",
    "/api/payables",
    "/api/payments",
    "/api/billing",
    "/api/messenger",
    "/api/support",
    "/api/import",
    "/api/gift-cards",
    "/api/staff-targets",
    "/api/ai",
    "/api/marketplace/ads",
)

EE_API_EXACT = frozenset({
    "/api/marketplace/public/guest-checkout",
})


def get_edition() -> str:
    raw = (os.environ.get("DGCPOS_EDITION") or COMMUNITY).strip().lower()
    return raw if raw in VALID_EDITIONS else ENTERPRISE


def _license_unlocks_enterprise() -> bool:
    try:
        from license.verify import license_unlocks_enterprise

        return license_unlocks_enterprise()
    except ImportError:
        return False


def effective_edition() -> str:
    """Runtime edition — env default, with license unlock on self-hosted Community."""
    if get_edition() == ENTERPRISE:
        return ENTERPRISE
    if _license_unlocks_enterprise():
        return ENTERPRISE
    return COMMUNITY


def is_enterprise() -> bool:
    return effective_edition() != COMMUNITY


def is_community() -> bool:
    return effective_edition() == COMMUNITY


def should_mount_enterprise_api() -> bool:
    """Whether EE API blueprints should be registered at startup."""
    if get_edition() == ENTERPRISE:
        return True
    return _license_unlocks_enterprise()


def module_allowed_in_edition(module_key: str) -> bool:
    if is_enterprise():
        return True
    return module_key not in EE_ONLY_MODULES


def is_ee_api_path(path: str) -> bool:
    if not path:
        return False
    if path in EE_API_EXACT:
        return True
    return any(path.startswith(prefix) for prefix in EE_API_PREFIXES)


def edition_api_block(path: str) -> Optional[tuple]:
    """Return (body, status) if path is blocked in Community Edition."""
    if is_enterprise():
        return None
    if not is_ee_api_path(path):
        return None
    return (
        {
            "error": "Enterprise edition required",
            "edition": COMMUNITY,
            "upgrade": "https://dgcpos.com/pricing",
        },
        403,
    )


def edition_public_payload() -> dict:
    edition = effective_edition()
    build_edition = get_edition()
    licensed = build_edition == COMMUNITY and edition == ENTERPRISE
    payload = {
        "edition": edition,
        "build_edition": build_edition,
        "is_enterprise": edition == ENTERPRISE,
        "licensed": licensed,
        "label": "Enterprise" if edition == ENTERPRISE else "Community",
    }
    if licensed:
        payload["label"] = "Enterprise (Licensed)"
    return payload