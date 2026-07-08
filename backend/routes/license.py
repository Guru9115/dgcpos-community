"""Enterprise license activation API (Phase P5)."""
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from auth_utils import token_required
from edition import edition_public_payload

license_bp = Blueprint("license", __name__)


def _account_id_for_user():
    if current_user.role == "superadmin":
        data = request.get_json(silent=True) or {}
        return data.get("account_id")
    return getattr(current_user, "account_id", None)


@license_bp.route("/status", methods=["GET"])
def license_status():
    from license.verify import get_public_license_status

    payload = {
        **edition_public_payload(),
        **get_public_license_status(),
    }
    resp = jsonify(payload)
    resp.headers["Cache-Control"] = "public, max-age=60"
    return resp


@license_bp.route("/activate", methods=["POST"])
@token_required
@login_required
def license_activate():
    if current_user.role not in ("owner", "superadmin"):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json() or {}
    key = (data.get("key") or "").strip()
    if not key:
        return jsonify({"error": "License key is required"}), 400

    from license.verify import activate_license

    try:
        status = activate_license(key, account_id=_account_id_for_user())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"message": "Enterprise license activated", **status})


@license_bp.route("/deactivate", methods=["POST"])
@token_required
@login_required
def license_deactivate():
    if current_user.role not in ("owner", "superadmin"):
        return jsonify({"error": "Forbidden"}), 403

    from license.verify import deactivate_license, get_public_license_status

    try:
        deactivate_license(account_id=_account_id_for_user())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"message": "License removed", **get_public_license_status(force_refresh=True)})