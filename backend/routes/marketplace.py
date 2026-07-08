"""
DGC Bazaar — store owners post products; cross-store likes, orders, DMs, delivery.
"""
import json
import os
import uuid
from datetime import datetime
from decimal import Decimal

from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename

from auth_utils import token_required
from audit import log_audit
from models import (
    db, MarketplacePost, MarketplaceLike, MarketplaceOrder,
    Account, Product, MessengerThread, MessengerMessage, DeliveryOrder, DeliveryItem,
)
from schemas import (
    MarketplacePostSchema,
    MarketplaceOrderSchema,
    MarketplaceOrderStatusSchema,
    BazaarGuestCheckoutSchema,
    BazaarStayCheckoutLineSchema,
    BazaarTrackOrderSchema,
)
from bazaar_sync import (
    archive_marketplace_post,
    sync_marketplace_from_product,
    resolve_listing_image,
    map_to_bazaar_slug,
    enrich_post_dict,
    bazaar_category_for_product,
)
from storage import save_bytes, serve_upload

marketplace_bp = Blueprint("marketplace", __name__)

UPLOAD_SUBDIR = "marketplace"
MAX_FILE_BYTES = 5 * 1024 * 1024
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def _account_id():
    return getattr(current_user, "account_id", None)


def _resolve_account_id():
    aid = _account_id()
    if aid:
        return aid
    if current_user.role == "superadmin":
        from models import Account
        acc = Account.query.order_by(Account.id.asc()).first()
        return acc.id if acc else None
    return None


def _can_post():
    return current_user.role in ("owner", "superadmin", "manager")


def _upload_dir(account_id: int) -> str:
    base = os.path.join(current_app.root_path, "uploads", UPLOAD_SUBDIR, str(account_id))
    os.makedirs(base, exist_ok=True)
    return base


def _save_image(file, account_id: int) -> str:
    if not file or not file.filename:
        return None
    ext = os.path.splitext(secure_filename(file.filename))[1].lower()
    if ext not in ALLOWED_EXT:
        raise ValueError("Unsupported image type")
    raw = file.read()
    if len(raw) > MAX_FILE_BYTES:
        raise ValueError("Image must be under 5 MB")
    stored = f"{uuid.uuid4().hex}{ext}"
    save_bytes(f"{UPLOAD_SUBDIR}/{account_id}/{stored}", raw)
    return f"/api/marketplace/files/{account_id}/{stored}"


def _next_order_number():
    last = (
        MarketplaceOrder.query
        .filter(MarketplaceOrder.order_number.like("MPO-%"))
        .order_by(MarketplaceOrder.id.desc())
        .with_for_update()
        .first()
    )
    n = 1
    if last:
        try:
            n = int(last.order_number.split("-")[1]) + 1
        except (ValueError, IndexError):
            pass
    return f"MPO-{n:05d}"


def _next_delivery_number():
    last = (
        DeliveryOrder.query
        .filter(DeliveryOrder.delivery_number.like("DEL-%"))
        .order_by(DeliveryOrder.id.desc())
        .with_for_update()
        .first()
    )
    n = 1
    if last:
        try:
            n = int(last.delivery_number.split("-")[1]) + 1
        except (ValueError, IndexError):
            pass
    return f"DEL-{n:05d}"


def _like_counts(post_ids):
    if not post_ids:
        return {}
    rows = (
        db.session.query(MarketplaceLike.post_id, db.func.count(MarketplaceLike.id))
        .filter(MarketplaceLike.post_id.in_(post_ids))
        .group_by(MarketplaceLike.post_id)
        .all()
    )
    return {pid: cnt for pid, cnt in rows}


def _liked_by_user(post_ids, user_id):
    if not post_ids or not user_id:
        return set()
    rows = MarketplaceLike.query.filter(
        MarketplaceLike.post_id.in_(post_ids),
        MarketplaceLike.user_id == user_id,
    ).all()
    return {r.post_id for r in rows}


def _enrich_posts(posts):
    aid = _account_id()
    manage_aid = _resolve_account_id() if current_user.role == "superadmin" else aid
    uid = getattr(current_user, "id", None)
    post_ids = [p.id for p in posts]
    counts = _like_counts(post_ids)
    liked = _liked_by_user(post_ids, uid)
    out = []
    for p in posts:
        d = p.to_dict()
        if current_user.role == "superadmin":
            d["is_mine"] = True
        else:
            d["is_mine"] = bool(aid and p.account_id == aid)
        d["manage_account_id"] = manage_aid
        d["like_count"] = counts.get(p.id, 0)
        d["liked_by_me"] = p.id in liked
        out.append(d)
    return out


def _public_post_dict(post):
    d = post.to_dict()
    d.pop("is_mine", None)
    return d


def _guest_shopper_account():
    """Shared platform account for public bazaar guest checkouts."""
    acc = Account.query.filter_by(name="DGC Bazaar Shoppers").first()
    if acc:
        return acc
    acc = Account(
        name="DGC Bazaar Shoppers",
        business_type="marketplace",
        business_location="Nepal",
        subscription_plan="beta",
        subscription_status="active",
    )
    db.session.add(acc)
    db.session.flush()
    from merchant_customer_id import ensure_merchant_customer_id
    ensure_merchant_customer_id(acc.id)
    return acc


def _notify_seller_messenger(order, post, buyer_account, buyer_user, *, stay_booking=None):
    """DM order to seller's messenger inbox."""
    seller_id = order.seller_account_id
    buyer_name = order.guest_name or (buyer_account.name if buyer_account else "DGC Store")
    synthetic_email = f"marketplace-{order.buyer_account_id}@dgcpos.net"

    thread = MessengerThread.query.filter_by(
        account_id=seller_id,
        contact_type="dealer",
        contact_id=order.buyer_account_id,
    ).first()

    if not thread:
        thread = MessengerThread(
            account_id=seller_id,
            contact_type="dealer",
            contact_id=order.buyer_account_id,
            contact_name=buyer_name,
            contact_email=synthetic_email,
            contact_phone=order.delivery_phone,
            last_message="Bazaar order",
            last_message_at=datetime.utcnow(),
            unread_store=0,
        )
        db.session.add(thread)
        db.session.flush()

    order_payload = {
        "source": "marketplace",
        "marketplace_order_id": order.id,
        "order_number": order.order_number,
        "post_id": post.id,
        "title": post.title,
        "quantity": order.quantity,
        "unit_price": float(order.unit_price or 0),
        "total_amount": float(order.total_amount or 0),
        "buyer_store": buyer_name,
        "buyer_user": (buyer_user.full_name or buyer_user.username) if buyer_user else None,
        "delivery_address": order.delivery_address,
        "delivery_phone": order.delivery_phone,
        "message": order.message,
    }
    if stay_booking:
        order_payload["listing_type"] = "stay"
        order_payload["booking_number"] = stay_booking.booking_number
        order_payload["check_in_date"] = stay_booking.check_in_date.isoformat()
        order_payload["check_out_date"] = stay_booking.check_out_date.isoformat()
        order_payload["nights"] = stay_booking.nights
        order_payload["adults"] = stay_booking.adults
        order_payload["booking_status"] = stay_booking.status
    body = order.message or f"Order {order.order_number}: {post.title} × {order.quantity}"

    msg = MessengerMessage(
        thread_id=thread.id,
        account_id=seller_id,
        sender_role="contact",
        message_type="order",
        body=body[:500],
        order_payload=json.dumps(order_payload),
        order_status="pending",
    )
    db.session.add(msg)
    thread.last_message = f"🛒 {post.title} — {buyer_name}"
    thread.last_message_at = datetime.utcnow()
    thread.unread_store = (thread.unread_store or 0) + 1
    order.messenger_thread_id = thread.id
    return thread


def _create_delivery_for_order(order, post, notes=None, assigned_rider=None):
    delivery = DeliveryOrder(
        delivery_number=_next_delivery_number(),
        customer_name=order.buyer_store_name if hasattr(order, "buyer_store_name") else (
            order.buyer.name if order.buyer else "Bazaar buyer"
        ),
        customer_phone=order.delivery_phone,
        delivery_address=order.delivery_address,
        created_by=current_user.id if current_user.is_authenticated else None,
        assigned_rider=assigned_rider,
        status="pending",
        notes=notes or f"Bazaar order {order.order_number}",
    )
    db.session.add(delivery)
    db.session.flush()
    item = DeliveryItem(
        delivery_id=delivery.id,
        description=f"{post.title} (MPO {order.order_number})",
        qty=order.quantity or 1,
    )
    db.session.add(item)
    order.delivery_order_id = delivery.id
    return delivery


# ── Public feed (dgcpos.net) ────────────────────────────────────────────────

def _is_stay_post(post) -> bool:
    return (getattr(post, "listing_type", None) == "stay") or (
        getattr(post, "bazaar_category", None) == "stays"
    )


def _stay_seller_visible(post) -> bool:
    from hospitality.feature_gate import hospitality_enabled_for_account
    return hospitality_enabled_for_account(getattr(post, "account", None))


def build_public_feed(*, category: str | None = None, limit: int = 40) -> list[dict]:
    """Shared public bazaar feed builder for marketplace and hospitality alias routes."""
    category = (category or "").strip().lower()
    limit = min(int(limit or 40), 80)
    query = MarketplacePost.query.filter(
        MarketplacePost.visibility == "public",
        MarketplacePost.status == "active",
    )
    fetch_limit = limit * 6 if category and category != "all" else limit * 2
    posts = query.order_by(MarketplacePost.created_at.desc()).limit(fetch_limit).all()

    filtered = []
    for p in posts:
        if _is_stay_post(p) and not _stay_seller_visible(p):
            continue
        if category and category != "all":
            slug = p.bazaar_category or bazaar_category_for_product(p)
            if slug != category and not (category == "stays" and _is_stay_post(p)):
                continue
        filtered.append(p)
        if len(filtered) >= limit:
            break

    post_ids = [p.id for p in filtered]
    counts = _like_counts(post_ids)
    return [
        enrich_post_dict(
            {**_public_post_dict(p), "like_count": counts.get(p.id, 0)},
            p,
        )
        for p in filtered
    ]


@marketplace_bp.route("/public", methods=["GET"])
def public_feed():
    limit = min(int(request.args.get("limit", 40)), 80)
    category = (request.args.get("category") or "").strip().lower()
    return jsonify(build_public_feed(category=category, limit=limit))


def _bazaar_esewa_redirect(amount, order_ref, return_url):
    """Build eSewa form redirect for public bazaar guest checkout."""
    merchant = current_app.config.get("ESEWA_MERCHANT_CODE") or "EPAYTEST"
    is_uat = merchant == "EPAYTEST" or current_app.config.get("ESEWA_ENV") == "uat"
    base = "https://uat.esewa.com.np" if is_uat else "https://esewa.com.np"
    amt = f"{float(amount):.2f}"
    return {
        "type": "form_redirect",
        "url": f"{base}/epay/main",
        "fields": {
            "amt": amt,
            "pdc": "0",
            "psc": "0",
            "txAmt": "0",
            "tAmt": amt,
            "pid": order_ref,
            "scd": merchant,
            "su": f"{return_url}&status=success",
            "fu": f"{return_url}&status=fail",
        },
    }


@marketplace_bp.route("/public/shop-config", methods=["GET"])
def public_shop_config():
    """Public bazaar checkout config — guest only, COD or eSewa (superadmin toggles)."""
    from platform_modules import (
        bazaar_payment_method_defs,
        module_enabled,
    )

    bazaar_live = module_enabled("site_bazaar") and module_enabled("bazaar_marketplace")
    guest_ok = bazaar_live and module_enabled("guest_checkout")
    methods = bazaar_payment_method_defs(current_app.config)
    return jsonify({
        "bazaar_available": bazaar_live,
        "guest_checkout": guest_ok,
        "login_required": False,
        "payment_methods": [m for m in methods if not m.get("disabled")],
        "bazaar_cod_enabled": module_enabled("bazaar_cod"),
        "bazaar_online_enabled": module_enabled("bazaar_online"),
        "currency": "NPR",
        "currency_symbol": "Rs",
        "legal": {
            "terms_url": "https://dgcpos.net/terms",
            "privacy_url": "https://dgcpos.net/privacy",
        },
    })


def _process_stay_guest_line(line, data, guest_account, errors_list):
    """Process one bazaar stay checkout line. Returns order dict or None."""
    from hospitality.bazaar_checkout import (
        NonNprStayCheckoutError,
        StayDatesUnavailableError,
        create_stay_guest_order,
        parse_stay_dates,
        resolve_room_for_stay_post,
    )
    from hospitality.feature_gate import hospitality_enabled_for_account
    from email_service import send_stay_booking_confirmation

    stay_schema = BazaarStayCheckoutLineSchema()
    line_errors = stay_schema.validate(line)
    if line_errors:
        errors_list.append({"post_id": line.get("post_id"), "error": "Invalid stay dates", "fields": line_errors})
        return None

    post_id = int(line["post_id"])
    post = MarketplacePost.query.filter_by(
        id=post_id,
        visibility="public",
        status="active",
    ).first()
    if not post or not _is_stay_post(post):
        errors_list.append({"post_id": post_id, "error": "Stay listing not available"})
        return None
    if not hospitality_enabled_for_account(post.account):
        errors_list.append({"post_id": post_id, "error": "Stay booking unavailable"})
        return None

    room = resolve_room_for_stay_post(post)
    if not room:
        errors_list.append({"post_id": post_id, "error": "Room not found for listing"})
        return None

    try:
        check_in, check_out, adults = parse_stay_dates(line)
        order, booking = create_stay_guest_order(
            post=post,
            room=room,
            check_in=check_in,
            check_out=check_out,
            adults=adults,
            guest_account=guest_account,
            guest_name=data["guest_name"],
            guest_email=data.get("guest_email"),
            delivery_phone=data["delivery_phone"],
            delivery_address=data["delivery_address"],
            payment_method=data.get("payment_method") or "cod",
            message=(data.get("message") or "").strip(),
            order_number=_next_order_number(),
        )
    except NonNprStayCheckoutError as exc:
        raise exc
    except StayDatesUnavailableError:
        errors_list.append({"post_id": post_id, "error": "Dates unavailable"})
        return None
    except ValueError as exc:
        errors_list.append({"post_id": post_id, "error": str(exc)})
        return None

    _notify_seller_messenger(order, post, guest_account, None, stay_booking=booking)
    log_audit(
        "marketplace_order.guest_checkout",
        resource="marketplace_order",
        resource_id=str(order.id),
        detail={
            "order_number": order.order_number,
            "guest_email": data.get("guest_email"),
            "post_id": post.id,
            "payment_method": order.payment_method,
            "listing_type": "stay",
            "booking_number": booking.booking_number,
            "check_in": booking.check_in_date.isoformat(),
            "check_out": booking.check_out_date.isoformat(),
        },
    )
    order_dict = order.to_dict(include_post=True)
    order_dict["booking"] = booking.to_dict(include_room=True)
    order_dict["listing_type"] = "stay"
    if data.get("guest_email"):
        try:
            send_stay_booking_confirmation(
                to_email=data["guest_email"],
                guest_name=data["guest_name"],
                booking=booking,
                order=order,
                post=post,
            )
        except Exception:
            pass
    return order_dict


@marketplace_bp.route("/public/guest-checkout", methods=["POST"])
def public_guest_checkout():
    """Public bazaar cart checkout — no POS app login required."""
    from platform_modules import assert_bazaar_payment_allowed, module_enabled
    from hospitality.bazaar_checkout import NonNprStayCheckoutError

    if not module_enabled("site_bazaar"):
        return jsonify({"error": "Marketplace is temporarily offline"}), 503
    if not module_enabled("guest_checkout") or not module_enabled("bazaar_marketplace"):
        return jsonify({"error": "Guest checkout is temporarily unavailable"}), 503

    raw = request.get_json(silent=True) or {}
    try:
        assert_bazaar_payment_allowed(raw.get("payment_method") or "cod")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    schema = BazaarGuestCheckoutSchema()
    errors = schema.validate(raw)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422
    data = schema.load(raw)

    guest_account = _guest_shopper_account()
    created_orders = []
    errors_list = []
    has_stay_conflict = False

    for line in data["items"]:
        post_id = line.get("post_id")
        if not post_id:
            errors_list.append({"post_id": post_id, "error": "Invalid item"})
            continue
        try:
            post_id = int(post_id)
        except (TypeError, ValueError):
            errors_list.append({"post_id": post_id, "error": "Invalid listing"})
            continue

        post = MarketplacePost.query.filter_by(
            id=post_id,
            visibility="public",
            status="active",
        ).first()
        if not post:
            errors_list.append({"post_id": post_id, "error": "Listing not available"})
            continue

        if _is_stay_post(post):
            try:
                order_dict = _process_stay_guest_line(line, data, guest_account, errors_list)
            except NonNprStayCheckoutError as exc:
                db.session.rollback()
                return jsonify(exc.payload), 422
            if order_dict:
                created_orders.append(order_dict)
            elif any(e.get("post_id") == post_id and e.get("error") == "Dates unavailable" for e in errors_list):
                has_stay_conflict = True
            continue

        qty = int(line.get("quantity") or 1)
        if qty < 1:
            errors_list.append({"post_id": post_id, "error": "Invalid item"})
            continue

        unit = Decimal(str(post.price or 0))
        total = unit * qty
        pay_label = "eSewa" if data.get("payment_method") == "esewa" else "COD"
        note = (data.get("message") or "").strip()
        guest_note = f"[Bazaar guest · {pay_label}] {note}".strip()

        order = MarketplaceOrder(
            order_number=_next_order_number(),
            post_id=post.id,
            buyer_account_id=guest_account.id,
            buyer_user_id=None,
            seller_account_id=post.account_id,
            quantity=qty,
            unit_price=unit,
            total_amount=total,
            message=guest_note,
            delivery_address=data["delivery_address"],
            delivery_phone=data["delivery_phone"],
            guest_name=data["guest_name"],
            guest_email=data["guest_email"],
            payment_method=data.get("payment_method") or "cod",
            is_guest=True,
            status="pending",
        )
        db.session.add(order)
        db.session.flush()
        _notify_seller_messenger(order, post, guest_account, None)
        log_audit(
            "marketplace_order.guest_checkout",
            resource="marketplace_order",
            resource_id=str(order.id),
            detail={
                "order_number": order.order_number,
                "guest_email": data["guest_email"],
                "post_id": post.id,
                "payment_method": order.payment_method,
            },
        )
        created_orders.append(order.to_dict(include_post=True))

    if has_stay_conflict and not created_orders:
        db.session.rollback()
        return jsonify({
            "error": "Selected stay dates are no longer available",
            "item_errors": errors_list,
        }), 409

    if not created_orders:
        db.session.rollback()
        return jsonify({"error": "No valid items in cart", "item_errors": errors_list}), 400

    db.session.commit()
    grand_total = sum(float(o["total_amount"]) for o in created_orders)
    order_numbers = [o["order_number"] for o in created_orders]
    primary_ref = order_numbers[0] if order_numbers else "BAZAAR"
    payment_method = data.get("payment_method") or "cod"
    has_stay = any(o.get("listing_type") == "stay" for o in created_orders)

    payload = {
        "ok": True,
        "orders": created_orders,
        "order_numbers": order_numbers,
        "grand_total": grand_total,
        "payment_method": payment_method,
        "message": (
            "Reservation request received! The property will confirm your stay shortly."
            if has_stay
            else "Order placed! The seller will contact you to confirm delivery."
        ),
    }

    if payment_method == "esewa" and grand_total > 0:
        bazaar_return = request.headers.get("Origin") or "https://dgcpos.net"
        return_url = f"{bazaar_return.rstrip('/')}/dgcbazaar.html?orders={','.join(order_numbers)}"
        payload["esewa_payment"] = _bazaar_esewa_redirect(grand_total, primary_ref, return_url)

    return jsonify(payload), 201


@marketplace_bp.route("/public/esewa-confirm", methods=["POST"])
def public_esewa_confirm_stay():
    """Confirm tentative bazaar stay bookings after eSewa payment return."""
    from hospitality.bazaar_checkout import confirm_booking_after_esewa

    raw = request.get_json(silent=True) or {}
    order_number = (raw.get("order_number") or "").strip()
    if not order_number:
        return jsonify({"error": "order_number required"}), 400

    booking = confirm_booking_after_esewa(order_number)
    if not booking:
        return jsonify({"error": "Stay booking not found or already processed"}), 404
    return jsonify({
        "ok": True,
        "booking_number": booking.booking_number,
        "status": booking.status,
    })


@marketplace_bp.route("/public/track-order", methods=["POST"])
def public_track_order():
    """Track a guest bazaar order by order number + phone."""
    raw = request.get_json(silent=True) or {}
    schema = BazaarTrackOrderSchema()
    errors = schema.validate(raw)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422
    data = schema.load(raw)

    phone = data["delivery_phone"].strip()
    order = MarketplaceOrder.query.filter(
        MarketplaceOrder.order_number == data["order_number"].strip().upper(),
        MarketplaceOrder.delivery_phone == phone,
        MarketplaceOrder.is_guest == True,
    ).first()
    if not order:
        order = MarketplaceOrder.query.filter(
            MarketplaceOrder.order_number.ilike(data["order_number"].strip()),
            MarketplaceOrder.delivery_phone.contains(phone[-10:]),
        ).first()
    if not order:
        return jsonify({"error": "Order not found. Check order number and phone."}), 404
    return jsonify(order.to_dict(include_post=True))


@marketplace_bp.route("/public/files/<int:account_id>/<path:filename>", methods=["GET"])
def serve_public_file(account_id, filename):
    safe = secure_filename(filename)
    if safe != filename:
        return jsonify({"error": "Invalid file"}), 400
    url = f"/api/marketplace/files/{account_id}/{filename}"
    from models import BazaarAd
    post = MarketplacePost.query.filter(
        MarketplacePost.account_id == account_id,
        MarketplacePost.image_url == url,
        MarketplacePost.visibility == "public",
        MarketplacePost.status == "active",
    ).first()
    ad = None if post else BazaarAd.query.filter(
        BazaarAd.account_id == account_id,
        BazaarAd.image_url == url,
        BazaarAd.status.in_(("active", "pending_approval")),
    ).first()
    if not post and not ad:
        return jsonify({"error": "Not found"}), 404
    resp = serve_upload(
        f"{UPLOAD_SUBDIR}/{account_id}/{filename}",
        directory=_upload_dir(account_id),
        filename=filename,
    )
    if resp:
        return resp
    return jsonify({"error": "Not found"}), 404


# ── Authenticated feed ──────────────────────────────────────────────────────

@marketplace_bp.route("/", methods=["GET"])
@token_required
@login_required
def list_posts():
    scope = request.args.get("scope", "feed")
    limit = min(int(request.args.get("limit", 50)), 100)
    query = MarketplacePost.query

    if scope == "mine":
        manage_aid = _resolve_account_id()
        if not manage_aid:
            return jsonify([])
        query = query.filter(
            MarketplacePost.account_id == manage_aid,
            MarketplacePost.status == "active",
        )
    elif scope == "all" and current_user.role == "superadmin":
        query = query.filter(MarketplacePost.status == "active")
    else:
        query = query.filter(
            MarketplacePost.visibility == "public",
            MarketplacePost.status == "active",
        )

    posts = query.order_by(MarketplacePost.created_at.desc()).limit(limit).all()
    return jsonify(_enrich_posts(posts))


@marketplace_bp.route("/<int:post_id>", methods=["GET"])
@token_required
@login_required
def get_post(post_id):
    post = MarketplacePost.query.get_or_404(post_id)
    enriched = _enrich_posts([post])
    return jsonify(enriched[0] if enriched else post.to_dict())


@marketplace_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_post():
    if not _can_post():
        return jsonify({"error": "Only store owners and managers can post"}), 403
    account_id = _resolve_account_id()
    if not account_id:
        return jsonify({"error": "No store account linked"}), 400

    image_url = None
    raw = {}
    extra_urls = []

    if request.content_type and "multipart/form-data" in request.content_type:
        pid_raw = request.form.get("product_id")
        raw = {
            "title": request.form.get("title", "").strip(),
            "description": request.form.get("description", "").strip(),
            "price": request.form.get("price", 0),
            "visibility": request.form.get("visibility", "public"),
            "bazaar_category": (request.form.get("bazaar_category") or "").strip() or None,
            "product_id": int(pid_raw) if pid_raw and str(pid_raw).isdigit() else None,
        }
        file = request.files.get("file") or request.files.get("image")
        extra_files = request.files.getlist("extra_files") or request.files.getlist("extra_files[]")
        if file and file.filename:
            try:
                image_url = _save_image(file, account_id)
            except ValueError as e:
                return jsonify({"error": str(e)}), 422
        for ef in extra_files[:4]:
            if ef and ef.filename:
                try:
                    url = _save_image(ef, account_id)
                    if url:
                        extra_urls.append(url)
                except ValueError as e:
                    return jsonify({"error": str(e)}), 422
    else:
        raw = request.get_json(silent=True) or {}
        image_url = raw.get("image_url")

    schema = MarketplacePostSchema()
    errors = schema.validate(raw)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422
    data = schema.load(raw)

    product_id = data.get("product_id")
    linked_product = None
    if product_id:
        linked_product = Product.query.filter_by(id=product_id, account_id=account_id).first()
        if not linked_product:
            return jsonify({"error": "Linked product not found"}), 404
        image_url = resolve_listing_image(linked_product.name, image_url or linked_product.image_url)
        bazaar_cat = map_to_bazaar_slug(
            linked_product.category.name if linked_product.category else None,
            linked_product.name,
            getattr(current_user.account, "business_type", None) if getattr(current_user, "account", None) else None,
        )
    else:
        bazaar_cat = data.get("bazaar_category") or map_to_bazaar_slug(None, data["title"])
        if not image_url:
            image_url = resolve_listing_image(data["title"], None, bazaar_cat)

    extra_images_json = json.dumps(extra_urls) if extra_urls else None
    post = MarketplacePost(
        account_id=account_id,
        created_by=current_user.id,
        title=data["title"],
        description=data.get("description") or "",
        price=Decimal(str(data.get("price") or 0)),
        image_url=image_url,
        product_id=linked_product.id if linked_product else None,
        bazaar_category=bazaar_cat,
        extra_images=extra_images_json,
        visibility=data.get("visibility") or "public",
        status="active",
    )
    db.session.add(post)
    db.session.flush()
    log_audit(
        "marketplace_post.create",
        resource="marketplace_post",
        resource_id=str(post.id),
        detail={"title": post.title, "price": float(post.price or 0)},
    )
    db.session.commit()

    result = post.to_dict()
    result["is_mine"] = True
    result["like_count"] = 0
    result["liked_by_me"] = False
    return jsonify(result), 201


@marketplace_bp.route("/from-product/<int:product_id>", methods=["POST"])
@token_required
@login_required
def list_from_product(product_id):
    """Quick-list a POS inventory product on DGC Bazaar (optional photo upload)."""
    if not _can_post():
        return jsonify({"error": "Only store owners and managers can post"}), 403
    account_id = _account_id()
    if not account_id:
        return jsonify({"error": "No store account linked"}), 400

    product = Product.query.filter_by(id=product_id, account_id=account_id, status="active").first()
    if not product:
        return jsonify({"error": "Product not found"}), 404

    image_url = None
    file = request.files.get("file") or request.files.get("image")
    if file and file.filename:
        try:
            image_url = _save_image(file, account_id)
        except ValueError as e:
            return jsonify({"error": str(e)}), 422

    had_listing = MarketplacePost.query.filter_by(
        account_id=account_id,
        product_id=product.id,
        status="active",
    ).first() is not None

    if not product.image_url and not image_url:
        product.image_url = resolve_listing_image(product.name, None)

    post = sync_marketplace_from_product(
        product,
        current_user.id,
        image_url=image_url,
        list_on_bazaar=True,
    )
    if image_url and post:
        post.image_url = image_url
    db.session.flush()
    log_audit(
        "marketplace_post.from_product",
        resource="marketplace_post",
        resource_id=str(post.id),
        detail={"product_id": product.id, "title": post.title, "bazaar_category": post.bazaar_category},
    )
    db.session.commit()
    result = enrich_post_dict(post.to_dict(), post)
    result["is_mine"] = True
    result["like_count"] = MarketplaceLike.query.filter_by(post_id=post.id).count()
    result["liked_by_me"] = False
    return jsonify(result), 200 if had_listing else 201


@marketplace_bp.route("/<int:post_id>", methods=["DELETE"])
@token_required
@login_required
def delete_post(post_id):
    post = MarketplacePost.query.get_or_404(post_id)
    if current_user.role != "superadmin" and post.account_id != _account_id():
        return jsonify({"error": "Permission denied"}), 403
    if not _can_post() and current_user.role != "superadmin":
        return jsonify({"error": "Permission denied"}), 403

    log_audit(
        "marketplace_post.delete",
        resource="marketplace_post",
        resource_id=str(post.id),
        detail={"title": post.title, "archived": True},
    )
    archive_marketplace_post(post)
    db.session.commit()
    return jsonify({"ok": True, "archived": True})


@marketplace_bp.route("/files/<int:account_id>/<path:filename>", methods=["GET"])
@token_required
@login_required
def serve_file(account_id, filename):
    safe = secure_filename(filename)
    if safe != filename:
        return jsonify({"error": "Invalid file"}), 400
    resp = serve_upload(
        f"{UPLOAD_SUBDIR}/{account_id}/{safe}",
        directory=_upload_dir(account_id),
        filename=safe,
    )
    if resp:
        return resp
    return jsonify({"error": "Not found"}), 404


# ── Likes ───────────────────────────────────────────────────────────────────

@marketplace_bp.route("/<int:post_id>/like", methods=["POST"])
@token_required
@login_required
def toggle_like(post_id):
    post = MarketplacePost.query.get_or_404(post_id)
    if post.visibility != "public" or post.status != "active":
        return jsonify({"error": "Listing not available"}), 400

    existing = MarketplaceLike.query.filter_by(
        post_id=post_id,
        user_id=current_user.id,
    ).first()

    if existing:
        db.session.delete(existing)
        db.session.commit()
        count = MarketplaceLike.query.filter_by(post_id=post_id).count()
        return jsonify({"liked": False, "like_count": count})

    like = MarketplaceLike(
        post_id=post_id,
        user_id=current_user.id,
        account_id=_account_id(),
    )
    db.session.add(like)
    db.session.commit()
    count = MarketplaceLike.query.filter_by(post_id=post_id).count()
    return jsonify({"liked": True, "like_count": count})


# ── Orders ──────────────────────────────────────────────────────────────────

@marketplace_bp.route("/orders", methods=["GET"])
@token_required
@login_required
def list_orders():
    scope = request.args.get("scope", "all")
    aid = _account_id()
    if not aid:
        return jsonify([])

    query = MarketplaceOrder.query
    if scope == "incoming":
        query = query.filter(MarketplaceOrder.seller_account_id == aid)
    elif scope == "outgoing":
        query = query.filter(MarketplaceOrder.buyer_account_id == aid)
    else:
        query = query.filter(
            db.or_(
                MarketplaceOrder.seller_account_id == aid,
                MarketplaceOrder.buyer_account_id == aid,
            )
        )

    orders = query.order_by(MarketplaceOrder.created_at.desc()).limit(100).all()
    return jsonify([o.to_dict(include_post=True) for o in orders])


@marketplace_bp.route("/<int:post_id>/order", methods=["POST"])
@token_required
@login_required
def place_order(post_id):
    post = MarketplacePost.query.get_or_404(post_id)
    if post.visibility != "public" or post.status != "active":
        return jsonify({"error": "This listing is not available"}), 400

    buyer_aid = _account_id()
    if not buyer_aid:
        return jsonify({"error": "No store account linked"}), 400
    if buyer_aid == post.account_id:
        return jsonify({"error": "You cannot order from your own listing"}), 400

    raw = request.get_json(silent=True) or {}
    schema = MarketplaceOrderSchema()
    errors = schema.validate(raw)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422
    data = schema.load(raw)

    qty = data.get("quantity") or 1
    unit = Decimal(str(post.price or 0))
    total = unit * qty

    order = MarketplaceOrder(
        order_number=_next_order_number(),
        post_id=post.id,
        buyer_account_id=buyer_aid,
        buyer_user_id=current_user.id,
        seller_account_id=post.account_id,
        quantity=qty,
        unit_price=unit,
        total_amount=total,
        message=(data.get("message") or "").strip(),
        delivery_address=data["delivery_address"],
        delivery_phone=data["delivery_phone"],
        status="pending",
    )
    db.session.add(order)
    db.session.flush()

    buyer_account = Account.query.get(buyer_aid)
    _notify_seller_messenger(order, post, buyer_account, current_user)

    log_audit(
        "marketplace_order.create",
        resource="marketplace_order",
        resource_id=str(order.id),
        detail={
            "order_number": order.order_number,
            "post_id": post.id,
            "seller_account_id": post.account_id,
        },
    )
    db.session.commit()
    return jsonify(order.to_dict(include_post=True)), 201


@marketplace_bp.route("/orders/<int:order_id>/status", methods=["PUT"])
@token_required
@login_required
def update_order_status(order_id):
    order = MarketplaceOrder.query.get_or_404(order_id)
    aid = _account_id()
    is_seller = aid and order.seller_account_id == aid
    is_buyer = aid and order.buyer_account_id == aid

    raw = request.get_json(silent=True) or {}
    schema = MarketplaceOrderStatusSchema()
    errors = schema.validate(raw)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422
    data = schema.load(raw)
    new_status = data["status"]

    seller_actions = {"accepted", "rejected", "packed", "dispatched", "delivered"}
    buyer_actions = {"cancelled"}

    if new_status in seller_actions and not is_seller and current_user.role != "superadmin":
        return jsonify({"error": "Only the seller can update this status"}), 403
    if new_status in buyer_actions and not is_buyer and current_user.role != "superadmin":
        return jsonify({"error": "Only the buyer can cancel"}), 403
    if new_status == "cancelled" and order.status not in ("pending",):
        return jsonify({"error": "Order can no longer be cancelled"}), 400

    order.status = new_status
    order.updated_at = datetime.utcnow()

    if data.get("shipping_carrier"):
        order.shipping_carrier = (data.get("shipping_carrier") or "")[:64] or None
    if data.get("tracking_number"):
        order.tracking_number = (data.get("tracking_number") or "")[:128] or None
    if data.get("shipping_notes"):
        order.shipping_notes = (data.get("shipping_notes") or "")[:500] or None

    stay_post = MarketplacePost.query.get(order.post_id)
    is_stay_order = stay_post and _is_stay_post(stay_post)

    if new_status == "accepted":
        order.accepted_at = datetime.utcnow()
        if is_stay_order:
            from hospitality.bazaar_checkout import confirm_booking_from_order
            confirm_booking_from_order(order)
        elif data.get("create_delivery") and not order.delivery_order_id:
            post = MarketplacePost.query.get(order.post_id)
            if post:
                _create_delivery_for_order(
                    order, post,
                    notes=data.get("notes"),
                    assigned_rider=data.get("assigned_rider"),
                )
    elif new_status in ("rejected", "cancelled") and is_stay_order:
        from hospitality.bazaar_checkout import cancel_booking_from_order
        reason = "seller_rejected" if new_status == "rejected" else "buyer_cancelled"
        cancel_booking_from_order(order, reason=reason)
    elif new_status == "delivered":
        order.delivered_at = datetime.utcnow()
        if order.delivery_order_id:
            delivery = DeliveryOrder.query.get(order.delivery_order_id)
            if delivery and delivery.status not in ("delivered", "cancelled"):
                delivery.status = "delivered"
                delivery.delivered_at = datetime.utcnow()

    if order.messenger_thread_id:
        msg = (
            MessengerMessage.query
            .filter_by(thread_id=order.messenger_thread_id, message_type="order")
            .order_by(MessengerMessage.created_at.desc())
            .first()
        )
        if msg and msg.order_payload and not msg.order_payload.startswith("E2EE1:"):
            if new_status in ("accepted", "rejected", "delivered"):
                msg.order_status = "accepted" if new_status == "accepted" else (
                    "rejected" if new_status == "rejected" else "fulfilled"
                )

    if new_status == "dispatched" and (order.tracking_number or order.shipping_carrier):
        try:
            from routes.support_chat import get_or_create_thread, post_support_message
            from models import Account
            seller_acc = Account.query.get(order.seller_account_id)
            if seller_acc:
                thread = get_or_create_thread(seller_acc)
                tracking = order.tracking_number or "—"
                carrier = order.shipping_carrier or "Courier"
                body = f"Order {order.order_number} dispatched via {carrier}. Tracking: {tracking}"
                post_support_message(
                    thread,
                    sender_role="platform",
                    body=body,
                    message_type="shipping",
                    meta={
                        "order_number": order.order_number,
                        "tracking_number": order.tracking_number,
                        "shipping_carrier": order.shipping_carrier,
                        "buyer": order.guest_name or (order.buyer.name if order.buyer else None),
                    },
                )
        except Exception:
            pass

    log_audit(
        "marketplace_order.status",
        resource="marketplace_order",
        resource_id=str(order.id),
        detail={"status": new_status, "order_number": order.order_number},
    )
    db.session.commit()
    return jsonify(order.to_dict(include_post=True))