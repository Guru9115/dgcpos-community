"""
AI-style sample product catalog for DGC POS — Nepal retail / bazaar demo lists.
Each item includes name, category, prices, stock, emoji, and a stable placeholder image URL.
"""
from __future__ import annotations

from product_images import demo_product_image_url
from store_engine import normalize_store_type, get_category_names, get_store_config


def _photo(name: str, w: int = 480, h: int = 360, category: str | None = None) -> str:
    return demo_product_image_url(name, w, h, category)


def placeholder_image_url(name: str, w: int = 480, h: int = 360, category: str | None = None) -> str:
    """Public helper — name-matched AI demo product image."""
    return demo_product_image_url(name, w, h, category)


def _item(name, category, cost, sell, stock=40, unit="pcs", emoji="🛍️", desc=None):
    return {
        "name": name,
        "category": category,
        "cost_price": cost,
        "selling_price": sell,
        "stock_qty": stock,
        "unit": unit,
        "emoji": emoji,
        "description": desc or f"Sample listing — {name}",
        "image_url": _photo(name, category=category),
        "sku_prefix": "SAMPLE",
    }


# Nepal-first bazaar catalog — general / kirana / mixed pasal
BAZAAR_SAMPLE = [
    _item("Basmati Rice 5kg", "Grocery", 720, 899, 55, "bag", "🍚", "Premium basmati — sample version"),
    _item("Sunflower Oil 1L", "Grocery", 185, 245, 80, "bottle", "🫒"),
    _item("Red Potato 1kg", "Grocery", 38, 55, 120, "kg", "🥔"),
    _item("Fresh Tomato 1kg", "Grocery", 45, 65, 90, "kg", "🍅"),
    _item("Honey 500g", "Grocery", 320, 450, 35, "jar", "🍯", "Local honey — sample version"),
    _item("Masala Tea 250g", "Grocery", 95, 140, 60, "pack", "🍵"),
    _item("Printed Kurta", "Fashion", 850, 1499, 25, "pcs", "👗", "Cotton kurta — sample version"),
    _item("Running Shoes", "Fashion", 1800, 2999, 18, "pair", "👟"),
    _item("LED Bulb 12W", "Electronics", 95, 185, 70, "pcs", "💡"),
    _item("USB-C Cable 1m", "Electronics", 120, 299, 45, "pcs", "📱"),
    _item("Kids Toy Set", "Kids", 280, 499, 30, "set", "🧸"),
    _item("Face Cream 50ml", "Beauty", 150, 280, 40, "tube", "💄"),
    _item("Kitchen Utensil Set", "Home", 420, 750, 22, "set", "🏠"),
    _item("Handmade Shawl", "Local", 650, 1200, 15, "pcs", "🧣", "Nepal artisan — sample version"),
]

STORE_OVERRIDES: dict[str, list] = {
    "supermarket": BAZAAR_SAMPLE,
    "retail": BAZAAR_SAMPLE,
    "clothing_store": [
        _item("Cotton Kurta", "Ethnic Wear", 750, 1399, 30, "pcs", "👗"),
        _item("Denim Jeans", "Clothing", 1200, 2499, 22, "pcs", "👖"),
        _item("Sports T-Shirt", "Clothing", 380, 799, 40, "pcs", "👕"),
        _item("Leather Sandals", "Shoes", 650, 1299, 20, "pair", "👡"),
        _item("School Bag", "Accessories", 450, 899, 25, "pcs", "🎒"),
        _item("Wool Shawl", "Ethnic Wear", 900, 1699, 12, "pcs", "🧣"),
        _item("Kids Kurta", "Kids Wear", 420, 799, 18, "pcs", "🧸"),
        _item("Sunglasses", "Accessories", 180, 450, 35, "pcs", "🕶️"),
    ],
    "electronics": [
        _item("Smartphone Cover", "Mobile", 120, 350, 50, "pcs", "📱"),
        _item("Wireless Earbuds", "Audio", 1100, 2199, 20, "pcs", "🎧"),
        _item("Power Bank 10000mAh", "Mobile", 850, 1599, 25, "pcs", "🔋"),
        _item("LED Strip 5m", "Home Appliances", 380, 699, 30, "pcs", "💡"),
        _item("HDMI Cable 2m", "Cables", 150, 399, 40, "pcs", "📺"),
        _item("Bluetooth Speaker", "Audio", 1400, 2799, 15, "pcs", "🔊"),
    ],
    "restaurant": [
        _item("Chicken Momo Plate", "Appetizers", 90, 220, 999, "plate", "🥟"),
        _item("Dal Bhat Set", "Main Course", 130, 350, 999, "set", "🍛"),
        _item("Chow Mein", "Main Course", 80, 180, 999, "plate", "🍜"),
        _item("Masala Tea", "Beverages", 15, 60, 999, "cup", "🍵"),
        _item("Cold Lassi", "Beverages", 25, 90, 999, "glass", "🥛"),
        _item("Gulab Jamun", "Desserts", 40, 120, 999, "pcs", "🍮"),
    ],
    "pharmacy": [
        _item("Paracetamol 500mg", "OTC", 12, 25, 200, "strip", "💊"),
        _item("Vitamin C 500mg", "Vitamins", 180, 320, 45, "bottle", "🍊"),
        _item("Hand Sanitizer 100ml", "Personal Care", 45, 95, 80, "bottle", "🧴"),
        _item("Face Mask Pack", "Personal Care", 25, 60, 100, "pack", "😷"),
    ],
}


def get_ai_sample_catalog(store_type: str | None = None, business_type: str | None = None) -> list[dict]:
    """Return AI-labelled sample catalog for the store type."""
    tid = normalize_store_type(store_type or business_type)
    cfg = get_store_config(tid)
    items = STORE_OVERRIDES.get(tid)
    if not items:
        base = cfg.get("demo_products", [])
        items = [
            _item(
                p["name"],
                p.get("category", "General"),
                float(p["cost_price"]),
                float(p["selling_price"]),
                int(p.get("stock_qty", 40)),
                cfg.get("default_unit", "pcs"),
                "🛍️",
            )
            for p in base
        ]
        items = items + BAZAAR_SAMPLE[:6]

    out = []
    for i, raw in enumerate(items):
        sku = f"{raw.get('sku_prefix', 'SAMPLE')}-{tid[:4].upper()}-{i + 1:02d}"
        out.append({
            "id": f"sample-{tid}-{i}",
            "name": raw["name"],
            "category": raw["category"],
            "cost_price": raw["cost_price"],
            "selling_price": raw["selling_price"],
            "stock_qty": raw["stock_qty"],
            "unit": raw.get("unit", cfg.get("default_unit", "pcs")),
            "emoji": raw.get("emoji", "🛍️"),
            "description": raw.get("description", f"AI sample — {raw['name']}"),
            "image_url": raw["image_url"],
            "sku": sku,
            "sample_version": True,
        })
    return out


def catalog_meta(store_type: str | None = None, business_type: str | None = None) -> dict:
    tid = normalize_store_type(store_type or business_type)
    cfg = get_store_config(tid)
    return {
        "store_type": tid,
        "store_label": cfg.get("label", "General Retail"),
        "categories": get_category_names(tid),
        "ai_label": "DGC AI Sample Catalog",
        "disclaimer": "Sample version — demo prices & placeholder images for testing POS and DGC Bazaar.",
        "count": len(get_ai_sample_catalog(tid)),
    }