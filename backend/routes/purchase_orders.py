"""Purchase Orders API — formal PO workflow: draft → sent → received."""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, PurchaseOrder, PurchaseOrderItem, Product, ProductVariant, InventoryMovement
from sqlalchemy import insert
from datetime import datetime
from datetime import date
from sqlalchemy import desc

purchase_orders_bp = Blueprint("purchase_orders", __name__)


def _next_po_number():
    last = PurchaseOrder.query.order_by(desc(PurchaseOrder.id)).first()
    num = (last.id + 1) if last else 1
    return f"PO-{num:05d}"


@purchase_orders_bp.route("/", methods=["GET"])
@token_required
@login_required
def list_pos():
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    page    = int(request.args.get("page", 1))
    per_page= int(request.args.get("per_page", 20))
    status  = request.args.get("status")
    q       = request.args.get("q", "").strip()

    query = PurchaseOrder.query
    if status:
        query = query.filter(PurchaseOrder.status == status)
    if q:
        query = query.filter(PurchaseOrder.po_number.ilike(f"%{q}%"))
    query  = query.order_by(desc(PurchaseOrder.created_at))
    paged  = query.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        "pos":   [po.to_dict() for po in paged.items],
        "total": paged.total,
        "pages": paged.pages,
        "page":  page,
    })


@purchase_orders_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_po():
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    d = request.get_json() or {}
    items_data = d.get("items", [])
    if not items_data:
        return jsonify({"error": "At least one item required"}), 400

    po = PurchaseOrder(
        po_number     = _next_po_number(),
        supplier_id   = d.get("supplier_id"),
        created_by    = current_user.id,
        status        = "draft",
        order_date    = date.fromisoformat(d["order_date"]) if d.get("order_date") else date.today(),
        expected_date = date.fromisoformat(d["expected_date"]) if d.get("expected_date") else None,
        notes         = d.get("notes"),
    )
    db.session.add(po)
    db.session.flush()  # get po.id

    total = 0
    for item in items_data:
        unit_cost = float(item.get("unit_cost", 0))
        qty       = int(item.get("qty_ordered", 1))
        poi = PurchaseOrderItem(
            po_id        = po.id,
            product_id   = item.get("product_id"),
            variant_id   = item.get("variant_id"),
            qty_ordered  = qty,
            qty_received = 0,
            unit_cost    = unit_cost,
        )
        db.session.add(poi)
        total += unit_cost * qty

    po.total_amount = total
    db.session.commit()
    return jsonify(po.to_dict(include_items=True)), 201


@purchase_orders_bp.route("/<int:po_id>", methods=["GET"])
@token_required
@login_required
def get_po(po_id):
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    po = PurchaseOrder.query.get_or_404(po_id)
    return jsonify(po.to_dict(include_items=True))


@purchase_orders_bp.route("/<int:po_id>", methods=["PUT"])
@token_required
@login_required
def update_po(po_id):
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status not in ("draft",):
        return jsonify({"error": "Only draft POs can be edited"}), 400
    d = request.get_json() or {}
    if "supplier_id"   in d: po.supplier_id   = d["supplier_id"]
    if "expected_date" in d: po.expected_date = date.fromisoformat(d["expected_date"]) if d["expected_date"] else None
    if "notes"         in d: po.notes         = d["notes"]
    db.session.commit()
    return jsonify(po.to_dict())


@purchase_orders_bp.route("/<int:po_id>/send", methods=["PUT"])
@token_required
@login_required
def send_po(po_id):
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status != "draft":
        return jsonify({"error": "Only draft POs can be sent"}), 400
    po.status = "sent"
    db.session.commit()
    return jsonify(po.to_dict())


@purchase_orders_bp.route("/<int:po_id>/receive", methods=["PUT"])
@token_required
@login_required
def receive_po(po_id):
    """Receive items — updates stock for each item, marks PO received/partial."""
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status not in ("sent", "partial"):
        return jsonify({"error": "PO must be in sent or partial status to receive"}), 400

    d = request.get_json() or {}
    received_items = {int(k): int(v) for k, v in d.get("received", {}).items()}

    for item in po.items:
        qty = received_items.get(item.id, 0)
        if qty <= 0:
            continue
        item.qty_received += qty
        # Update stock
        if item.variant_id:
            v = ProductVariant.query.get(item.variant_id)
            if v:
                v.stock_qty += qty
        elif item.product_id:
            p = Product.query.get(item.product_id)
            if p:
                p.stock_qty += qty
                db.session.execute(
                    insert(InventoryMovement).values(
                        product_id=p.id,
                        movement_type="purchase",
                        qty_before=p.stock_qty - qty,
                        qty_change=qty,
                        qty_after=p.stock_qty,
                        notes=f"Received from PO {po.po_number}",
                        created_by=current_user.id,
                        created_at=datetime.utcnow()
                    )
                )

    # Determine PO status
    all_received = all(i.qty_received >= i.qty_ordered for i in po.items)
    po.status = "received" if all_received else "partial"
    if all_received:
        po.received_date = date.today()

    db.session.commit()
    return jsonify(po.to_dict(include_items=True))


@purchase_orders_bp.route("/<int:po_id>/cancel", methods=["PUT"])
@token_required
@login_required
def cancel_po(po_id):
    if current_user.role not in ("owner", "superadmin"):
        return jsonify({"error": "Forbidden"}), 403
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status in ("received",):
        return jsonify({"error": "Cannot cancel a received PO"}), 400
    po.status = "cancelled"
    db.session.commit()
    return jsonify(po.to_dict())
