"""Product Variants API — size/colour variants for fashion retail."""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Product, ProductVariant

variants_bp = Blueprint("variants", __name__)


@variants_bp.route("/<int:product_id>", methods=["GET"])
@token_required
@login_required
def list_variants(product_id):
    query = Product.query.filter_by(id=product_id)
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    product = query.first()
    if not product:
        return jsonify({"error": "Not found"}), 404
    variants = ProductVariant.query.filter_by(product_id=product_id).order_by(
        ProductVariant.size, ProductVariant.color
    ).all()
    return jsonify({
        "product": {"id": product.id, "name": product.name, "has_variants": product.has_variants},
        "variants": [v.to_dict() for v in variants],
    })


@variants_bp.route("/<int:product_id>", methods=["POST"])
@token_required
@login_required
def create_variant(product_id):
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    query = Product.query.filter_by(id=product_id)
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    product = query.first()
    if not product:
        return jsonify({"error": "Not found"}), 404
    d = request.get_json() or {}

    # Validate uniqueness of SKU/barcode
    if d.get("sku") and ProductVariant.query.filter_by(sku=d["sku"]).first():
        return jsonify({"error": "SKU already exists"}), 409
    if d.get("barcode") and ProductVariant.query.filter_by(barcode=d["barcode"]).first():
        return jsonify({"error": "Barcode already exists"}), 409

    v = ProductVariant(
        product_id=product_id,
        size=d.get("size") or None,
        color=d.get("color") or None,
        sku=d.get("sku") or None,
        barcode=d.get("barcode") or None,
        stock_qty=int(d.get("stock_qty", 0)),
        cost_price=d.get("cost_price"),
        selling_price=d.get("selling_price"),
        is_active=d.get("is_active", True),
    )
    product.has_variants = True
    db.session.add(v)
    db.session.commit()
    return jsonify(v.to_dict()), 201


@variants_bp.route("/item/<int:vid>", methods=["PUT"])
@token_required
@login_required
def update_variant(vid):
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Forbidden"}), 403
    v = ProductVariant.query.get_or_404(vid)
    if current_user.role != "superadmin" and getattr(v.product, "account_id", None) != current_user.account_id:
        return jsonify({"error": "Not found"}), 404
    d = request.get_json() or {}

    if "size"     in d: v.size          = d["size"] or None
    if "color"    in d: v.color         = d["color"] or None
    if "sku"      in d: v.sku           = d["sku"] or None
    if "barcode"  in d: v.barcode       = d["barcode"] or None
    if "stock_qty" in d: v.stock_qty    = int(d["stock_qty"])
    if "cost_price" in d: v.cost_price  = d["cost_price"]
    if "selling_price" in d: v.selling_price = d["selling_price"]
    if "is_active" in d: v.is_active    = bool(d["is_active"])

    db.session.commit()
    return jsonify(v.to_dict())


@variants_bp.route("/item/<int:vid>", methods=["DELETE"])
@token_required
@login_required
def delete_variant(vid):
    if current_user.role not in ("owner", "superadmin"):
        return jsonify({"error": "Forbidden"}), 403
    v = ProductVariant.query.get_or_404(vid)
    if current_user.role != "superadmin" and getattr(v.product, "account_id", None) != current_user.account_id:
        return jsonify({"error": "Not found"}), 404
    product = v.product
    db.session.delete(v)
    # If no variants remain, clear the flag
    remaining = ProductVariant.query.filter_by(product_id=product.id).count()
    if remaining == 0:
        product.has_variants = False
    db.session.commit()
    return jsonify({"message": "Variant deleted"})


@variants_bp.route("/by-barcode/<barcode>", methods=["GET"])
@token_required
@login_required
def get_by_barcode(barcode):
    """POS barcode scan — returns variant + parent product info."""
    v = ProductVariant.query.filter_by(barcode=barcode).first()
    if not v or (current_user.role != "superadmin" and getattr(v.product, "account_id", None) != current_user.account_id):
        return jsonify({"error": "Variant not found"}), 404
    data = v.to_dict()
    data["parent"] = {
        "id": v.product.id, "name": v.product.name,
        "category_name": v.product.category.name if v.product.category else None,
        "unit": v.product.unit,
    }
    return jsonify(data)
