from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, CashierSession, Sale
from sqlalchemy import func
from datetime import datetime

cashier_sessions_bp = Blueprint("cashier_sessions", __name__)


@cashier_sessions_bp.route("/active", methods=["GET"])
@token_required
@login_required
def get_active_session():
    session = CashierSession.query.filter_by(
        cashier_id=current_user.id, status="open"
    ).order_by(CashierSession.opened_at.desc()).first()
    if not session:
        return jsonify({"session": None})
    # Add live sales count for this session
    d = session.to_dict()
    d["sales_count"] = Sale.query.filter(
        Sale.cashier_id == current_user.id,
        Sale.sale_date >= session.opened_at,
        Sale.status == "completed",
    ).count()
    d["sales_total"] = float(
        db.session.query(func.sum(Sale.total)).filter(
            Sale.cashier_id == current_user.id,
            Sale.sale_date >= session.opened_at,
            Sale.status == "completed",
        ).scalar() or 0
    )
    return jsonify({"session": d})


@cashier_sessions_bp.route("/open", methods=["POST"])
@token_required
@login_required
def open_session():
    existing = CashierSession.query.filter_by(
        cashier_id=current_user.id, status="open"
    ).first()
    if existing:
        return jsonify({"error": "Session already open", "session": existing.to_dict()}), 409

    data = request.get_json() or {}
    session = CashierSession(
        cashier_id=current_user.id,
        opening_cash=data.get("opening_cash", 0),
        notes=data.get("notes", ""),
        status="open",
    )
    db.session.add(session)
    db.session.commit()
    return jsonify(session.to_dict()), 201


@cashier_sessions_bp.route("/<int:sid>/close", methods=["PUT"])
@token_required
@login_required
def close_session(sid):
    session = CashierSession.query.get_or_404(sid)
    if session.cashier_id != current_user.id and current_user.role not in ["owner", "manager", "superadmin"]:
        return jsonify({"error": "Forbidden"}), 403
    if session.status != "open":
        return jsonify({"error": "Session is not open"}), 400

    data = request.get_json() or {}
    session.closing_cash = data.get("closing_cash", 0)
    session.notes        = data.get("notes") or session.notes or ""
    session.closed_at    = datetime.utcnow()
    session.status       = "closed"
    db.session.commit()
    return jsonify(session.to_dict())


@cashier_sessions_bp.route("/", methods=["GET"])
@token_required
@login_required
def list_sessions():
    if current_user.role not in ["owner", "manager", "superadmin"]:
        return jsonify({"error": "Forbidden"}), 403
    page    = request.args.get("page", 1, type=int)
    cashier = request.args.get("cashier_id", type=int)
    q = CashierSession.query
    if cashier:
        q = q.filter_by(cashier_id=cashier)
    sessions = q.order_by(CashierSession.opened_at.desc()).paginate(
        page=page, per_page=50, error_out=False
    )
    return jsonify({
        "sessions": [s.to_dict() for s in sessions.items],
        "total":    sessions.total,
        "pages":    sessions.pages,
    })
