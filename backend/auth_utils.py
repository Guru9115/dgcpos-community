"""Shared JWT auth, session revocation, and route decorators."""
from flask import request, current_app, jsonify
from flask_login import login_user, current_user
from models import db, User, AuthToken, Expense
from functools import wraps
from datetime import datetime, timedelta
import jwt

ACCESS_TOKEN_HOURS = int(__import__("os").environ.get("ACCESS_TOKEN_HOURS", "1"))


def user_security_epoch(user) -> int:
    return int(getattr(user, "security_epoch", None) or 0)


def bump_security_epoch(user, *, commit: bool = False) -> int:
    """Invalidate all outstanding access JWTs and refresh tokens for this user."""
    user.security_epoch = user_security_epoch(user) + 1
    AuthToken.query.filter_by(user_id=user.id).delete()
    if commit:
        db.session.commit()
    return user.security_epoch


def revoke_account_sessions(account_id: int, *, commit: bool = False) -> int:
    """Invalidate sessions for every user on a merchant account."""
    if not account_id:
        return 0
    count = 0
    for user in User.query.filter_by(account_id=account_id).all():
        bump_security_epoch(user)
        count += 1
    if commit:
        db.session.commit()
    return count


def make_access_token(user, hours: int | None = None):
    hrs = ACCESS_TOKEN_HOURS if hours is None else hours
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "type": "access",
        "sec": user_security_epoch(user),
        "exp": datetime.utcnow() + timedelta(hours=hrs),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def make_refresh_token_record(user):
    """Create a DB-backed refresh token and return the plaintext."""
    plaintext, _record = AuthToken.create_for_user(user, "refresh", hours=24 * 30)
    return plaintext


def _decode_access_token(token: str) -> dict:
    data = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
    if data.get("type") not in (None, "access"):
        raise jwt.InvalidTokenError("Invalid token type")
    return data


def authenticate_bearer_token(*, required: bool = True):
    """
    Parse Authorization Bearer JWT, validate epoch, login user.
    Returns None on success, or (response, status) on failure.
    If required=False and no bearer header, returns None without error.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        if required:
            return jsonify({"error": "Authentication required"}), 401
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return jsonify({"error": "Authentication required"}), 401

    try:
        data = _decode_access_token(token)
        user = db.session.get(User, int(data["sub"]))
        if not user or not user.is_active:
            return jsonify({"error": "Invalid token"}), 401
        token_sec = int(data.get("sec", 0) or 0)
        if token_sec != user_security_epoch(user):
            return jsonify({
                "error": "Session expired — please sign in again",
                "code": "session_revoked",
            }), 401
        login_user(user)
    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Token expired — please log in again"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid token"}), 401
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid token"}), 401

    return None


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        had_bearer = request.headers.get("Authorization", "").startswith("Bearer ")
        if had_bearer:
            err = authenticate_bearer_token(required=True)
            if err:
                return err
        return f(*args, **kwargs)
    return decorated


def subscription_required(f):
    """Block access when the account subscription is inactive (owners only)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({"error": "Authentication required"}), 401
        if current_user.role == "superadmin":
            return f(*args, **kwargs)
        account = current_user.account
        if account and not account.subscription_active():
            return jsonify({
                "error": "Subscription inactive",
                "code": "subscription_inactive",
                "account": account.to_dict(),
            }), 402
        return f(*args, **kwargs)
    return decorated


def load_account_object(model, object_id, account_attr="account_id"):
    obj = model.query.get(object_id)
    if not obj:
        return None
    if current_user.role == "superadmin":
        return obj
    if getattr(obj, account_attr, None) != getattr(current_user, "account_id", None):
        return None
    return obj


def account_filter(query, model):
    if current_user.role == "superadmin":
        return query
    if not hasattr(model, "account_id"):
        return query
    account_id = getattr(current_user, "account_id", None)
    if account_id is None:
        return query
    return query.filter(getattr(model, "account_id") == account_id)


def created_by_tenant_filter(model):
    """Scope rows to the current store via created_by → user.account_id."""
    q = model.query
    if current_user.role == "superadmin":
        return q
    account_id = getattr(current_user, "account_id", None)
    if account_id is None:
        return q
    if not hasattr(model, "created_by"):
        return q
    return q.filter(
        model.created_by.in_(
            db.session.query(User.id).filter(User.account_id == account_id)
        )
    )


def expenses_for_tenant():
    """Scope expenses to the current store via created_by → user.account_id."""
    return created_by_tenant_filter(Expense)


def require_roles(*roles):
    """Restrict endpoint to users with one of the given roles (superadmin always allowed)."""
    allowed = set(roles)

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({"error": "Authentication required"}), 401
            if current_user.role == "superadmin":
                return f(*args, **kwargs)
            try:
                from user_access_control import expand_roles_for_check
                expanded = expand_roles_for_check(*allowed)
            except ImportError:
                expanded = allowed
            if current_user.role not in expanded:
                return jsonify({"error": "Insufficient permissions"}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator