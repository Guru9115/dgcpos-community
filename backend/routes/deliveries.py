"""Delivery Orders — dispatch tracking with status pipeline."""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, DeliveryOrder, DeliveryItem, User
from datetime import datetime

deliveries_bp = Blueprint("deliveries", __name__)


def _me():
    return current_user if current_user.is_authenticated else None


def _next_number():
    last = DeliveryOrder.query.filter(DeliveryOrder.delivery_number.like("DEL-%")) \
               .order_by(DeliveryOrder.id.desc()).with_for_update().first()
    n = 1
    if last:
        try: n = int(last.delivery_number.split("-")[1]) + 1
        except ValueError: pass
    return f"DEL-{n:05d}"


@deliveries_bp.route("/", methods=["GET"])
@token_required
@login_required
def list_deliveries():
    try:
        page     = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 30))
    except (ValueError, TypeError):
        page, per_page = 1, 30
    status   = request.args.get("status", "")
    q        = request.args.get("q", "").strip()

    query = DeliveryOrder.query
    if status:
        query = query.filter(DeliveryOrder.status == status)
    if q:
        query = query.filter(db.or_(
            DeliveryOrder.delivery_number.ilike(f"%{q}%"),
            DeliveryOrder.customer_name.ilike(f"%{q}%"),
            DeliveryOrder.customer_phone.ilike(f"%{q}%"),
        ))
    query = query.order_by(DeliveryOrder.created_at.desc())
    pag = query.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        "deliveries": [d.to_dict(include_items=True) for d in pag.items],
        "total": pag.total, "pages": pag.pages, "page": page,
    })


@deliveries_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_delivery():
    me   = _me()
    data = request.get_json() or {}
    items_data = data.get("items", [])
    if not items_data:
        return jsonify({"error": "At least one item required"}), 400

    d = DeliveryOrder(
        delivery_number  = _next_number(),
        customer_id      = data.get("customer_id"),
        customer_name    = data.get("customer_name"),
        customer_phone   = data.get("customer_phone"),
        delivery_address = data.get("delivery_address"),
        sale_id          = data.get("sale_id"),
        created_by       = me.id if me else None,
        assigned_rider   = data.get("assigned_rider"),
        delivery_charge  = float(data.get("delivery_charge", 0)),
        notes            = data.get("notes"),
        scheduled_date   = data.get("scheduled_date"),
    )
    db.session.add(d)
    db.session.flush()

    for i in items_data:
        db.session.add(DeliveryItem(
            delivery_id = d.id,
            product_id  = i.get("product_id"),
            description = i.get("description", ""),
            qty         = int(i.get("qty", 1)),
        ))

    db.session.commit()
    return jsonify(d.to_dict(include_items=True)), 201


@deliveries_bp.route("/<int:did>", methods=["GET"])
@token_required
@login_required
def get_delivery(did):
    return jsonify(DeliveryOrder.query.get_or_404(did).to_dict(include_items=True))


@deliveries_bp.route("/<int:did>/status", methods=["PUT"])
@token_required
@login_required
def update_status(did):
    d    = DeliveryOrder.query.get_or_404(did)
    data = request.get_json() or {}
    new_status = data.get("status")
    valid = ["pending", "packed", "dispatched", "delivered", "failed", "cancelled"]
    if new_status not in valid:
        return jsonify({"error": f"status must be one of {valid}"}), 400
    d.status = new_status
    if new_status == "dispatched" and not d.dispatched_at:
        d.dispatched_at = datetime.utcnow()
    if new_status == "delivered" and not d.delivered_at:
        d.delivered_at = datetime.utcnow()
    if data.get("assigned_rider"):
        d.assigned_rider = data["assigned_rider"]
    if data.get("notes"):
        d.notes = data["notes"]
    db.session.commit()
    return jsonify(d.to_dict(include_items=True))


@deliveries_bp.route("/<int:did>", methods=["PUT"])
@token_required
@login_required
def update_delivery(did):
    d    = DeliveryOrder.query.get_or_404(did)
    data = request.get_json() or {}
    for field in ["customer_name", "customer_phone", "delivery_address",
                  "assigned_rider", "delivery_charge", "notes", "scheduled_date"]:
        if field in data:
            val = data[field]
            if field == "delivery_charge" and val is not None:
                val = float(val)
            setattr(d, field, val)
    db.session.commit()
    return jsonify(d.to_dict(include_items=True))
