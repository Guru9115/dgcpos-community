"""Alterations / Repairs — job tracking for garment alterations."""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Alteration, User
from datetime import datetime

alterations_bp = Blueprint("alterations", __name__)


def _me():
    return current_user if current_user.is_authenticated else None


def _next_number():
    last = Alteration.query.filter(Alteration.job_number.like("ALT-%")) \
               .order_by(Alteration.id.desc()).with_for_update().first()
    n = 1
    if last:
        try: n = int(last.job_number.split("-")[1]) + 1
        except ValueError: pass
    return f"ALT-{n:05d}"


@alterations_bp.route("/", methods=["GET"])
@token_required
@login_required
def list_alterations():
    try:
        page     = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 30))
    except (ValueError, TypeError):
        page, per_page = 1, 30
    status   = request.args.get("status", "")
    q        = request.args.get("q", "").strip()

    query = Alteration.query
    if status:
        query = query.filter(Alteration.status == status)
    if q:
        query = query.filter(db.or_(
            Alteration.job_number.ilike(f"%{q}%"),
            Alteration.customer_name.ilike(f"%{q}%"),
            Alteration.customer_phone.ilike(f"%{q}%"),
            Alteration.garment_desc.ilike(f"%{q}%"),
        ))
    query = query.order_by(Alteration.created_at.desc())
    pag = query.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        "alterations": [a.to_dict() for a in pag.items],
        "total": pag.total, "pages": pag.pages, "page": page,
    })


@alterations_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_alteration():
    me   = _me()
    data = request.get_json() or {}
    if not data.get("garment_desc"):
        return jsonify({"error": "garment_desc required"}), 400
    a = Alteration(
        job_number      = _next_number(),
        customer_id     = data.get("customer_id"),
        customer_name   = data.get("customer_name"),
        customer_phone  = data.get("customer_phone"),
        garment_desc    = data["garment_desc"],
        work_description= data.get("work_description"),
        measurements    = data.get("measurements"),
        assigned_to     = data.get("assigned_to"),
        created_by      = me.id if me else None,
        charge          = float(data.get("charge", 0)),
        paid_amount     = float(data.get("paid_amount", 0)),
        payment_method  = data.get("payment_method", "cash"),
        priority        = data.get("priority", "normal"),
        due_date        = data.get("due_date"),
        notes           = data.get("notes"),
    )
    db.session.add(a)
    db.session.commit()
    return jsonify(a.to_dict()), 201


@alterations_bp.route("/<int:aid>", methods=["GET"])
@token_required
@login_required
def get_alteration(aid):
    return jsonify(Alteration.query.get_or_404(aid).to_dict())


@alterations_bp.route("/<int:aid>", methods=["PUT"])
@token_required
@login_required
def update_alteration(aid):
    a    = Alteration.query.get_or_404(aid)
    data = request.get_json() or {}
    for field in ["garment_desc", "work_description", "measurements", "assigned_to",
                  "charge", "paid_amount", "payment_method", "priority", "due_date", "notes"]:
        if field in data:
            val = data[field]
            if field in ("charge", "paid_amount") and val is not None:
                val = float(val)
            setattr(a, field, val)
    if "status" in data:
        a.status = data["status"]
        if data["status"] == "delivered" and not a.delivered_at:
            a.delivered_at = datetime.utcnow()
    db.session.commit()
    return jsonify(a.to_dict())


@alterations_bp.route("/<int:aid>/status", methods=["PUT"])
@token_required
@login_required
def update_status(aid):
    a    = Alteration.query.get_or_404(aid)
    data = request.get_json() or {}
    new_status = data.get("status")
    valid = ["received", "in_progress", "ready", "delivered", "cancelled"]
    if new_status not in valid:
        return jsonify({"error": f"status must be one of {valid}"}), 400
    a.status = new_status
    if new_status == "delivered" and not a.delivered_at:
        a.delivered_at = datetime.utcnow()
    db.session.commit()
    return jsonify(a.to_dict())
