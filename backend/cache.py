"""Shared cache — Redis in production, in-process fallback for local dev."""
from __future__ import annotations

import json
import os
import time
from typing import Any, Optional

_redis_client = None
_memory: dict[str, dict] = {}


def _redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    url = os.environ.get("REDIS_URL", "").strip()
    if not url:
        return None
    try:
        import redis

        client = redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        client.ping()
        _redis_client = client
        return _redis_client
    except Exception:
        return None


def cache_get(key: str) -> Optional[Any]:
    client = _redis()
    if client:
        try:
            raw = client.get(key)
            if raw is not None:
                return json.loads(raw)
        except Exception:
            pass

    entry = _memory.get(key)
    if not entry:
        return None
    if time.time() - entry["at"] >= entry["ttl"]:
        _memory.pop(key, None)
        return None
    return entry["value"]


def cache_set(key: str, value: Any, ttl_sec: int) -> None:
    client = _redis()
    if client:
        try:
            client.setex(key, ttl_sec, json.dumps(value))
        except Exception:
            pass
    _memory[key] = {"value": value, "at": time.time(), "ttl": ttl_sec}


def cache_delete(*keys: str) -> None:
    client = _redis()
    if client and keys:
        try:
            client.delete(*keys)
        except Exception:
            pass
    for key in keys:
        _memory.pop(key, None)


def cache_using_redis() -> bool:
    return _redis() is not None