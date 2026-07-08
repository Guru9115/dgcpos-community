"""Tests for Enterprise license keys and edition unlock (Phase P5)."""
import importlib
import os
from datetime import datetime, timedelta

import pytest

from license.keys import issue_license_key, verify_license_key
from license.verify import activate_license, clear_license_cache, get_public_license_status, license_unlocks_enterprise


@pytest.fixture
def dev_private_key(monkeypatch):
    monkeypatch.setenv(
        "DGCPOS_LICENSE_PRIVATE_KEY",
        "-PRqCI_woYAUOErU1YOOroGZAqEc9M6vlDq5Z7CdDPY",
    )
    monkeypatch.setenv(
        "DGCPOS_LICENSE_PUBLIC_KEY",
        "LVqmweH0idqJexYX2dPpVn767vOhLko1Oa6H9V6a0Dg=",
    )
    monkeypatch.delenv("DGCPOS_LICENSE_KEY", raising=False)


@pytest.fixture(autouse=True)
def reset_license_state(monkeypatch, app):
    clear_license_cache()
    monkeypatch.delenv("DGCPOS_LICENSE_KEY", raising=False)
    with app.app_context():
        from license.storage import clear_license_record

        clear_license_record(account_id=1)
    yield
    clear_license_cache()
    with app.app_context():
        from license.storage import clear_license_record

        clear_license_record(account_id=1)


@pytest.fixture
def community_edition(monkeypatch):
    monkeypatch.setenv("DGCPOS_EDITION", "community")
    import edition as edition_mod
    importlib.reload(edition_mod)
    yield
    monkeypatch.delenv("DGCPOS_EDITION", raising=False)
    importlib.reload(edition_mod)


def test_issue_and_verify_license_key(dev_private_key):
    key = issue_license_key(
        customer_id="MRC-TEST-001",
        expires_at=datetime.utcnow() + timedelta(days=30),
        max_staff=25,
    )
    assert key.startswith("DGC-ENT-")
    info = verify_license_key(key)
    assert info["valid"] is True
    assert info["customer_id"] == "MRC-TEST-001"
    assert info["max_staff"] == 25


def test_expired_license_rejected(dev_private_key):
    key = issue_license_key(
        customer_id="MRC-EXPIRED",
        expires_at=datetime.utcnow() - timedelta(days=1),
    )
    with pytest.raises(ValueError, match="expired"):
        verify_license_key(key)


def test_license_unlocks_community_edition(dev_private_key, community_edition, app):
    import edition as edition_mod

    key = issue_license_key(
        customer_id="MRC-UNLOCK",
        expires_at=datetime.utcnow() + timedelta(days=90),
    )
    with app.app_context():
        activate_license(key, account_id=None)
        clear_license_cache()
        assert license_unlocks_enterprise() is True
        importlib.reload(edition_mod)
        assert edition_mod.effective_edition() == "enterprise"
        assert edition_mod.is_enterprise() is True


def test_license_status_payload(dev_private_key, community_edition, app):
    key = issue_license_key(customer_id="MRC-STATUS", expires_at=datetime.utcnow() + timedelta(days=10))
    with app.app_context():
        activate_license(key, account_id=None)
        clear_license_cache()
        status = get_public_license_status(force_refresh=True)
        assert status["licensed"] is True
        assert status["edition"] == "enterprise"
        assert status["customer_id"] == "MRC-STATUS"