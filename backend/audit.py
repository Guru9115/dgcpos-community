"""
DGC RetailOS — Audit Logging (security + privacy aware)
Every significant write action is recorded in the audit_logs table.
Sensitive fields are redacted before storage.
"""

import json
import re
from functools import wraps
from datetime import datetime

from flask import request, g
from flask_login import current_user

SENSITIVE_KEYS = frozenset({
    'password', 'password_hash', 'current_password', 'new_password', 'confirm',
    'token', 'access_token', 'refresh_token', 'id_token', 'secret', 'api_key',
    'authorization', 'credit_card', 'card_number', 'cvv', 'ssn', 'pin',
    'enrollment_token', 'reset_token', 'shop_logo',
})

EMAIL_RE = re.compile(r'[^@]+@[^@]+\.[^@]+')
PHONE_RE = re.compile(r'\+?\d[\d\s\-()]{7,}\d')


def mask_ip(ip):
    """Mask IP for privacy in owner-facing audit views."""
    if not ip:
        return None
    ip = str(ip).strip()
    if ':' in ip:
        parts = ip.split(':')
        if len(parts) >= 2:
            return f"{parts[0]}:{parts[1]}:****"
        return ip[:6] + '****'
    parts = ip.split('.')
    if len(parts) == 4:
        return f"{parts[0]}.{parts[1]}.xxx.xxx"
    return ip[:4] + '***'


def _mask_email(value):
    if not value or '@' not in str(value):
        return value
    local, domain = str(value).split('@', 1)
    shown = local[:1] if local else '*'
    return f"{shown}***@{domain}"


def sanitize_audit_detail(data):
    """Recursively redact passwords, tokens, and partial-mask PII."""
    if data is None:
        return None
    if isinstance(data, dict):
        out = {}
        for key, val in data.items():
            key_l = str(key).lower()
            if key_l in SENSITIVE_KEYS or 'password' in key_l or 'token' in key_l:
                out[key] = '[REDACTED]'
            else:
                out[key] = sanitize_audit_detail(val)
        return out
    if isinstance(data, list):
        return [sanitize_audit_detail(item) for item in data]
    if isinstance(data, str):
        if EMAIL_RE.search(data):
            return EMAIL_RE.sub(lambda m: _mask_email(m.group(0)), data)
        if PHONE_RE.search(data) and sum(c.isdigit() for c in data) >= 8:
            return '[PHONE_REDACTED]'
    return data


def _current_account_id():
    try:
        if current_user and current_user.is_authenticated:
            return getattr(current_user, 'account_id', None)
    except Exception:
        pass
    return None


def log_audit(action: str, resource: str = None, resource_id: str = None, detail=None):
    """Write one audit log entry. Safe to call from any Flask request context."""
    try:
        from models import db, AuditLog

        user_id = None
        username = 'anonymous'
        try:
            if current_user and current_user.is_authenticated:
                user_id = current_user.id
                username = current_user.username
        except Exception:
            pass

        ip = None
        try:
            ip = request.headers.get('X-Forwarded-For', request.remote_addr)
            if ip and ',' in ip:
                ip = ip.split(',')[0].strip()
        except Exception:
            pass

        safe_detail = sanitize_audit_detail(detail)
        detail_str = None
        if safe_detail is not None:
            if isinstance(safe_detail, (dict, list)):
                detail_str = json.dumps(safe_detail, default=str)
            else:
                detail_str = str(safe_detail)

        entry = AuditLog(
            user_id=user_id,
            username=username,
            account_id=_current_account_id(),
            action=action,
            resource=resource,
            resource_id=str(resource_id) if resource_id is not None else None,
            detail=detail_str,
            ip_address=ip,
            created_at=datetime.utcnow(),
        )
        db.session.add(entry)
    except Exception as exc:
        try:
            import traceback
            print(f'[AUDIT ERROR] {exc}\n{traceback.format_exc()}', flush=True)
        except Exception:
            pass


def log_security_event(action: str, detail=None, *, resource='security', resource_id=None, commit=True):
    """Auto-log security / privacy events (access denied, unauthorized, etc.)."""
    if getattr(g, '_security_audited', False):
        return
    g._security_audited = True
    log_audit(action, resource=resource, resource_id=resource_id, detail=detail)
    if commit:
        try:
            from models import db
            db.session.commit()
        except Exception as exc:
            try:
                from models import db
                db.session.rollback()
                print(f'[AUDIT SECURITY] commit failed: {exc}', flush=True)
            except Exception:
                pass


def audit_action(action: str, resource: str = None):
    """Decorator that logs an audit entry AFTER the wrapped function returns 2xx."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            response = f(*args, **kwargs)
            try:
                if isinstance(response, tuple):
                    _, status = response[0], response[1]
                else:
                    status = 200
                if isinstance(status, int) and 200 <= status < 300:
                    log_audit(action, resource=resource)
            except Exception:
                pass
            return response
        return wrapper
    return decorator