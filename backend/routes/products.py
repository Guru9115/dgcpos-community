from flask import Blueprint, request, jsonify, make_response
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Product, Category, InventoryMovement, MarketplacePost, Account
from sqlalchemy.orm import joinedload
from schemas import ProductSchema
from audit import log_audit
from sqlalchemy.exc import IntegrityError
from sqlalchemy import insert
from datetime import datetime
from decimal import Decimal
import csv, io

from sample_catalog import get_ai_sample_catalog, catalog_meta, placeholder_image_url
from bazaar_sync import sync_marketplace_from_product, resolve_listing_image

products_bp = Blueprint("products", __name__)


def _resolve_account_id(override=None):
    """Linked store, superadmin override, or first platform account for superadmin."""
    if override is not None and current_user.role == "superadmin":
        try:
            oid = int(override)
            if Account.query.get(oid):
                return oid
        except (TypeError, ValueError):
            pass
    aid = getattr(current_user, "account_id", None)
    if aid:
        return aid
    if current_user.role == "superadmin":
        acc = Account.query.order_by(Account.id.asc()).first()
        return acc.id if acc else None
    return None


def _bazaar_listing_map(products):
    """Map product_id -> active marketplace post id for a list of products."""
    if not products:
        return {}
    account_ids = {p.account_id for p in products if p.account_id}
    product_ids = [p.id for p in products]
    posts = MarketplacePost.query.filter(
        MarketplacePost.product_id.in_(product_ids),
        MarketplacePost.status == "active",
    )
    if len(account_ids) == 1:
        posts = posts.filter(MarketplacePost.account_id == next(iter(account_ids)))
    rows = posts.all()
    return {p.product_id: p.id for p in rows}


def _product_dict_with_bazaar(p, listing_map=None):
    out = p.to_dict()
    post_id = (listing_map or {}).get(p.id)
    out["bazaar_listed"] = post_id is not None
    out["marketplace_post_id"] = post_id
    return out


def _business_type_for_catalog(account_id=None):
    if getattr(current_user, "account", None):
        return getattr(current_user.account, "business_type", None)
    if account_id:
        acc = Account.query.get(account_id)
        if acc:
            return acc.business_type
    return None


@products_bp.route("/", methods=["GET"])
@token_required
@login_required
def get_products():
    q = request.args.get("q","")
    cat = request.args.get("category")
    status = request.args.get("status","active")
    low_stock = request.args.get("low_stock")
    account_id = getattr(current_user, 'account_id', None)
    query = Product.query.options(joinedload(Product.category))
    if account_id and current_user.role != "superadmin":
        query = query.filter(Product.account_id == account_id)
    if q: query = query.filter(Product.name.ilike(f"%{q}%") | Product.sku.ilike(f"%{q}%") | Product.barcode.ilike(f"%{q}%"))
    if cat: query = query.filter_by(category_id=int(cat))
    if status != "all": query = query.filter_by(status=status)
    if low_stock: query = query.filter(Product.stock_qty <= Product.reorder_level)
    # Limit to prevent slow loads on large catalogs; frontend can search/filter server-side
    products = query.order_by(Product.name).limit(500).all()
    listing_map = _bazaar_listing_map(products)
    return jsonify([_product_dict_with_bazaar(p, listing_map) for p in products])

@products_bp.route("/<int:pid>", methods=["GET"])
@token_required
@login_required
def get_product(pid):
    query = Product.query
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    p = query.get_or_404(pid)
    listing_map = _bazaar_listing_map([p])
    return jsonify(_product_dict_with_bazaar(p, listing_map))

@products_bp.route("/<int:pid>/unlist-bazaar", methods=["POST"])
@token_required
@login_required
def unlist_product_from_bazaar(pid):
    """Remove a POS product from DGC Bazaar (archives the marketplace listing)."""
    if current_user.role not in ("owner", "superadmin", "manager"):
        return jsonify({"error": "Only store owners and managers can manage bazaar listings"}), 403
    query = Product.query
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    p = query.options(joinedload(Product.category)).get_or_404(pid)
    sync_marketplace_from_product(p, current_user.id, list_on_bazaar=False)
    log_audit(
        "product.unlist_bazaar",
        resource="product",
        resource_id=str(pid),
        detail={"name": p.name},
    )
    db.session.commit()
    out = _product_dict_with_bazaar(p, {})
    out["bazaar_listed"] = False
    out["marketplace_post_id"] = None
    return jsonify(out)

@products_bp.route("/barcode/<string:barcode>", methods=["GET"])
@token_required
@login_required
def get_by_barcode(barcode):
    query = Product.query.filter_by(barcode=barcode)
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    p = query.first()
    if not p:
        return jsonify({"error": "Not found"}), 404
    return jsonify(p.to_dict())

@products_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_product():
    raw = request.get_json(silent=True) or {}
    schema = ProductSchema()
    errors = schema.validate(raw)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422
    data = schema.load(raw)
    # merge in description which is not in schema (free-form)
    description = raw.get("description")
    list_on_bazaar = bool(raw.get("list_on_bazaar", False))
    can_list = current_user.role in ("owner", "superadmin", "manager")
    img = data.get("image_url") or resolve_listing_image(data["name"], None)
    account_id = _resolve_account_id(raw.get("account_id"))
    if not account_id:
        return jsonify({"error": "No store account linked"}), 400
    p = Product(
        account_id=account_id,
        name=data["name"],
        sku=data["sku"],
        barcode=data["barcode"],
        category_id=data["category_id"],
        cost_price=data["cost_price"],
        selling_price=data["selling_price"],
        stock_qty=data["stock_qty"],
        reorder_level=data["reorder_level"],
        unit=data["unit"],
        status=data["status"],
        image_url=img,
        description=description,
    )
    db.session.add(p)
    db.session.flush()
    if p.stock_qty > 0:
        db.session.execute(
            insert(InventoryMovement).values(
                product_id=p.id,
                movement_type="opening",
                qty_before=0,
                qty_change=p.stock_qty,
                qty_after=p.stock_qty,
                notes="Opening stock",
                created_by=current_user.id,
                created_at=datetime.utcnow()
            )
        )
    bazaar_listed = False
    if list_on_bazaar and can_list and p.status == "active":
        mp = sync_marketplace_from_product(p, current_user.id, list_on_bazaar=True)
        if mp:
            bazaar_listed = True
            db.session.flush()

    log_audit("product.create", resource="product", resource_id=str(p.id),
              detail={"name": p.name, "bazaar_listed": bazaar_listed})
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        msg = "SKU or barcode already exists"
        if "sku" in str(e).lower():
            msg = "SKU already in use"
        elif "barcode" in str(e).lower():
            msg = "Barcode already in use"
        return jsonify({"error": msg}), 409
    out = p.to_dict()
    out["bazaar_listed"] = bazaar_listed
    return jsonify(out), 201

@products_bp.route("/<int:pid>", methods=["PUT"])
@token_required
@login_required
def update_product(pid):
    query = Product.query
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    p = query.options(joinedload(Product.category)).get_or_404(pid)
    data = request.get_json() or {}
    for f in ["name","category_id","cost_price","selling_price",
              "reorder_level","unit","description","status","image_url"]:
        if f in data: setattr(p, f, data[f] or None if f in ["category_id"] else data[f])
    if "sku"     in data: p.sku     = data["sku"]     or None
    if "barcode" in data: p.barcode = data["barcode"] or None
    if not p.image_url and p.name:
        p.image_url = resolve_listing_image(p.name, None)

    list_on_bazaar = data.get("list_on_bazaar")
    can_list = current_user.role in ("owner", "superadmin", "manager")
    bazaar_listed = False
    if can_list and list_on_bazaar is not False:
        has_listing = MarketplacePost.query.filter_by(
            account_id=p.account_id, product_id=p.id, status="active",
        ).first() is not None
        should_list = list_on_bazaar is True or has_listing
        if should_list:
            mp = sync_marketplace_from_product(
                p, current_user.id,
                list_on_bazaar=p.status == "active",
            )
            bazaar_listed = mp is not None
    elif can_list and list_on_bazaar is False:
        sync_marketplace_from_product(p, current_user.id, list_on_bazaar=False)

    log_audit("product.update", resource="product", resource_id=str(pid),
              detail={"bazaar_listed": bazaar_listed})
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        msg = "SKU or barcode already exists"
        if "sku" in str(e).lower():
            msg = "SKU already in use"
        elif "barcode" in str(e).lower():
            msg = "Barcode already in use"
        return jsonify({"error": msg}), 409
    out = p.to_dict()
    out["bazaar_listed"] = bazaar_listed
    return jsonify(out)

@products_bp.route("/<int:pid>", methods=["DELETE"])
@token_required
@login_required
def delete_product(pid):
    if current_user.role not in ("owner", "manager", "superadmin"):
        return jsonify({"error": "Only store owners and managers can delete products"}), 403
    query = Product.query
    if current_user.role != "superadmin":
        query = query.filter(Product.account_id == current_user.account_id)
    p = query.get_or_404(pid)
    p.status = "inactive"
    sync_marketplace_from_product(p, current_user.id, list_on_bazaar=False)
    log_audit("product.delete", resource="product", resource_id=str(pid),
              detail={"name": p.name})
    db.session.commit()
    return jsonify({"message": "Product deactivated"})

@products_bp.route("/placeholder-image", methods=["GET"])
def product_placeholder_image():
    """Name-matched placeholder image URL (same seed as sample catalog / bazaar)."""
    name = (request.args.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    return jsonify({"image_url": placeholder_image_url(name)})


@products_bp.route("/sample-catalog", methods=["GET"])
@token_required
@login_required
def get_sample_catalog():
    """AI-labelled sample product list for the store type (demo prices & images)."""
    if current_user.role not in ["owner", "superadmin", "manager"]:
        return jsonify({"error": "Forbidden"}), 403
    account_id = _resolve_account_id()
    business_type = _business_type_for_catalog(account_id)
    items = get_ai_sample_catalog(business_type=business_type)
    meta = catalog_meta(business_type=business_type)
    if account_id and not getattr(current_user, "account_id", None) and current_user.role == "superadmin":
        meta["resolved_account_id"] = account_id
    return jsonify({"meta": meta, "items": items})


@products_bp.route("/sample-batch", methods=["POST"])
@token_required
@login_required
def create_sample_batch():
    """Bulk-create sample catalog items into inventory; optionally list on DGC Bazaar."""
    if current_user.role not in ["owner", "superadmin", "manager"]:
        return jsonify({"error": "Forbidden"}), 403
    raw = request.get_json(silent=True) or {}
    account_id = _resolve_account_id(raw.get("account_id"))
    if not account_id:
        return jsonify({
            "error": "No store account on platform — create a store first or link your user to an account",
        }), 400

    item_ids = raw.get("item_ids") or []
    select_all = bool(raw.get("select_all"))
    list_on_bazaar = bool(raw.get("list_on_bazaar"))

    business_type = _business_type_for_catalog(account_id)
    catalog = get_ai_sample_catalog(business_type=business_type)
    by_id = {it["id"]: it for it in catalog}

    if select_all:
        selected = catalog
    elif item_ids:
        selected = [by_id[i] for i in item_ids if i in by_id]
    else:
        return jsonify({"error": "Provide item_ids or select_all"}), 400

    if not selected:
        return jsonify({"error": "No valid sample items selected"}), 400

    created_products = []
    skipped = []
    bazaar_listed = 0

    for item in selected:
        cat = Category.query.filter_by(name=item["category"]).first()
        if not cat:
            cat = Category(name=item["category"])
            db.session.add(cat)
            db.session.flush()

        existing = Product.query.filter_by(account_id=account_id, sku=item["sku"]).first()
        if existing:
            skipped.append({"id": item["id"], "name": item["name"], "reason": "SKU already exists"})
            product = existing
        else:
            product = Product(
                account_id=account_id,
                name=item["name"],
                sku=item["sku"],
                category_id=cat.id,
                cost_price=item["cost_price"],
                selling_price=item["selling_price"],
                stock_qty=item["stock_qty"],
                reorder_level=10,
                unit=item.get("unit", "pcs"),
                status="active",
                image_url=item.get("image_url"),
                description=item.get("description"),
            )
            db.session.add(product)
            db.session.flush()
            if product.stock_qty > 0:
                db.session.execute(
                    insert(InventoryMovement).values(
                        product_id=product.id,
                        movement_type="opening",
                        qty_before=0,
                        qty_change=product.stock_qty,
                        qty_after=product.stock_qty,
                        notes="AI sample catalog — opening stock",
                        created_by=current_user.id,
                        created_at=datetime.utcnow(),
                    )
                )
            created_products.append(product)

        if list_on_bazaar and product.status == "active":
            had = MarketplacePost.query.filter_by(
                account_id=account_id,
                product_id=product.id,
                status="active",
            ).first()
            mp = sync_marketplace_from_product(
                product, current_user.id, list_on_bazaar=True,
            )
            if mp and not had:
                bazaar_listed += 1

    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        return jsonify({"error": f"Could not save sample items: {e}"}), 409

    log_audit(
        "product.sample_batch",
        resource="product",
        detail={
            "created": len(created_products),
            "skipped": len(skipped),
            "bazaar_listed": bazaar_listed,
            "list_on_bazaar": list_on_bazaar,
        },
    )

    return jsonify({
        "created": len(created_products),
        "skipped": len(skipped),
        "bazaar_listed": bazaar_listed,
        "products": [p.to_dict() for p in created_products],
        "skipped_details": skipped,
        "disclaimer": "Sample version — demo prices & placeholder images",
    }), 201


@products_bp.route("/categories", methods=["GET"])
@token_required
@login_required
def get_categories():
    cats = Category.query.order_by(Category.name).all()
    return jsonify([c.to_dict() for c in cats])

@products_bp.route("/categories", methods=["POST"])
@token_required
@login_required
def create_category():
    data = request.get_json()
    c = Category(name=data["name"], description=data.get("description"))
    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201


# ── CSV Export & Bulk Import ──────────────────────────────────────────────────

@products_bp.route("/export.csv", methods=["GET"])
@token_required
@login_required
def export_products_csv():
    """Export products to CSV."""
    status = request.args.get("status", "active")
    q = Product.query
    if status != "all":
        q = q.filter(Product.status == status)
    if current_user.role != "superadmin":
        q = q.filter(Product.account_id == current_user.account_id)
    products = q.order_by(Product.name).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "SKU", "Name", "Category", "Cost Price", "Selling Price",
        "Stock Qty", "Reorder Level", "Unit", "Status", "Barcode"
    ])
    for p in products:
        w.writerow([
            p.sku or "",
            p.name,
            p.category.name if p.category else "",
            float(p.cost_price or 0),
            float(p.selling_price or 0),
            p.stock_qty,
            p.reorder_level,
            p.unit or "pcs",
            p.status,
            p.barcode or "",
        ])

    resp = make_response(buf.getvalue())
    resp.headers["Content-Type"] = "text/csv"
    resp.headers["Content-Disposition"] = "attachment; filename=products-export.csv"
    return resp


@products_bp.route("/import.csv", methods=["POST"])
@token_required
@login_required
def import_products_csv():
    """Bulk import products from CSV. Expects a multipart/form-data file upload.

    CSV format (header row required):
        name, sku, category, cost_price, selling_price, stock_qty,
        reorder_level, unit, status, barcode

    Rows with an existing SKU are updated; new SKUs are created.
    Returns a summary: {created, updated, skipped, errors}.
    """
    if current_user.role not in ["owner", "superadmin", "manager"]:
        return jsonify({"error": "Forbidden"}), 403

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded — use field name 'file'"}), 400

    file = request.files["file"]
    if not file.filename.endswith(".csv"):
        return jsonify({"error": "File must be a .csv"}), 400

    content = file.read().decode("utf-8-sig")  # strip BOM if present
    reader = csv.DictReader(io.StringIO(content))

    created = updated = skipped = 0
    errors = []

    for i, row in enumerate(reader, start=2):  # row 1 = header
        name = (row.get("name") or row.get("Name") or "").strip()
        sku  = (row.get("sku")  or row.get("SKU")  or "").strip()
        if not name:
            errors.append(f"Row {i}: name is required")
            skipped += 1
            continue

        try:
            cost_price    = float(row.get("cost_price")    or row.get("Cost Price")    or 0)
            selling_price = float(row.get("selling_price") or row.get("Selling Price") or 0)
            stock_qty     = int(row.get("stock_qty")       or row.get("Stock Qty")     or 0)
            reorder_level = int(row.get("reorder_level")   or row.get("Reorder Level") or 10)
        except ValueError as e:
            errors.append(f"Row {i}: invalid number — {e}")
            skipped += 1
            continue

        unit    = (row.get("unit")    or row.get("Unit")    or "pcs").strip()
        status  = (row.get("status")  or row.get("Status")  or "active").strip()
        barcode = (row.get("barcode") or row.get("Barcode") or "").strip() or None

        # Resolve category by name
        cat_name = (row.get("category") or row.get("Category") or "").strip()
        cat = None
        if cat_name:
            cat = Category.query.filter_by(name=cat_name).first()
            if not cat:
                cat = Category(name=cat_name)
                db.session.add(cat)
                db.session.flush()

        existing_query = Product.query
        if sku:
            existing_query = existing_query.filter_by(sku=sku)
            if current_user.role != "superadmin":
                existing_query = existing_query.filter(Product.account_id == current_user.account_id)
        existing = existing_query.first() if sku else None
        if existing:
            existing.name          = name
            existing.cost_price    = cost_price
            existing.selling_price = selling_price
            existing.stock_qty     = stock_qty
            existing.reorder_level = reorder_level
            existing.unit          = unit
            existing.status        = status
            if cat:    existing.category_id = cat.id
            if barcode: existing.barcode    = barcode
            updated += 1
        else:
            p = Product(
                account_id=getattr(current_user, 'account_id', None),
                name=name, sku=sku or None, barcode=barcode,
                category_id=cat.id if cat else None,
                cost_price=cost_price, selling_price=selling_price,
                stock_qty=stock_qty, reorder_level=reorder_level,
                unit=unit, status=status,
            )
            db.session.add(p)
            created += 1

    try:
        db.session.commit()
        log_audit("product.import_csv", resource="product",
                  detail={"created": created, "updated": updated, "skipped": skipped})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500

    return jsonify({
        "created": created, "updated": updated,
        "skipped": skipped, "errors": errors[:20],  # cap errors returned
    })
