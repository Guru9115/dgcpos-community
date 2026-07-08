import os
import importlib

import pytest


@pytest.fixture(autouse=True)
def reset_edition_module():
    try:
        from license.verify import clear_license_cache
        clear_license_cache()
    except ImportError:
        pass
    import edition as edition_mod
    yield
    try:
        from license.verify import clear_license_cache
        clear_license_cache()
    except ImportError:
        pass
    importlib.reload(edition_mod)


def test_default_edition_is_enterprise(monkeypatch):
    monkeypatch.delenv("DGCPOS_EDITION", raising=False)
    import edition as edition_mod
    importlib.reload(edition_mod)
    assert edition_mod.get_edition() == "enterprise"
    assert edition_mod.is_enterprise() is True


def test_community_edition_blocks_ee_modules(monkeypatch):
    monkeypatch.setenv("DGCPOS_EDITION", "community")
    import edition as edition_mod
    importlib.reload(edition_mod)
    assert edition_mod.is_community() is True
    assert edition_mod.module_allowed_in_edition("hospitality") is False
    assert edition_mod.module_allowed_in_edition("bazaar_marketplace") is True


def test_community_blocks_ee_api_paths(monkeypatch):
    monkeypatch.setenv("DGCPOS_EDITION", "community")
    import edition as edition_mod
    importlib.reload(edition_mod)
    assert edition_mod.is_ee_api_path("/api/hospitality/bookings") is True
    assert edition_mod.is_ee_api_path("/api/sales") is False
    blocked = edition_mod.edition_api_block("/api/payments/initiate")
    assert blocked is not None
    assert blocked[1] == 403


def test_enterprise_allows_all_api_paths(monkeypatch):
    monkeypatch.setenv("DGCPOS_EDITION", "enterprise")
    import edition as edition_mod
    importlib.reload(edition_mod)
    assert edition_mod.edition_api_block("/api/admin/overview") is None


def test_module_enabled_respects_community_edition(monkeypatch, app):
    monkeypatch.setenv("DGCPOS_EDITION", "community")
    import edition as edition_mod
    import platform_modules as pm
    with app.app_context():
        from license.storage import clear_license_record
        from license.verify import clear_license_cache

        clear_license_record(account_id=1)
        clear_license_cache()
        importlib.reload(edition_mod)
        importlib.reload(pm)
        assert pm.module_enabled("hospitality") is False
        assert pm.module_enabled("bazaar_marketplace") is True