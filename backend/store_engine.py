"""
DGC POS — Store Type Engine
Maps business/store types to categories, demo products, and POS behaviour.
Aligned with marketing site industries.
"""
from __future__ import annotations

STORE_TYPES: dict[str, dict] = {
    "restaurant": {
        "label": "Restaurant",
        "marketing_names": ["Restaurant"],
        "categories": ["Appetizers", "Main Course", "Beverages", "Desserts", "Combos", "Sides"],
        "default_unit": "plate",
        "pos_mode": "restaurant",
        "features": ["table_service", "kitchen_display", "split_bill"],
        "demo_products": [
            {"name": "Chicken Momo", "sku": "DEMO-REST-01", "category": "Appetizers", "cost_price": 80, "selling_price": 220, "stock_qty": 999},
            {"name": "Dal Bhat Set", "sku": "DEMO-REST-02", "category": "Main Course", "cost_price": 120, "selling_price": 350, "stock_qty": 999},
            {"name": "Masala Tea", "sku": "DEMO-REST-03", "category": "Beverages", "cost_price": 15, "selling_price": 60, "stock_qty": 999},
        ],
    },
    "cafe": {
        "label": "Cafe",
        "marketing_names": ["Cafe"],
        "categories": ["Coffee", "Tea", "Pastries", "Sandwiches", "Cold Drinks", "Snacks"],
        "default_unit": "cup",
        "pos_mode": "cafe",
        "features": ["quick_counter", "loyalty"],
        "demo_products": [
            {"name": "Cappuccino", "sku": "DEMO-CAFE-01", "category": "Coffee", "cost_price": 45, "selling_price": 180, "stock_qty": 999},
            {"name": "Chocolate Croissant", "sku": "DEMO-CAFE-02", "category": "Pastries", "cost_price": 55, "selling_price": 160, "stock_qty": 40},
        ],
    },
    "bookstore": {
        "label": "Book Store",
        "marketing_names": ["Book Store", "Books"],
        "categories": ["Fiction", "Non-Fiction", "Academic", "Children", "Stationery", "Magazines"],
        "default_unit": "pcs",
        "pos_mode": "retail",
        "features": ["isbn_barcode", "author_field"],
        "demo_products": [
            {"name": "Nepal Travel Guide", "sku": "DEMO-BOOK-01", "category": "Non-Fiction", "cost_price": 350, "selling_price": 650, "stock_qty": 25},
            {"name": "Notebook A5", "sku": "DEMO-BOOK-02", "category": "Stationery", "cost_price": 45, "selling_price": 120, "stock_qty": 80},
        ],
    },
    "fancy_store": {
        "label": "Fancy Store",
        "marketing_names": ["Fancy Store", "Gift Shop", "Gifts"],
        "categories": ["Gifts", "Home Decor", "Toys", "Seasonal", "Accessories", "Packaging"],
        "default_unit": "pcs",
        "pos_mode": "retail",
        "features": ["gift_wrap", "seasonal_tags"],
        "demo_products": [
            {"name": "Decorative Vase", "sku": "DEMO-FAN-01", "category": "Home Decor", "cost_price": 400, "selling_price": 950, "stock_qty": 18},
            {"name": "Gift Hamper Box", "sku": "DEMO-FAN-02", "category": "Gifts", "cost_price": 250, "selling_price": 599, "stock_qty": 30},
        ],
    },
    "clothing_store": {
        "label": "Clothing Store",
        "marketing_names": ["Fashion", "Clothing Store", "Clothes", "Apparel"],
        "categories": ["Clothing", "Shoes", "Accessories", "Bags", "Jewelry", "Kids Wear", "Ethnic Wear"],
        "default_unit": "pcs",
        "pos_mode": "fashion",
        "features": ["variants_size_color", "alterations"],
        "demo_products": [
            {"name": "Classic Cotton Tee", "sku": "DEMO-CLT-01", "category": "Clothing", "cost_price": 450, "selling_price": 1299, "stock_qty": 48},
            {"name": "Denim Jacket", "sku": "DEMO-CLT-02", "category": "Clothing", "cost_price": 1800, "selling_price": 3999, "stock_qty": 22},
            {"name": "Running Sneakers", "sku": "DEMO-CLT-03", "category": "Shoes", "cost_price": 2200, "selling_price": 5499, "stock_qty": 15},
        ],
    },
    "supermarket": {
        "label": "Supermarket",
        "marketing_names": ["Supermarket", "Grocery"],
        "categories": ["Grocery", "Dairy", "Beverages", "Snacks", "Household", "Personal Care", "Frozen"],
        "default_unit": "pcs",
        "pos_mode": "supermarket",
        "features": ["weight_scale", "bulk_sku", "expiry_tracking"],
        "demo_products": [
            {"name": "Basmati Rice 5kg", "sku": "DEMO-SUP-01", "category": "Grocery", "cost_price": 650, "selling_price": 899, "stock_qty": 60},
            {"name": "Full Cream Milk 1L", "sku": "DEMO-SUP-02", "category": "Dairy", "cost_price": 95, "selling_price": 130, "stock_qty": 120},
        ],
    },
    "pharmacy": {
        "label": "Pharmacy",
        "marketing_names": ["Pharmacy"],
        "categories": ["Medicines", "OTC", "Vitamins", "Personal Care", "Baby Care", "First Aid"],
        "default_unit": "pcs",
        "pos_mode": "pharmacy",
        "features": ["batch_expiry", "prescription_note"],
        "demo_products": [
            {"name": "Paracetamol 500mg", "sku": "DEMO-PHR-01", "category": "OTC", "cost_price": 12, "selling_price": 25, "stock_qty": 200},
            {"name": "Vitamin C Tablets", "sku": "DEMO-PHR-02", "category": "Vitamins", "cost_price": 180, "selling_price": 320, "stock_qty": 45},
        ],
    },
    "electronics": {
        "label": "Electronics",
        "marketing_names": ["Electronics"],
        "categories": ["Mobile", "Accessories", "Audio", "Computing", "Home Appliances", "Cables"],
        "default_unit": "pcs",
        "pos_mode": "electronics",
        "features": ["serial_warranty", "returns_rma"],
        "demo_products": [
            {"name": "USB-C Cable 1m", "sku": "DEMO-ELC-01", "category": "Cables", "cost_price": 120, "selling_price": 350, "stock_qty": 55},
            {"name": "Wireless Earbuds", "sku": "DEMO-ELC-02", "category": "Audio", "cost_price": 1200, "selling_price": 2499, "stock_qty": 20},
        ],
    },
    "hotel": {
        "label": "Hotel",
        "marketing_names": ["Hotel", "Lodge", "Guesthouse", "Hostel", "Homestay"],
        "categories": ["Room Service", "Restaurant", "Minibar", "Laundry", "Spa", "Retail"],
        "default_unit": "service",
        "pos_mode": "hospitality",
        "features": ["room_charge", "multi_outlet"],
        "demo_products": [
            {"name": "Room Service Breakfast", "sku": "DEMO-HOT-01", "category": "Room Service", "cost_price": 200, "selling_price": 650, "stock_qty": 999},
            {"name": "Minibar Water", "sku": "DEMO-HOT-02", "category": "Minibar", "cost_price": 20, "selling_price": 80, "stock_qty": 100},
        ],
    },
    "wholesale": {
        "label": "Wholesale",
        "marketing_names": ["Wholesale"],
        "categories": ["Bulk Grocery", "Beverages Bulk", "Household Bulk", "Industrial", "Packaging"],
        "default_unit": "carton",
        "pos_mode": "wholesale",
        "features": ["tier_pricing", "credit_terms"],
        "demo_products": [
            {"name": "Cooking Oil Carton", "sku": "DEMO-WHL-01", "category": "Bulk Grocery", "cost_price": 3200, "selling_price": 3800, "stock_qty": 30},
        ],
    },
    "retail": {
        "label": "General Retail",
        "marketing_names": ["Retail", "General Retail"],
        "categories": ["General", "Accessories", "Home", "Seasonal", "Clearance"],
        "default_unit": "pcs",
        "pos_mode": "retail",
        "features": ["barcode_scan"],
        "demo_products": [
            {"name": "Sample Product A", "sku": "DEMO-RTL-01", "category": "General", "cost_price": 100, "selling_price": 250, "stock_qty": 50},
            {"name": "Sample Product B", "sku": "DEMO-RTL-02", "category": "General", "cost_price": 200, "selling_price": 450, "stock_qty": 35},
        ],
    },
}


def normalize_store_type(raw: str | None) -> str:
    """Map free-text / marketing labels to canonical store type id."""
    if not raw:
        return "retail"
    key = raw.strip().lower().replace("-", " ").replace("_", " ")
    if key in STORE_TYPES:
        return key
    for type_id, cfg in STORE_TYPES.items():
        if cfg["label"].lower() == key:
            return type_id
        for alias in cfg.get("marketing_names", []):
            if alias.lower() == key:
                return type_id
    # fuzzy contains
    if "restaurant" in key or "food" in key:
        return "restaurant"
    if "book" in key:
        return "bookstore"
    if "fancy" in key or "gift" in key:
        return "fancy_store"
    if "cloth" in key or "fashion" in key or "apparel" in key:
        return "clothing_store"
    if "super" in key or "grocery" in key:
        return "supermarket"
    if "cafe" in key or "coffee" in key:
        return "cafe"
    if "pharm" in key:
        return "pharmacy"
    if "electr" in key:
        return "electronics"
    if "hotel" in key or "lodge" in key or "guesthouse" in key or "hostel" in key or "homestay" in key:
        return "hotel"
    if "wholesale" in key:
        return "wholesale"
    return "retail"


def list_store_types() -> list[dict]:
    return [
        {
            "id": type_id,
            "label": cfg["label"],
            "categories": cfg["categories"],
            "pos_mode": cfg["pos_mode"],
            "features": cfg.get("features", []),
        }
        for type_id, cfg in STORE_TYPES.items()
    ]


def get_store_config(type_id: str) -> dict:
    return STORE_TYPES.get(normalize_store_type(type_id), STORE_TYPES["retail"])


def get_demo_products(type_id: str) -> list[dict]:
    return list(get_store_config(type_id).get("demo_products", []))


def get_category_names(type_id: str) -> list[str]:
    return list(get_store_config(type_id).get("categories", []))