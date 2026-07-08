"""
Returns & Exchanges — create return from original sale, restock items.
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Sale, SaleItem, Product, InventoryMovement, User
from sqlalchemy import insert
from datetime import datetime

returns_bp = Blueprint("returns", __name__)


def _current_user():
    return current_user if current_user.is_authenticated else None


@returns_bp.route("/", methods=["GET"])
@token_required
@login_required
def list_returns():
    try:
        page     = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 20))
    except (ValueError, TypeError):
        page, per_page = 1, 20
    q        = request.args.get("q", "").strip()

    query = Sale.query.filter(Sale.status.in_(["refunded", "partial_refund"]))
    if q:
        query = query.filter(Sale.invoice_number.ilike(f"%{q}%"))
    query = query.order_by(Sale.sale_date.desc())
    pag   = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "returns":  [s.to_dict(include_items=True) for s in pag.items],
        "total":    pag.total,
        "pages":    pag.pages,
        "page":     page,
    })


@returns_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_return():
    """
    Body: { original_sale_id, items: [{sale_item_id, return_qty, reason}],
            refund_method, notes }
    Creates a new Sale with status=refunded and restocks items.
    """
    me   = _current_user()
    data = request.get_json() or {}

    original_id = data.get("original_sale_id")
    if not original_id:
        return jsonify({"error": "original_sale_id required"}), 400

    query = Sale.query.filter_by(id=original_id)
    if current_user.role != "superadmin":
        query = query.filter(Sale.account_id == current_user.account_id)
    original = query.first()
    if not original:
        return jsonify({"error": "Original sale not found"}), 404
    if original.status == "refunded":
        return jsonify({"error": "Sale already fully refunded"}), 400

    # Build a map of already-returned qty per sale_item_id from prior RET- sales
    already_returned = {}
    prior_returns = Sale.query.filter(
        Sale.invoice_number.like("RET-%"),
        Sale.notes.like(f"%{original.invoice_number}%")
    )
    if current_user.role != "superadmin":
        prior_returns = prior_returns.filter(Sale.account_id == current_user.account_id)
    prior_returns = prior_returns.all()
    for pr in prior_returns:
        for pi in pr.items:
            if pi.product_id:
                already_returned[pi.product_id] = already_returned.get(pi.product_id, 0) + abs(pi.qty)

    return_items = data.get("items", [])
    if not return_items:
        return jsonify({"error": "No items specified"}), 400

    # Build return sale
    last = Sale.query.filter(Sale.invoice_number.like("RET-%"))
    if current_user.role != "superadmin":
        last = last.filter(Sale.account_id == current_user.account_id)
    last = last.order_by(Sale.id.desc()).with_for_update().first()
    next_num = 1
    if last:
        try: next_num = int(last.invoice_number.split("-")[1]) + 1
        except ValueError: pass
    inv_num = f"RET-{next_num:05d}"

    total_refund = 0.0
    movements    = []

    for ri in return_items:
        si = SaleItem.query.get(ri.get("sale_item_id"))
        if not si or si.sale_id != original.id:
            return jsonify({"error": f"Invalid sale_item_id {ri.get('sale_item_id')}"}), 400
        rqty = int(ri.get("return_qty", 0))
        prev_returned = already_returned.get(si.product_id, 0)
        remaining_qty = si.qty - prev_returned
        if rqty <= 0 or rqty > remaining_qty:
            return jsonify({"error": f"Invalid return_qty for item {si.product_name} (max returnable: {remaining_qty})"}), 400

        # Use effective price (unit price minus per-item discount) for accurate refund
        effective_price = float(si.unit_price) - (float(si.discount or 0) / si.qty if si.qty else 0)
        total_refund += effective_price * rqty

        # Restock
        p = Product.query.get(si.product_id)
        if p:
            old_qty = p.stock_qty
            p.stock_qty += rqty
            movements.append(
                insert(InventoryMovement).values(
                    product_id=p.id,
                    movement_type="return",
                    qty_before=old_qty,
                    qty_change=rqty,
                    qty_after=p.stock_qty,
                    notes=f"Return from {original.invoice_number}",
                    created_by=me.id if me else None,
                    created_at=datetime.utcnow()
                )
            )

    # Create return sale record
    ret_sale = Sale(
        invoice_number = inv_num,
        customer_id    = original.customer_id,
        cashier_id     = me.id if me else None,
        subtotal       = -total_refund,
        total          = -total_refund,
        amount_paid    = -total_refund,
        payment_method = data.get("refund_method", original.payment_method),
        status         = "refunded",
        notes          = data.get("notes", f"Return for {original.invoice_number}"),
        sale_date      = datetime.utcnow(),
    )
    db.session.add(ret_sale)
    db.session.flush()

    for ri in return_items:
        si   = SaleItem.query.get(ri["sale_item_id"])
        rqty = int(ri["return_qty"])
        db.session.add(SaleItem(
            sale_id      = ret_sale.id,
            product_id   = si.product_id,
            product_name = si.product_name,
            sku          = si.sku,
            qty          = -rqty,
            unit_price   = si.unit_price,
            total        = -(float(si.unit_price) * rqty),
        ))

    for m in movements:
        db.session.execute(m)

    # Mark original as partial_refund or fully refunded
    total_original_qty = sum(i.qty for i in original.items if i.qty > 0)
    total_returned_qty = sum(int(ri["return_qty"]) for ri in return_items)
    new_total_returned = sum(already_returned.values()) + total_returned_qty
    original.status = "refunded" if new_total_returned >= total_original_qty else "partial_refund"

    db.session.commit()
    return jsonify(ret_sale.to_dict(include_items=True)), 201


@returns_bp.route("/eligible/<int:sale_id>", methods=["GET"])
@token_required
@login_required
def eligible_items(sale_id):
    """Return items from an original sale that can be returned."""
    query = Sale.query.filter_by(id=sale_id)
    if current_user.role != "superadmin":
        query = query.filter(Sale.account_id == current_user.account_id)
    sale = query.first()
    if not sale:
        return jsonify({"error": "Not found"}), 404
    return jsonify({
        "sale":  sale.to_dict(include_items=True),
        "items": [i.to_dict() for i in sale.items if i.qty > 0],
    })
