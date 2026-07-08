"""Verify Google ID tokens for Sign in with Google."""
import json
import urllib.error
import urllib.parse
import urllib.request

from flask import current_app


def verify_google_id_token(id_token):
    """
    Verify a Google ID token via Google's tokeninfo endpoint.
    Returns (payload_dict, error_message).
    """
    client_id = current_app.config.get("GOOGLE_CLIENT_ID", "")
    if not client_id:
        return None, "Google sign-in is not configured"

    if not id_token or not id_token.strip():
        return None, "Google credential is required"

    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(id_token.strip())}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError:
        return None, "Invalid Google credential"
    except Exception:
        return None, "Could not verify Google credential"

    if payload.get("aud") != client_id:
        return None, "Google credential audience mismatch"

    if payload.get("email_verified") not in ("true", True):
        return None, "Google email is not verified"

    email = (payload.get("email") or "").strip().lower()
    if not email:
        return None, "Google account email is required"

    return {
        "email": email,
        "google_id": payload.get("sub"),
        "full_name": payload.get("name") or email.split("@")[0].title(),
        "picture": payload.get("picture"),
    }, None