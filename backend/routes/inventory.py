from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Product, InventoryMovement, Purchase, PurchaseItem, Supplier
from sqlalchemy import insert
from datetime import datetime

inventory_bp = Blueprint("inventory", __name__)

@inventory_bp.route("/movements", methods=["GET"])
@token_required
@login_required
def get_movements():
    product_id = request.args.get("product_id")
    movement_type = request.args.get("type")
    page = int(request.args.get("page",1))
    per_page = int(request.args.get("per_page",50))
    query = InventoryMovement.query.join(Product, InventoryMovement.product_id == Product.id)
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    if product_id: query = query.filter_by(product_id=int(product_id))
    if movement_type: query = query.filter_by(movement_type=movement_type)
    total = query.count()
    movements = query.order_by(InventoryMovement.created_at.desc()).offset((page-1)*per_page).limit(per_page).all()
    return jsonify({"movements":[m.to_dict() for m in movements],"total":total})

@inventory_bp.route("/adjust", methods=["POST"])
@token_required
@login_required
def adjust_stock():
    if current_user.role not in ["owner","manager"]:
        return jsonify({"error":"Forbidden"}),403
    data = request.get_json()
    query = Product.query.filter_by(id=data["product_id"])
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    p = query.first()
    if not p:
        return jsonify({"error":"Product not found"}), 404
    qty_before = p.stock_qty
    if "new_qty" in data:
        new_qty = int(data["new_qty"])
        qty_change = new_qty - qty_before
    else:
        qty_change = int(data.get("qty_change", 0))
        new_qty = qty_before + qty_change
    p.stock_qty = new_qty
    db.session.execute(
        insert(InventoryMovement).values(
            product_id=p.id,
            movement_type="adjustment",
            qty_before=qty_before,
            qty_change=qty_change,
            qty_after=new_qty,
            notes=data.get("notes","Manual adjustment"),
            created_by=current_user.id,
            created_at=datetime.utcnow()
        )
    )
    db.session.commit()
    return jsonify(p.to_dict())

@inventory_bp.route("/low-stock", methods=["GET"])
@token_required
@login_required
def low_stock():
    query = Product.query.filter(
        Product.stock_qty <= Product.reorder_level,
        Product.status == "active"
    )
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    products = query.all()
    return jsonify([p.to_dict() for p in products])

@inventory_bp.route("/valuation", methods=["GET"])
@token_required
@login_required
def valuation():
    query = Product.query.filter_by(status="active")
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    products = query.all()
    items = []
    total_cost = total_retail = 0
    for p in products:
        cost_val = float(p.cost_price or 0) * p.stock_qty
        retail_val = float(p.selling_price or 0) * p.stock_qty
        total_cost += cost_val
        total_retail += retail_val
        items.append({**p.to_dict(), "cost_value": cost_val, "retail_value": retail_val})
    return jsonify({"items":items,"total_cost_value":total_cost,"total_retail_value":total_retail,"potential_profit":total_retail-total_cost})

@inventory_bp.route("/purchases", methods=["GET"])
@token_required
@login_required
def get_purchases():
    query = Purchase.query
    if current_user.role != "superadmin":
        query = query.filter(Purchase.account_id == current_user.account_id)
    purchases = query.order_by(Purchase.purchase_date.desc()).all()
    return jsonify([p.to_dict() for p in purchases])

@inventory_bp.route("/purchases", methods=["POST"])
@token_required
@login_required
def create_purchase():
    data = request.get_json()
    from datetime import datetime
    import random, string
    ref = "PO" + datetime.utcnow().strftime("%Y%m%d") + "".join(random.choices(string.digits,k=4))
    purchase = Purchase(ref_number=ref, supplier_id=data.get("supplier_id"),
        notes=data.get("notes"), status="received")
    db.session.add(purchase)
    db.session.flush()
    total = 0
    for item in data.get("items",[]):
        product_query = Product.query.filter_by(id=item["product_id"])
        if current_user.role != "superadmin":
            product_query = product_query.filter(Product.account_id == current_user.account_id)
        p = product_query.first()
        if not p:
            db.session.rollback()
            return jsonify({"error": f"Product {item.get('product_id')} not found"}), 404
        qty = int(item["qty"])
        cost = float(item["unit_cost"])
        item_total = qty * cost
        total += item_total
        pi = PurchaseItem(purchase_id=purchase.id, product_id=p.id, qty=qty, unit_cost=cost, total=item_total)
        db.session.add(pi)
        qty_before = p.stock_qty
        p.stock_qty += qty
        if data.get("update_cost"): p.cost_price = cost
        db.session.execute(
            insert(InventoryMovement).values(
                product_id=p.id,
                movement_type="purchase",
                qty_before=qty_before,
                qty_change=qty,
                qty_after=p.stock_qty,
                reference_id=purchase.id,
                reference_type="purchase",
                created_by=current_user.id,
                created_at=datetime.utcnow()
            )
        )
    purchase.total = total
    db.session.commit()
    return jsonify(purchase.to_dict(include_items=True)), 201


@inventory_bp.route("/stock-take", methods=["GET"])
@token_required
@login_required
def get_stock_take():
    """Returns all active products with current stock for manual counting."""
    from sqlalchemy import asc
    query = Product.query.filter_by(status="active")
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    products = query.order_by(asc(Product.name)).all()
    return jsonify([{
        "id":           p.id,
        "name":         p.name,
        "sku":          p.sku,
        "barcode":      p.barcode,
        "category_name":p.category.name if p.category else None,
        "system_qty":   p.stock_qty,
        "unit":         p.unit,
    } for p in products])


@inventory_bp.route("/stock-take", methods=["POST"])
@token_required
@login_required
def submit_stock_take():
    """
    Reconcile counted quantities against system stock.
    Body: { items: [{product_id, counted_qty}], notes }
    Creates adjustment movements for every discrepancy.
    """
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    d     = request.get_json() or {}
    items = d.get("items", [])
    notes = d.get("notes", "Stock take reconciliation")
    adjustments = 0

    for item in items:
        product_query = Product.query.filter_by(id=item.get("product_id"))
        if current_user.role != "superadmin":
            product_query = product_query.filter(Product.account_id == current_user.account_id)
        p = product_query.first()
        if not p:
            continue
        counted = int(item.get("counted_qty", p.stock_qty))
        diff    = counted - p.stock_qty
        if diff == 0:
            continue
        old_qty = p.stock_qty
        p.stock_qty = counted
        db.session.execute(
            insert(InventoryMovement).values(
                product_id=p.id,
                movement_type="adjustment",
                qty_before=old_qty,
                qty_change=diff,
                qty_after=counted,
                notes=notes,
                created_by=current_user.id,
                created_at=datetime.utcnow()
            )
        )
        adjustments += 1

    db.session.commit()
    return jsonify({"adjustments": adjustments, "message": f"{adjustments} products adjusted"})
