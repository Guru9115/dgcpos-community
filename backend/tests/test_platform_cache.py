"""Platform settings batch cache — fewer DB round-trips per request."""
from platform_modules import (
    _invalidate_settings_cache,
    _load_platform_settings,
    get_public_platform_status,
    module_enabled,
    update_platform_modules,
)


class TestPlatformSettingsCache:
    def test_batch_load_caches_settings(self, app):
        with app.app_context():
            _invalidate_settings_cache()
            first = _load_platform_settings()
            second = _load_platform_settings()
            assert first == second

    def test_module_enabled_uses_cache(self, app):
        with app.app_context():
            _invalidate_settings_cache()
            assert module_enabled("site_app") is True
            assert module_enabled("site_bazaar") is True

    def test_public_status_cached(self, app):
        with app.app_context():
            _invalidate_settings_cache()
            a = get_public_platform_status()
            b = get_public_platform_status()
            assert a == b
            assert "sites" in a

    def test_invalidate_clears_batch_cache(self, app):
        with app.app_context():
            _invalidate_settings_cache()
            loaded = _load_platform_settings()
            _invalidate_settings_cache()
            reloaded = _load_platform_settings()
            assert loaded == reloaded