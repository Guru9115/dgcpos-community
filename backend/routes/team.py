"""Store owner/manager team IAM — scoped user control within their merchant account."""
from __future__ import annotations

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from auth_utils import token_required, bump_security_epoch
from audit import log_audit
from models import db, User
from user_access_control import (
    APP_MENU_ITEMS,
    enrich_user_dict,
    owner_can_manage_actor,
    set_user_menu_permissions,
    clamp_menu_keys_for_account,
    get_account_allowed_menu_keys,
    get_role_menu_templates_payload,
    reset_user_device,
    normalize_role,
)

STORE_TEAM_ASSIGNABLE = frozenset({"owner", "manager", "sales_staff", "staff", "operations_staff", "engineer"})

team_bp = Blueprint("team", __name__)

TEAM_ROLES = frozenset({"owner", "manager"})


def _require_team_admin():
    if current_user.role not in TEAM_ROLES | {"superadmin"}:
        return jsonify({"error": "Owner or manager only"}), 403
    if current_user.role != "superadmin" and not current_user.account_id:
        return jsonify({"error": "No store linked"}), 400
    return None


def _team_account_id():
    if current_user.role == "superadmin":
        return request.args.get("account_id", type=int) or current_user.account_id
    return current_user.account_id


def _load_target(uid: int):
    user = User.query.get_or_404(uid)
    if current_user.role != "superadmin":
        if user.account_id != current_user.account_id:
            return None, (jsonify({"error": "Forbidden"}), 403)
        if not owner_can_manage_actor(current_user, user):
            return None, (jsonify({"error": "Forbidden"}), 403)
    return user, None


@team_bp.route("/context", methods=["GET"])
@token_required
@login_required
def team_context():
    denied = _require_team_admin()
    if denied:
        return denied
    aid = _team_account_id()
    allowed = get_account_allowed_menu_keys(aid)
    items = APP_MENU_ITEMS
    if allowed is not None:
        allowed_set = set(allowed)
        items = [m for m in APP_MENU_ITEMS if m["key"] in allowed_set]
    return jsonify({
        "menu_items": items,
        "account_menu_permissions": allowed,
        "role_templates": get_role_menu_templates_payload(),
        "can_manage_all_roles": current_user.role == "owner",
    })


@team_bp.route("/users/<int:uid>", methods=["GET"])
@token_required
@login_required
def team_user_detail(uid):
    denied = _require_team_admin()
    if denied:
        return denied
    user, err = _load_target(uid)
    if err:
        return err
    return jsonify({"user": enrich_user_dict(user)})


@team_bp.route("/users/<int:uid>", methods=["PUT"])
@token_required
@login_required
def team_user_update(uid):
    denied = _require_team_admin()
    if denied:
        return denied
    user, err = _load_target(uid)
    if err:
        return err
    data = request.get_json(silent=True) or {}

    if "role" in data and current_user.role == "owner":
        role = normalize_role(data["role"])
        if role == "superadmin":
            return jsonify({"error": "Invalid role"}), 400
        if role not in STORE_TEAM_ASSIGNABLE:
            return jsonify({"error": "Invalid role"}), 400
        if current_user.role == "manager" and role in ("owner", "manager"):
            return jsonify({"error": "Managers cannot assign owner/manager roles"}), 403
        user.role = role

    for field in ("full_name", "email"):
        if field in data:
            setattr(user, field, data[field])

    if "is_active" in data and current_user.role in ("owner", "superadmin"):
        active = bool(data["is_active"])
        user.is_active = active
        if not active:
            bump_security_epoch(user)
        else:
            user.failed_login_count = 0
            user.locked_until = None

    if "menu_permissions" in data:
        keys = clamp_menu_keys_for_account(user.account_id, data.get("menu_permissions"))
        set_user_menu_permissions(user.id, user.account_id, keys)

    log_audit(
        "team.user_update",
        resource="user",
        resource_id=str(user.id),
        detail={"by": current_user.username, "account_id": user.account_id},
    )
    db.session.commit()
    return jsonify({"user": enrich_user_dict(user)})


@team_bp.route("/users/<int:uid>/reset-password", methods=["POST"])
@token_required
@login_required
def team_reset_password(uid):
    denied = _require_team_admin()
    if denied:
        return denied
    user, err = _load_target(uid)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    password = (data.get("password") or "").strip()
    if len(password) < 8:
        return jsonify({"error": "Password min 8 characters"}), 400
    user.set_password(password)
    user.must_change_password = bool(data.get("must_change_password", True))
    bump_security_epoch(user)
    log_audit("team.user_password_reset", resource="user", resource_id=str(user.id))
    db.session.commit()
    return jsonify({"message": "Password reset", "must_change_password": user.must_change_password})


@team_bp.route("/users/<int:uid>/reset-device", methods=["POST"])
@token_required
@login_required
def team_reset_device(uid):
    denied = _require_team_admin()
    if denied:
        return denied
    user, err = _load_target(uid)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    reset_user_device(user, force_password_change=bool(data.get("force_password_change", False)))
    log_audit("team.user_device_reset", resource="user", resource_id=str(user.id))
    db.session.commit()
    return jsonify({"message": "Device sessions cleared"})


@team_bp.route("/users/<int:uid>/status", methods=["PUT"])
@token_required
@login_required
def team_user_status(uid):
    denied = _require_team_admin()
    if denied:
        return denied
    if uid == current_user.id:
        return jsonify({"error": "Cannot change your own status"}), 400
    user, err = _load_target(uid)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    if "is_active" not in data:
        return jsonify({"error": "is_active is required"}), 400
    active = bool(data["is_active"])
    user.is_active = active
    if active:
        user.failed_login_count = 0
        user.locked_until = None
    else:
        bump_security_epoch(user)
    log_audit(
        "team.user_status",
        resource="user",
        resource_id=str(user.id),
        detail={"is_active": active},
    )
    db.session.commit()
    return jsonify({"user": enrich_user_dict(user)})