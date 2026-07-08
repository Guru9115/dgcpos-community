"""
Name-matched demo product images — AI-style ecommerce photos from product titles.
Replaces unrelated Picsum random photos with prompt-based product visuals.
"""
from __future__ import annotations

import hashlib
import re
from urllib.parse import quote

# Keyword → rich product-photo prompt (name inserted where useful)
_PROMPT_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"sari|saree", re.I), "elegant {name} silk saree fabric product photo, draped on mannequin, studio lighting, Nepal fashion retail"),
    (re.compile(r"kurta", re.I), "{name} cotton kurta ethnic wear flat lay product photography, white background, ecommerce"),
    (re.compile(r"shoe|sandal|footwear", re.I), "{name} running shoes footwear product photo, side angle, clean white background"),
    (re.compile(r"shawl", re.I), "{name} handmade wool shawl textile product photo, folded display, artisan craft"),
    (re.compile(r"jeans|denim", re.I), "{name} blue denim jeans clothing product photo, flat lay, fashion catalog"),
    (re.compile(r"rice|basmati", re.I), "{name} rice bag grocery product photo, supermarket packaging, Nepal kirana"),
    (re.compile(r"oil|sunflower", re.I), "{name} cooking oil bottle grocery product photo, retail shelf style"),
    (re.compile(r"potato|tomato|vegetable|fruit", re.I), "fresh {name} produce grocery product photo, market display, vibrant"),
    (re.compile(r"honey", re.I), "{name} honey jar grocery product photo, golden amber, clean background"),
    (re.compile(r"tea|masala", re.I), "{name} tea pack grocery product photo, retail packaging"),
    (re.compile(r"phone|mobile|earbud|charger|cable|electronic", re.I), "{name} electronics gadget product photo, tech catalog, white background"),
    (re.compile(r"bulb|led", re.I), "{name} LED light bulb product photo, packaging style, white background"),
    (re.compile(r"power.?bank", re.I), "{name} portable power bank electronics product photo"),
    (re.compile(r"cream|soap|beauty|cosmetic|perfume", re.I), "{name} beauty cosmetic product photo, bottle packaging, soft lighting"),
    (re.compile(r"toy|baby|kid", re.I), "{name} kids toy product photo, colorful, white background"),
    (re.compile(r"kitchen|utensil|home", re.I), "{name} home kitchen product photo, catalog style"),
    (re.compile(r"t-?shirt|shirt|apparel|cloth", re.I), "{name} apparel clothing product photo, flat lay, fashion ecommerce"),
]


def _img_seed(name: str) -> str:
    return hashlib.md5((name or "product").strip().lower().encode()).hexdigest()[:12]


def ai_product_prompt(name: str, category: str | None = None) -> str:
    """Build a descriptive AI image prompt from product name + category."""
    title = (name or "product").strip()
    hay = f"{title} {category or ''}"
    for pattern, template in _PROMPT_RULES:
        if pattern.search(hay):
            return template.format(name=title)
    cat_bit = f", {category} category" if category else ""
    return (
        f"professional ecommerce product photography of {title}{cat_bit}, "
        "isolated on clean white background, high detail, Nepal retail catalog, commercial photo"
    )


def demo_product_image_url(
    name: str,
    w: int = 480,
    h: int = 360,
    category: str | None = None,
) -> str:
    """Stable AI demo image URL matched to product name."""
    prompt = ai_product_prompt(name, category)
    seed = _img_seed(name)
    encoded = quote(prompt, safe="")
    return (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width={w}&height={h}&seed={seed}&nologo=true&enhance=true"
    )


_NAMED_PRODUCT = re.compile(
    r"sari|saree|kurta|shoe|shawl|jeans|dress|rice|honey|phone|bulb|kurta|momos?|tea",
    re.I,
)


def is_placeholder_image(url: str | None) -> bool:
    """True if URL is auto-generated demo, not a seller upload."""
    if not url or not str(url).strip():
        return True
    u = str(url).strip().lower()
    if u.startswith("/api/marketplace/files/"):
        return False
    if "picsum.photos" in u:
        return True
    if "pollinations.ai" in u:
        return True
    if "placeholder" in u:
        return True
    return False


def should_use_ai_demo(title: str | None, image_url: str | None) -> bool:
    """Use name-matched AI photo instead of unrelated uploads."""
    if is_placeholder_image(image_url):
        return True
    if image_url and "/api/marketplace/files/" in str(image_url):
        if _NAMED_PRODUCT.search(title or ""):
            return True
    return False