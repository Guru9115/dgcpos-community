"""Phase 1 — Redis cache + R2/local storage helpers."""
import os

import pytest

from cache import cache_delete, cache_get, cache_set, cache_using_redis
from storage import local_path_for, r2_enabled, save_bytes, get_bytes, serve_upload


class TestCacheLayer:
    def test_cache_roundtrip(self, app):
        with app.app_context():
            cache_delete("test:key")
            cache_set("test:key", {"ok": True, "n": 1}, 60)
            assert cache_get("test:key") == {"ok": True, "n": 1}

    def test_cache_invalidate(self, app):
        with app.app_context():
            cache_set("test:invalidate", [1, 2, 3], 60)
            cache_delete("test:invalidate")
            assert cache_get("test:invalidate") is None

    def test_cache_falls_back_without_redis(self, app, monkeypatch):
        monkeypatch.delenv("REDIS_URL", raising=False)
        with app.app_context():
            cache_delete("test:fallback")
            cache_set("test:fallback", "local", 60)
            assert cache_get("test:fallback") == "local"
            assert cache_using_redis() is False


class TestStorageLayer:
    def test_local_save_and_read(self, app):
        with app.app_context():
            key = "test/phase1/sample.txt"
            save_bytes(key, b"hello-phase1")
            assert get_bytes(key) == b"hello-phase1"
            assert os.path.isfile(local_path_for(key))

    def test_serve_upload_local(self, app):
        with app.app_context():
            key = "test/phase1/serve.png"
            save_bytes(key, b"\x89PNG")
            directory = os.path.dirname(local_path_for(key))
            resp = serve_upload(key, directory=directory, filename="serve.png")
            assert resp is not None
            assert resp.status_code == 200

    def test_r2_disabled_without_credentials(self, app, monkeypatch):
        monkeypatch.setenv("R2_ENABLED", "false")
        with app.app_context():
            assert r2_enabled() is False