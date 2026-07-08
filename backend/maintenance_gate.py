"""Request-level maintenance gates for site kill switches."""
from flask import request, jsonify, current_app

from platform_modules import module_enabled, get_maintenance_message, site_app_available_for_user

_EXEMPT_PREFIXES = (
    "/api/health",
    "/api/platform-status",
    "/api/mobile-release",
    "/api/admin",
)

_AUTH_PREFIX = "/api/auth"

# Auth paths still reachable when app is OFF (admin host + superadmin only)
_AUTH_ALLOWED_APP_OFF = frozenset({
    "/api/auth/login",
    "/api/auth/me",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/change-password",
    "/api/auth/force-change-password",
})


def _request_from_admin_host() -> bool:
    for header in ("Origin", "Referer"):
        val = request.headers.get(header) or ""
        if "admin.dgcpos.net" in val:
            return True
    return False


def _role_from_bearer():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        import jwt
        from models import User, db
        data = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
        if data.get("type") not in (None, "access"):
            return None
        user = db.session.get(User, int(data["sub"]))
        if not user or not user.is_active:
            return None
        return user.role
    except Exception:
        return None


def maintenance_response():
    return jsonify({
        "error": get_maintenance_message(),
        "maintenance": True,
        "code": "platform_maintenance",
    }), 503


def check_request_maintenance():
    path = request.path or ""
    if not path.startswith("/api"):
        return None
    for prefix in _EXEMPT_PREFIXES:
        if path.startswith(prefix):
            return None

    if path.startswith("/api/marketplace/public") or path.startswith("/api/hospitality/public"):
        if not module_enabled("site_bazaar"):
            return maintenance_response()
        return None

    if not module_enabled("site_app"):
        from_admin = _request_from_admin_host()
        role = _role_from_bearer()

        if path.startswith(_AUTH_PREFIX):
            if not from_admin:
                return maintenance_response()
            if path not in _AUTH_ALLOWED_APP_OFF:
                return maintenance_response()
            return None

        if from_admin and site_app_available_for_user(role):
            return None

        return maintenance_response()

    return None


def login_allowed_when_app_off(username: str) -> bool:
    """Only superadmin may authenticate while app.dgcpos.net is offline."""
    from models import User
    user = User.query.filter(
        (User.username == username) | (User.email == username),
        User.is_active == True,
    ).first()
    return bool(user and user.role == "superadmin")