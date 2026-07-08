"""Isolated demo seed for beta guest workspaces — store-type aware."""
from models import db, Product, Setting, Customer, Category
from store_engine import normalize_store_type, get_demo_products, get_category_names, get_store_config


GUEST_SETTINGS = {
    "shop_address": "Demo Lane, Kathmandu",
    "shop_phone": "+977-9800000000",
    "shop_email": "guest@dgcpos.net",
    "currency": "Rs.",
    "currency_code": "NPR",
    "tax_rate": "13",
    "receipt_footer": "Guest beta workspace — sample data only",
    "loyalty_points_rate": "10",
    "points_redemption_rate": "1",
    "vip_threshold": "10000",
    "low_stock_threshold": "5",
    "membership_enabled": "true",
}


def _get_or_create_category(name):
    cat = Category.query.filter_by(name=name).first()
    if not cat:
        cat = Category(name=name)
        db.session.add(cat)
        db.session.flush()
    return cat


def seed_guest_demo_for_account(account_id, shop_name=None, business_type=None):
    """Populate a fresh guest sandbox scoped to account_id and store type."""
    if not account_id:
        return

    existing = Product.query.filter_by(account_id=account_id).count()
    if existing > 0:
        return

    store_type = normalize_store_type(business_type)
    cfg = get_store_config(store_type)
    display_name = shop_name or "Guest Beta Store"

    settings = {
        **GUEST_SETTINGS,
        "shop_name": display_name,
        "pos_engine_type": store_type,
        "pos_engine_mode": cfg.get("pos_mode", "retail"),
        "pos_engine_label": cfg.get("label", "General Retail"),
    }
    for key, value in settings.items():
        row = Setting.query.filter_by(key=key, account_id=account_id).first()
        if not row:
            db.session.add(Setting(key=key, value=value, account_id=account_id))

    # Seed store-type categories
    for cat_name in get_category_names(store_type):
        _get_or_create_category(cat_name)

    demo_items = get_demo_products(store_type)
    for item in demo_items:
        cat = _get_or_create_category(item["category"])
        db.session.add(Product(
            account_id=account_id,
            name=item["name"],
            sku=item["sku"],
            category_id=cat.id,
            cost_price=item["cost_price"],
            selling_price=item["selling_price"],
            stock_qty=item["stock_qty"],
            unit=cfg.get("default_unit", "pcs"),
            status="active",
        ))

    if not Customer.query.filter_by(account_id=account_id).first():
        db.session.add(Customer(
            account_id=account_id,
            name="Demo Customer",
            phone="9801111111",
            email="demo.customer@example.com",
            membership_tier="silver",
            loyalty_points=120,
            total_spent=8500,
            visit_count=4,
        ))

    if store_type == "hotel":
        from hospitality.demo_seed import seed_hospitality_demo_for_account
        seed_hospitality_demo_for_account(account_id, shop_name=display_name, business_type=business_type)