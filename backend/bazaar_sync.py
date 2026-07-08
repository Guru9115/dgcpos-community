"""
Sync DGC POS inventory → DGC Bazaar public feed.
Maps product categories to bazaar slugs and assigns name-matched placeholder images.
"""
from __future__ import annotations

import re
from decimal import Decimal

from product_images import demo_product_image_url, is_placeholder_image, should_use_ai_demo

BAZAAR_SLUGS = ("grocery", "fashion", "electronics", "home", "beauty", "kids", "stays")

# POS category / product name → bazaar slug
_SLUG_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("grocery", re.compile(
        r"grocery|kirana|food|rice|dal|snack|spice|oil|honey|tea|tomato|potato|"
        r"vegetable|fruit|beverage|main course|appetizer|dessert|otc|vitamin",
        re.I,
    )),
    ("fashion", re.compile(
        r"fashion|cloth|kurta|sari|saree|dress|shoe|wear|print|shawl|sandal|"
        r"t-shirt|jeans|ethnic|accessories|local|clothing|kids wear|mobile cover",
        re.I,
    )),
    ("electronics", re.compile(
        r"electronic|phone|laptop|tv|charger|cable|gadget|bulb|led|board|"
        r"earbud|speaker|audio|mobile|power bank|hdmi",
        re.I,
    )),
    ("home", re.compile(
        r"home|furniture|kitchen|decor|utensil|living|appliance",
        re.I,
    )),
    ("beauty", re.compile(
        r"beauty|cosmetic|cream|soap|perfume|face|personal care|sanitizer|mask",
        re.I,
    )),
    ("kids", re.compile(
        r"kid|baby|toy|child|school bag",
        re.I,
    )),
    ("stays", re.compile(
        r"room|lodge|hotel|guesthouse|stay|hostel|accommodation",
        re.I,
    )),
]

_BUSINESS_TYPE_SLUG = {
    "clothing_store": "fashion",
    "electronics": "electronics",
    "restaurant": "grocery",
    "pharmacy": "beauty",
    "supermarket": "grocery",
    "retail": "grocery",
    "hotel": "stays",
    "lodge": "stays",
    "guesthouse": "stays",
}


def placeholder_image_url(name: str, w: int = 480, h: int = 360, category: str | None = None) -> str:
    """Name-matched AI demo product image."""
    return demo_product_image_url((name or "product").strip(), w, h, category)


def resolve_listing_image(
    product_name: str,
    image_url: str | None = None,
    category: str | None = None,
    *,
    force_demo: bool = False,
) -> str:
    """Prefer seller upload; otherwise AI demo photo matched to product name."""
    if image_url and str(image_url).strip() and not force_demo:
        if not is_placeholder_image(image_url):
            return str(image_url).strip()
    return placeholder_image_url(product_name, category=category)


def map_to_bazaar_slug(
    category_name: str | None = None,
    product_name: str | None = None,
    business_type: str | None = None,
) -> str:
    """Map POS category / product text to a bazaar category slug."""
    hay = f"{category_name or ''} {product_name or ''}"
    for slug, pattern in _SLUG_PATTERNS:
        if pattern.search(hay):
            return slug
    if business_type:
        bt = business_type.lower().replace(" ", "_")
        for key, slug in _BUSINESS_TYPE_SLUG.items():
            if key in bt or bt in key:
                return slug
        if "cloth" in bt or "fashion" in bt:
            return "fashion"
    return "grocery"


def bazaar_category_for_product(product, account=None) -> str:
    """Derive bazaar slug from a Product row."""
    cat_name = product.category.name if getattr(product, "category", None) else None
    biz = None
    if account:
        biz = getattr(account, "business_type", None)
    elif getattr(product, "account", None):
        biz = product.account.business_type
    return map_to_bazaar_slug(cat_name, product.name, biz)


def archive_marketplace_post(post):
    """Soft-remove a listing from the public bazaar (keeps orders/likes intact)."""
    from datetime import datetime

    post.status = "archived"
    post.updated_at = datetime.utcnow()
    return post


def archive_listings_for_product(product):
    """Archive every active marketplace listing linked to a POS product."""
    from datetime import datetime
    from models import MarketplacePost

    now = datetime.utcnow()
    posts = MarketplacePost.query.filter_by(
        account_id=product.account_id,
        product_id=product.id,
        status="active",
    ).all()
    for post in posts:
        post.status = "archived"
        post.updated_at = now
    return len(posts)


def sync_marketplace_from_product(
    product,
    user_id: int,
    *,
    image_url: str | None = None,
    list_on_bazaar: bool = True,
    db_session=None,
):
    """
    Create or update a public marketplace listing linked to a POS product.
    Returns the MarketplacePost or None if listing is removed/disabled.
    """
    from models import MarketplacePost

    if not list_on_bazaar or product.status != "active":
        archive_listings_for_product(product)
        return None

    bazaar_cat = bazaar_category_for_product(product)
    cat_name = product.category.name if getattr(product, "category", None) else None
    raw_img = image_url or product.image_url
    force = is_placeholder_image(raw_img)
    img = resolve_listing_image(product.name, raw_img, cat_name, force_demo=force)

    existing = MarketplacePost.query.filter_by(
        account_id=product.account_id,
        product_id=product.id,
        status="active",
    ).first()

    if existing:
        existing.title = product.name
        existing.description = product.description or f"SKU: {product.sku or '—'}"
        existing.price = Decimal(str(product.selling_price or 0))
        existing.bazaar_category = bazaar_cat
        if image_url or not existing.image_url:
            existing.image_url = img
        existing.visibility = "public"
        existing.updated_at = __import__("datetime").datetime.utcnow()
        return existing

    post = MarketplacePost(
        account_id=product.account_id,
        created_by=user_id,
        product_id=product.id,
        title=product.name,
        description=product.description or f"SKU: {product.sku or '—'}",
        price=Decimal(str(product.selling_price or 0)),
        image_url=img,
        bazaar_category=bazaar_cat,
        visibility="public",
        status="active",
    )
    if db_session:
        db_session.add(post)
    else:
        from models import db
        db.session.add(post)
    return post


def enrich_post_dict(post_dict: dict, post) -> dict:
    """Add bazaar_category and category_name for clients."""
    import json

    d = dict(post_dict)
    slug = getattr(post, "bazaar_category", None)
    cat_name = None
    if getattr(post, "product", None) and post.product.category:
        cat_name = post.product.category.name
    if not slug:
        slug = map_to_bazaar_slug(cat_name, post.title, getattr(post.account, "business_type", None) if post.account else None)
        d["bazaar_category"] = slug
    else:
        d["bazaar_category"] = slug
    d["category_name"] = cat_name
    listing_type = getattr(post, "listing_type", None) or "product"
    d["listing_type"] = listing_type

    stay_meta = d.get("stay_meta") or {}
    if not stay_meta and getattr(post, "stay_meta_json", None):
        try:
            stay_meta = json.loads(post.stay_meta_json)
        except (json.JSONDecodeError, TypeError):
            stay_meta = {}
    if listing_type == "stay" or slug == "stays":
        d["stay_meta"] = stay_meta
        d["from_price"] = stay_meta.get("display_rate") or d.get("price")
        d["availability_badge"] = stay_meta.get("availability_badge")
        d["location_city"] = stay_meta.get("location_city")
        d["location_country"] = stay_meta.get("location_country")
        d["min_nights"] = stay_meta.get("min_nights", 1)
        d["max_occupancy"] = stay_meta.get("max_occupancy")
        if stay_meta.get("strike_rate"):
            d["strike_rate"] = stay_meta["strike_rate"]
        if stay_meta.get("price_animation"):
            d["price_animation"] = stay_meta["price_animation"]
        if stay_meta.get("flash_label"):
            d["flash_label"] = stay_meta["flash_label"]
        if stay_meta.get("currency_code"):
            d["currency_code"] = stay_meta["currency_code"]
        if stay_meta.get("contact_phone"):
            d["contact_phone"] = stay_meta["contact_phone"]
        if stay_meta.get("contact_email"):
            d["contact_email"] = stay_meta["contact_email"]

    title = d.get("title") or post.title
    if should_use_ai_demo(title, d.get("image_url")):
        d["image_url"] = resolve_listing_image(
            title,
            None,
            cat_name or d.get("bazaar_category"),
            force_demo=True,
        )
    return d