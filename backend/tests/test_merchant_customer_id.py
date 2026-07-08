"""Merchant customer ID assignment and lookup."""
import pytest
from models import db, Account
from merchant_customer_id import (
    format_merchant_customer_id,
    ensure_merchant_customer_id,
    backfill_all_merchant_customer_ids,
    find_account_ids_by_customer_id,
    set_merchant_customer_id_manual,
    ID_PATTERN,
)


def test_format_id():
    assert format_merchant_customer_id(42) == "DGC-M-000042"
    assert ID_PATTERN.match("DGC-M-000042")


def test_auto_assign_and_lookup(app):
    with app.app_context():
        acc = Account(name="ID Test Shop", business_type="retail")
        db.session.add(acc)
        db.session.flush()
        cid = ensure_merchant_customer_id(acc.id, commit=True)
        assert cid == format_merchant_customer_id(acc.id)
        found = find_account_ids_by_customer_id("DGC-M-000")
        assert acc.id in found
        db.session.delete(acc)
        db.session.commit()


def test_manual_duplicate_rejected(app):
    with app.app_context():
        a1 = Account(name="A1", business_type="retail")
        a2 = Account(name="A2", business_type="retail")
        db.session.add_all([a1, a2])
        db.session.flush()
        ensure_merchant_customer_id(a1.id)
        cid2 = format_merchant_customer_id(a2.id)
        with pytest.raises(ValueError):
            set_merchant_customer_id_manual(a2.id, format_merchant_customer_id(a1.id))
        db.session.delete(a1)
        db.session.delete(a2)
        db.session.commit()


def test_backfill_assigns_missing(app):
    with app.app_context():
        acc = Account(name="Backfill Shop", business_type="retail")
        db.session.add(acc)
        db.session.commit()
        n = backfill_all_merchant_customer_ids()
        assert n >= 0
        from merchant_customer_id import get_merchant_customer_id
        assert get_merchant_customer_id(acc.id) == format_merchant_customer_id(acc.id)
        db.session.delete(acc)
        db.session.commit()