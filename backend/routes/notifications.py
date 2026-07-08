"""Notifications — real-time alerts for the bell icon."""
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from auth_utils import token_required
from models import (
    db, Product, Alteration, DeliveryOrder, Layaway, Sale,
    MarketplaceOrder, MarketplaceLike, MarketplacePost, SupportThread,
)
from datetime import date, timedelta

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.route("/", methods=["GET"])
@token_required
@login_required
def get_notifications():
    notes = []
    account_id = getattr(current_user, "account_id", None)

    # 1. Low / out-of-stock
    low = Product.query.filter(
        Product.stock_qty <= Product.reorder_level,
        Product.status == "active"
    ).order_by(Product.stock_qty.asc()).limit(10).all()
    for p in low:
        lvl = "critical" if p.stock_qty == 0 else "warning"
        notes.append({
            "id": f"stock-{p.id}",
            "type": "stock",
            "level": lvl,
            "title": "Out of Stock" if p.stock_qty == 0 else "Low Stock",
            "body": f"{p.name} — {p.stock_qty} left (reorder at {p.reorder_level})",
            "link": "/inventory",
        })

    # 2. Alterations ready to collect
    try:
        ready_alts = Alteration.query.filter_by(status="ready").limit(5).all()
        for a in ready_alts:
            notes.append({
                "id": f"alt-{a.id}",
                "type": "alteration",
                "level": "info",
                "title": "Alteration Ready",
                "body": f"{a.job_number} — {a.customer_name} ready to collect",
                "link": "/alterations",
            })
    except Exception:
        pass

    # 3. Overdue layaways (past due_date, not completed/cancelled)
    try:
        today = date.today()
        overdue = Layaway.query.filter(
            Layaway.status == "active",
            Layaway.due_date < today,
        ).limit(5).all()
        for l in overdue:
            notes.append({
                "id": f"lay-{l.id}",
                "type": "layaway",
                "level": "warning",
                "title": "Layaway Overdue",
                "body": f"{l.layaway_number} — {l.customer_name} past due date",
                "link": "/layaway",
            })
    except Exception:
        pass

    # 4. Deliveries dispatched > 2 days ago (may need follow-up)
    try:
        threshold = date.today() - timedelta(days=2)
        stale = DeliveryOrder.query.filter(
            DeliveryOrder.status == "dispatched",
            db.func.date(DeliveryOrder.dispatched_at) <= threshold,
        ).limit(5).all()
        for d in stale:
            notes.append({
                "id": f"del-{d.id}",
                "type": "delivery",
                "level": "warning",
                "title": "Delivery Pending",
                "body": f"{d.delivery_number} — {d.customer_name} dispatched 2+ days ago",
                "link": "/deliveries",
            })
    except Exception:
        pass

    # 5. Marketplace — incoming orders awaiting seller action
    if account_id:
        try:
            pending_orders = (
                MarketplaceOrder.query
                .filter(
                    MarketplaceOrder.seller_account_id == account_id,
                    MarketplaceOrder.status == "pending",
                )
                .order_by(MarketplaceOrder.created_at.desc())
                .limit(8)
                .all()
            )
            for o in pending_orders:
                notes.append({
                    "id": f"mpo-{o.id}",
                    "type": "marketplace_order",
                    "level": "warning",
                    "title": "New Bazaar Order",
                    "body": f"{o.order_number} — {o.buyer_store_name}: {o.post_title or 'product'} × {o.quantity}",
                    "link": "/pos?bazaarOrders=1",
                })
        except Exception:
            pass

        # 6. Marketplace — order status updates for buyer
        try:
            recent_buyer = (
                MarketplaceOrder.query
                .filter(
                    MarketplaceOrder.buyer_account_id == account_id,
                    MarketplaceOrder.status.in_(("accepted", "dispatched", "delivered", "rejected")),
                )
                .order_by(MarketplaceOrder.updated_at.desc())
                .limit(5)
                .all()
            )
            for o in recent_buyer:
                lvl = "info" if o.status in ("accepted", "dispatched") else (
                    "critical" if o.status == "rejected" else "info"
                )
                notes.append({
                    "id": f"mpb-{o.id}-{o.status}",
                    "type": "marketplace_order",
                    "level": lvl,
                    "title": f"Order {o.status.title()}",
                    "body": f"{o.order_number} from {o.seller_store_name} — {o.post_title or 'product'}",
                    "link": "/marketplace?tab=orders",
                })
        except Exception:
            pass

        # 7. Marketplace — likes on your listings
        try:
            my_post_ids = [p.id for p in MarketplacePost.query.filter_by(account_id=account_id).limit(50).all()]
            if my_post_ids:
                recent_likes = (
                    MarketplaceLike.query
                    .filter(MarketplaceLike.post_id.in_(my_post_ids))
                    .order_by(MarketplaceLike.created_at.desc())
                    .limit(3)
                    .all()
                )
                for lk in recent_likes:
                    post = lk.post
                    if post:
                        notes.append({
                            "id": f"mpl-{lk.id}",
                            "type": "marketplace_like",
                            "level": "info",
                            "title": "Listing Liked",
                            "body": f"Someone liked “{post.title}”",
                            "link": "/marketplace",
                        })
        except Exception:
            pass

        # 8. Platform support replies for seller
        try:
            thread = SupportThread.query.filter_by(account_id=account_id).first()
            if thread and (thread.unread_seller or 0) > 0:
                notes.append({
                    "id": f"support-{thread.id}",
                    "type": "support_chat",
                    "level": "warning",
                    "title": "DGC Support replied",
                    "body": thread.last_message or "New message from platform support",
                    "link": "/support",
                })
        except Exception:
            pass

        # 9. Bazaar shipping updates (dispatched with tracking)
        try:
            shipped = (
                MarketplaceOrder.query
                .filter(
                    MarketplaceOrder.buyer_account_id == account_id,
                    MarketplaceOrder.status == "dispatched",
                )
                .order_by(MarketplaceOrder.updated_at.desc())
                .limit(5)
                .all()
            )
            for o in shipped:
                track = o.tracking_number or "tracking pending"
                notes.append({
                    "id": f"mps-{o.id}",
                    "type": "shipping",
                    "level": "info",
                    "title": "Order Shipped",
                    "body": f"{o.order_number} — {o.seller_store_name}: {track}",
                    "link": "/marketplace?tab=orders",
                })
        except Exception:
            pass

    # Superadmin — platform-wide support & commerce alerts
    if getattr(current_user, "role", None) == "superadmin":
        try:
            urgent = (
                SupportThread.query
                .filter(SupportThread.unread_platform > 0)
                .order_by(SupportThread.last_message_at.desc())
                .limit(12)
                .all()
            )
            for t in urgent:
                lvl = "critical" if t.call_enabled else "warning"
                notes.append({
                    "id": f"sup-{t.id}",
                    "type": "support_inbox",
                    "level": lvl,
                    "title": f"Seller message — {t.store_name}",
                    "body": t.last_message or "New support thread activity",
                    "link": f"/admin/support?thread={t.id}",
                })
        except Exception:
            pass

        try:
            from business_category_control import list_premium_requests
            pending_premium = [r for r in list_premium_requests() if r.get("status") == "pending"][:6]
            for r in pending_premium:
                notes.append({
                    "id": f"prem-{r.get('id')}",
                    "type": "premium_request",
                    "level": "info",
                    "title": "Premium service request",
                    "body": f"{r.get('module_label')} — account #{r.get('account_id')}",
                    "link": "/admin#cc-categories",
                })
        except Exception:
            pass

        try:
            guest_orders = (
                MarketplaceOrder.query
                .filter(
                    MarketplaceOrder.is_guest.is_(True),
                    MarketplaceOrder.status == "pending",
                )
                .order_by(MarketplaceOrder.created_at.desc())
                .limit(8)
                .all()
            )
            for o in guest_orders:
                addr = (o.delivery_address or "")[:40]
                notes.append({
                    "id": f"gst-{o.id}",
                    "type": "bazaar_guest_order",
                    "level": "warning",
                    "title": "Guest Bazaar order",
                    "body": f"{o.order_number} — {o.guest_name or 'Guest'} · {addr or 'no address'}",
                    "link": "/admin#cc-bazaar",
                })
        except Exception:
            pass

    # Sort: critical first, then warning, then info
    order = {"critical": 0, "warning": 1, "info": 2}
    notes.sort(key=lambda n: order.get(n["level"], 3))

    return jsonify({"notifications": notes, "count": len(notes)})
