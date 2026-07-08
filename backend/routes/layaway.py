"""
Layaway — deposit-based reservations with instalment payments.
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Layaway, LayawayItem, LayawayPayment, Product, User
from datetime import datetime

layaway_bp = Blueprint("layaway", __name__)


def _me():
    return current_user if current_user.is_authenticated else None


def _next_number():
    last = Layaway.query.filter(Layaway.layaway_number.like("LAY-%")) \
               .order_by(Layaway.id.desc()).with_for_update().first()
    n = 1
    if last:
        try: n = int(last.layaway_number.split("-")[1]) + 1
        except ValueError: pass
    return f"LAY-{n:05d}"


@layaway_bp.route("/", methods=["GET"])
@token_required
@login_required
def list_layaways():
    try:
        page     = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 20))
    except (ValueError, TypeError):
        page, per_page = 1, 20
    status = request.args.get("status", "")
    q      = request.args.get("q", "").strip()

    query = Layaway.query
    if status:
        query = query.filter(Layaway.status == status)
    if q:
        query = query.filter(
            db.or_(
                Layaway.layaway_number.ilike(f"%{q}%"),
                Layaway.customer_name.ilike(f"%{q}%"),
                Layaway.customer_phone.ilike(f"%{q}%"),
            )
        )
    query = query.order_by(Layaway.created_at.desc())
    pag   = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "layaways": [l.to_dict() for l in pag.items],
        "total":    pag.total,
        "pages":    pag.pages,
        "page":     page,
    })


@layaway_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_layaway():
    me   = _me()
    data = request.get_json() or {}

    items = data.get("items", [])
    if not items:
        return jsonify({"error": "At least one item required"}), 400

    total = sum(float(i["unit_price"]) * int(i["qty"]) for i in items)
    deposit = float(data.get("deposit_amount", 0))
    if deposit < 0 or deposit > total:
        return jsonify({"error": "Invalid deposit amount"}), 400

    lay = Layaway(
        layaway_number = _next_number(),
        customer_id    = data.get("customer_id"),
        customer_name  = data.get("customer_name"),
        customer_phone = data.get("customer_phone"),
        created_by     = me.id if me else None,
        total_amount   = total,
        deposit_amount = deposit,
        paid_amount    = deposit,
        balance_due    = total - deposit,
        due_date       = data.get("due_date"),
        notes          = data.get("notes"),
    )
    db.session.add(lay)
    db.session.flush()

    for i in items:
        p = Product.query.get(i["product_id"])
        db.session.add(LayawayItem(
            layaway_id   = lay.id,
            product_id   = i["product_id"],
            product_name = p.name if p else i.get("product_name", ""),
            sku          = p.sku if p else i.get("sku", ""),
            qty          = int(i["qty"]),
            unit_price   = float(i["unit_price"]),
            total        = float(i["unit_price"]) * int(i["qty"]),
        ))

    if deposit > 0:
        db.session.add(LayawayPayment(
            layaway_id     = lay.id,
            amount         = deposit,
            payment_method = data.get("payment_method", "cash"),
            received_by    = me.id if me else None,
            notes          = "Initial deposit",
        ))

    db.session.commit()
    return jsonify(lay.to_dict(include_items=True, include_payments=True)), 201


@layaway_bp.route("/<int:lid>", methods=["GET"])
@token_required
@login_required
def get_layaway(lid):
    lay = Layaway.query.get_or_404(lid)
    return jsonify(lay.to_dict(include_items=True, include_payments=True))


@layaway_bp.route("/<int:lid>/payment", methods=["POST"])
@token_required
@login_required
def add_payment(lid):
    me   = _me()
    # Lock the row so concurrent payments cannot both pass the balance check
    lay  = Layaway.query.with_for_update().get(lid)
    if not lay:
        return jsonify({"error": "Layaway not found"}), 404
    data = request.get_json() or {}

    if lay.status != "active":
        return jsonify({"error": f"Layaway is {lay.status}"}), 400

    amount = float(data.get("amount", 0))
    if amount <= 0:
        return jsonify({"error": "Amount must be positive"}), 400
    if amount > float(lay.balance_due):
        amount = float(lay.balance_due)  # cap at balance

    db.session.add(LayawayPayment(
        layaway_id     = lid,
        amount         = amount,
        payment_method = data.get("payment_method", "cash"),
        received_by    = me.id if me else None,
        notes          = data.get("notes"),
    ))

    lay.paid_amount = float(lay.paid_amount) + amount
    lay.balance_due = float(lay.balance_due) - amount

    if float(lay.balance_due) <= 0:
        lay.status       = "completed"
        lay.completed_at = datetime.utcnow()

    db.session.commit()
    return jsonify(lay.to_dict(include_items=True, include_payments=True))


@layaway_bp.route("/<int:lid>/cancel", methods=["PUT"])
@token_required
@login_required
def cancel_layaway(lid):
    lay  = Layaway.query.get_or_404(lid)
    data = request.get_json() or {}
    if lay.status not in ("active",):
        return jsonify({"error": f"Cannot cancel a {lay.status} layaway"}), 400
    forfeited = data.get("forfeit_deposit", False)
    lay.status = "forfeited" if forfeited else "cancelled"
    db.session.commit()
    return jsonify(lay.to_dict())
