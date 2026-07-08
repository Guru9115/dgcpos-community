"""Audit log read-only API — tenant-scoped, owner/superadmin only."""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from audit import log_security_event
from models import db, AuditLog, User
from sqlalchemy import or_

audit_bp = Blueprint('audit', __name__)

SENSITIVE_AUDIT_PREFIXES = (
    '/api/payables',
    '/api/audit',
    '/api/admin',
    '/api/settings',
    '/api/auth/users',
    '/api/finance',
)


def _audit_logs_for_tenant():
    """Privacy: owners only see their store's audit trail."""
    q = AuditLog.query
    if current_user.role == 'superadmin':
        return q
    account_id = getattr(current_user, 'account_id', None)
    if account_id is None:
        return q.filter(AuditLog.user_id == current_user.id)
    tenant_user_ids = db.session.query(User.id).filter(User.account_id == account_id)
    return q.filter(
        or_(
            AuditLog.account_id == account_id,
            AuditLog.user_id.in_(tenant_user_ids),
        )
    )


@audit_bp.route('/', methods=['GET'])
@token_required
@login_required
def get_audit_logs():
    if current_user.role not in ['owner', 'superadmin']:
        log_security_event(
            'security.audit_denied',
            detail={'path': request.path, 'role': current_user.role},
        )
        return jsonify({'error': 'Forbidden'}), 403

    page = int(request.args.get('page', 1))
    per_page = min(int(request.args.get('per_page', 50)), 200)
    action = request.args.get('action')
    username = request.args.get('username')
    category = (request.args.get('category') or '').strip().lower()

    q = _audit_logs_for_tenant()
    if category == 'security':
        q = q.filter(AuditLog.action.ilike('security.%'))
    elif category == 'payables':
        q = q.filter(AuditLog.action.ilike('payables.%'))
    if action:
        q = q.filter(AuditLog.action.ilike(f'%{action}%'))
    if username:
        q = q.filter(AuditLog.username.ilike(f'%{username}%'))

    total = q.count()
    logs = (
        q.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    mask = current_user.role != 'superadmin'
    return jsonify({
        'logs': [l.to_dict(mask_ip=mask) for l in logs],
        'total': total,
        'page': page,
        'per_page': per_page,
        'privacy': {
            'tenant_scoped': current_user.role != 'superadmin',
            'ip_masked': mask,
            'pii_redacted': True,
        },
    })