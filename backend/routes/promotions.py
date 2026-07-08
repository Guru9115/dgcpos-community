"""Promotions API — discount engine for POS checkout."""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Promotion
from datetime import date
from sqlalchemy import desc

promotions_bp = Blueprint("promotions", __name__)


@promotions_bp.route("/", methods=["GET"])
@token_required
@login_required
def list_promotions():
    active_only = request.args.get("active") == "1"
    query = Promotion.query
    if active_only:
        today = date.today()
        query = query.filter(
            Promotion.is_active == True,
            (Promotion.start_date == None) | (Promotion.start_date <= today),
            (Promotion.end_date == None)   | (Promotion.end_date >= today),
        )
    promos = query.order_by(desc(Promotion.created_at)).all()
    return jsonify([p.to_dict() for p in promos])


@promotions_bp.route("/active", methods=["GET"])
@token_required
@login_required
def active_promotions():
    """Returns all currently valid promotions — used by POS."""
    today = date.today()
    promos = Promotion.query.filter(
        Promotion.is_active == True,
        (Promotion.start_date == None) | (Promotion.start_date <= today),
        (Promotion.end_date == None)   | (Promotion.end_date >= today),
    ).all()
    valid = [p for p in promos if p.is_valid_today]
    return jsonify([p.to_dict() for p in valid])


@promotions_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_promotion():
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    d = request.get_json() or {}
    if not d.get("name") or not d.get("promo_type"):
        return jsonify({"error": "name and promo_type required"}), 400

    p = Promotion(
        name         = d["name"],
        description  = d.get("description"),
        promo_type   = d["promo_type"],
        value        = d.get("value", 0),
        min_purchase = d.get("min_purchase", 0),
        buy_qty      = int(d.get("buy_qty", 0)),
        get_qty      = int(d.get("get_qty", 0)),
        code         = d.get("code") or None,
        applies_to   = d.get("applies_to", "all"),
        category_id  = d.get("category_id"),
        product_id   = d.get("product_id"),
        start_date   = date.fromisoformat(d["start_date"]) if d.get("start_date") else None,
        end_date     = date.fromisoformat(d["end_date"])   if d.get("end_date")   else None,
        max_uses     = d.get("max_uses"),
        is_active    = d.get("is_active", True),
    )
    db.session.add(p)
    db.session.commit()
    return jsonify(p.to_dict()), 201


@promotions_bp.route("/<int:pid>", methods=["PUT"])
@token_required
@login_required
def update_promotion(pid):
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    p = Promotion.query.get_or_404(pid)
    d = request.get_json() or {}
    for field in ("name","description","promo_type","value","min_purchase",
                  "buy_qty","get_qty","code","applies_to","category_id",
                  "product_id","max_uses","is_active"):
        if field in d:
            setattr(p, field, d[field])
    if "start_date" in d: p.start_date = date.fromisoformat(d["start_date"]) if d["start_date"] else None
    if "end_date"   in d: p.end_date   = date.fromisoformat(d["end_date"])   if d["end_date"]   else None
    db.session.commit()
    return jsonify(p.to_dict())


@promotions_bp.route("/<int:pid>", methods=["DELETE"])
@token_required
@login_required
def delete_promotion(pid):
    if current_user.role not in ("owner", "superadmin"):
        return jsonify({"error": "Forbidden"}), 403
    p = Promotion.query.get_or_404(pid)
    db.session.delete(p)
    db.session.commit()
    return jsonify({"message": "Promotion deleted"})


@promotions_bp.route("/apply", methods=["POST"])
@token_required
@login_required
def apply_promotion():
    """
    Calculates discount for a cart. Returns discount_amount and matching promo.
    Body: { subtotal, items: [{product_id, qty, price}], code }
    """
    d        = request.get_json() or {}
    subtotal = float(d.get("subtotal", 0))
    code     = (d.get("code") or "").strip().upper()
    items    = d.get("items", [])
    today    = date.today()

    # Find matching promo
    query = Promotion.query.filter(
        Promotion.is_active == True,
        (Promotion.start_date == None) | (Promotion.start_date <= today),
        (Promotion.end_date == None)   | (Promotion.end_date >= today),
    )
    if code:
        query = query.filter(Promotion.code == code)
    promos = [p for p in query.all() if p.is_valid_today]

    best_discount = 0
    best_promo   = None

    for p in promos:
        # Check min purchase
        if float(p.min_purchase or 0) > subtotal:
            continue
        # Check applies_to scope
        if p.applies_to == "product":
            applicable_total = sum(
                i["qty"] * i["price"] for i in items
                if i.get("product_id") == p.product_id
            )
        elif p.applies_to == "category":
            applicable_total = subtotal  # category filtering deferred to client
        else:
            applicable_total = subtotal

        if applicable_total <= 0:
            continue

        if p.promo_type == "pct_off":
            discount = round(applicable_total * float(p.value) / 100, 2)
        elif p.promo_type == "flat_off":
            discount = min(float(p.value), applicable_total)
        elif p.promo_type == "bogo":
            # Buy N get M free — free items = floor(qty / (buy+get)) * get * unit_price
            if p.applies_to == "product":
                for item in items:
                    if item.get("product_id") == p.product_id:
                        sets    = item["qty"] // (p.buy_qty + p.get_qty)
                        discount = sets * p.get_qty * item["price"]
            else:
                discount = 0
        elif p.promo_type == "min_spend":
            discount = float(p.value)
        else:
            discount = 0

        if discount > best_discount:
            best_discount = discount
            best_promo    = p

    return jsonify({
        "discount_amount": round(best_discount, 2),
        "promo": best_promo.to_dict() if best_promo else None,
    })
