"""DGC Merchant Customer ID — auto-assign, backfill, lookup (billing / admin)."""
from __future__ import annotations

import re

from models import db, Account, Setting
from user_access_control import MERCHANT_CUSTOMER_ID_KEY, _save_string_setting

ID_PREFIX = "DGC-M-"
ID_PATTERN = re.compile(r"^DGC-M-\d{6}$")


def format_merchant_customer_id(account_id: int) -> str:
    return f"{ID_PREFIX}{int(account_id):06d}"


def get_merchant_customer_id(account_id: int | None) -> str | None:
    if not account_id:
        return None
    from user_access_control import get_merchant_customer_id as _get
    return _get(account_id)


def _customer_id_taken(value: str, exclude_account_id: int | None = None) -> bool:
    q = Setting.query.filter_by(key=MERCHANT_CUSTOMER_ID_KEY).filter(Setting.value == value)
    if exclude_account_id is not None:
        q = q.filter(Setting.account_id != exclude_account_id)
    return q.first() is not None


def ensure_merchant_customer_id(account_id: int, *, commit: bool = False) -> str:
    """Assign the canonical DGC-M-###### ID if this account has none."""
    existing = get_merchant_customer_id(account_id)
    if existing:
        return existing
    cid = format_merchant_customer_id(account_id)
    if _customer_id_taken(cid, exclude_account_id=account_id):
        raise ValueError(f"Customer ID collision for account {account_id}")
    _save_string_setting(MERCHANT_CUSTOMER_ID_KEY, cid, account_id=account_id)
    if commit:
        db.session.commit()
    return cid


def set_merchant_customer_id_manual(
    account_id: int,
    value: str | None,
    *,
    commit: bool = False,
) -> str | None:
    """Superadmin override — must stay unique; empty re-assigns auto ID."""
    val = (value or "").strip().upper()
    if not val:
        row = Setting.query.filter_by(key=MERCHANT_CUSTOMER_ID_KEY, account_id=account_id).first()
        if row:
            db.session.delete(row)
        if commit:
            db.session.flush()
        return ensure_merchant_customer_id(account_id, commit=commit)

    if not ID_PATTERN.match(val):
        raise ValueError("Customer ID must match format DGC-M-000001")
    if _customer_id_taken(val, exclude_account_id=account_id):
        raise ValueError("Customer ID already assigned to another merchant")

    _save_string_setting(MERCHANT_CUSTOMER_ID_KEY, val, account_id=account_id)
    if commit:
        db.session.commit()
    return val


def find_account_ids_by_customer_id(query: str) -> list[int]:
    """Exact or prefix search for superadmin lookup."""
    q = (query or "").strip().upper()
    if not q:
        return []
    like = f"{q}%" if not q.endswith("%") else q.replace("%", "") + "%"
    rows = Setting.query.filter(
        Setting.key == MERCHANT_CUSTOMER_ID_KEY,
        Setting.account_id.isnot(None),
        Setting.value.ilike(like),
    ).all()
    return [r.account_id for r in rows if r.account_id]


def backfill_all_merchant_customer_ids() -> int:
    """Assign IDs to every account missing one. Safe to run on every boot."""
    assigned = 0
    for acc in Account.query.order_by(Account.id.asc()).all():
        if get_merchant_customer_id(acc.id):
            continue
        ensure_merchant_customer_id(acc.id)
        assigned += 1
    if assigned:
        db.session.commit()
        print(f"[MERCHANT-ID] Backfilled {assigned} customer ID(s)", flush=True)
    return assigned