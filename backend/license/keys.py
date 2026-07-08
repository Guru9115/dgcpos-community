"""Signed Enterprise license keys — Ed25519 offline verification."""
from __future__ import annotations

import base64
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

KEY_PREFIX = "DGC-ENT"
_KEY_RE = re.compile(rf"^{re.escape(KEY_PREFIX)}-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$")

# Production verification key (embedded). Override via DGCPOS_LICENSE_PUBLIC_KEY if rotated.
_DEFAULT_PUBLIC_B64 = "ytwf9+fZWRU7jOn2PtuIKvqC3z0TelGEMR3Wbcc9Wgk="


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _load_public_key() -> Ed25519PublicKey:
    raw = (os.environ.get("DGCPOS_LICENSE_PUBLIC_KEY") or "").strip()
    if raw.startswith("-----BEGIN"):
        from cryptography.hazmat.primitives.serialization import load_pem_public_key

        return load_pem_public_key(raw.encode("utf-8"))
    if raw:
        return Ed25519PublicKey.from_public_bytes(_b64url_decode(raw))
    return Ed25519PublicKey.from_public_bytes(base64.b64decode(_DEFAULT_PUBLIC_B64))


def _load_private_key() -> Optional[Ed25519PrivateKey]:
    raw = (os.environ.get("DGCPOS_LICENSE_PRIVATE_KEY") or "").strip()
    if not raw:
        return None
    if raw.startswith("-----BEGIN"):
        from cryptography.hazmat.primitives.serialization import load_pem_private_key

        return load_pem_private_key(raw.encode("utf-8"), password=None)
    return Ed25519PrivateKey.from_private_bytes(_b64url_decode(raw))


def _parse_expiry(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).replace(tzinfo=None)
    text = str(value).strip()
    if text.isdigit():
        return datetime.fromtimestamp(int(text), tz=timezone.utc).replace(tzinfo=None)
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except ValueError:
        return None


def issuer_configured() -> bool:
    return _load_private_key() is not None


def public_key_fingerprint() -> str:
    raw = _load_public_key().public_bytes_raw()
    return _b64url_encode(raw)[:12]


def issue_license_key(
    *,
    customer_id: str,
    expires_at: Optional[datetime] = None,
    max_staff: int = 50,
    features: Optional[list[str]] = None,
) -> str:
    """Create a signed license key (issuer tooling only — requires private key env)."""
    private_key = _load_private_key()
    if private_key is None:
        raise RuntimeError("DGCPOS_LICENSE_PRIVATE_KEY is required to issue keys")

    payload = {
        "v": 1,
        "ed": "enterprise",
        "cid": (customer_id or "").strip() or "unknown",
        "exp": expires_at.isoformat() if expires_at else None,
        "max_staff": max(1, int(max_staff)),
        "features": features or ["enterprise"],
        "iat": datetime.utcnow().isoformat(),
    }
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = private_key.sign(payload_b64.encode("ascii"))
    sig_b64 = _b64url_encode(signature)
    return f"{KEY_PREFIX}-{payload_b64}.{sig_b64}"


def verify_license_key(key: str) -> dict[str, Any]:
    """Validate key signature and expiry. Raises ValueError on failure."""
    text = (key or "").strip()
    match = _KEY_RE.match(text)
    if not match:
        raise ValueError("Invalid license key format")

    payload_b64, sig_b64 = match.group(1), match.group(2)
    public_key = _load_public_key()
    try:
        public_key.verify(_b64url_decode(sig_b64), payload_b64.encode("ascii"))
    except Exception as exc:
        raise ValueError("Invalid license signature") from exc

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("Invalid license payload") from exc

    if payload.get("ed") != "enterprise":
        raise ValueError("License is not an Enterprise edition key")

    expires_at = _parse_expiry(payload.get("exp"))
    if expires_at and datetime.utcnow() > expires_at:
        raise ValueError("License has expired")

    return {
        "valid": True,
        "edition": "enterprise",
        "customer_id": payload.get("cid"),
        "expires_at": expires_at.isoformat() if expires_at else None,
        "max_staff": payload.get("max_staff"),
        "features": payload.get("features") or ["enterprise"],
        "issued_at": payload.get("iat"),
        "key_fingerprint": payload_b64[:12],
    }