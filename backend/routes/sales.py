from flask import Blueprint, request, jsonify, make_response
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Sale, SaleItem, Product, ProductVariant, Customer, InventoryMovement, Setting, PointTransaction, MEMBERSHIP_TIERS
from schemas import CreateSaleSchema, RefundSchema
from audit import log_audit
from datetime import datetime
import random, string
from sqlalchemy import insert
from sqlalchemy.orm import joinedload

sales_bp = Blueprint("sales", __name__)


def _sync_inventory_movements_sequence():
    """Realign PostgreSQL sequence to MAX(id)+1 for inventory_movements."""
    if "postgresql" not in db.engine.url.drivername:
        return False
    try:
        db.session.execute(db.text("""
            SELECT setval(
                pg_get_serial_sequence('inventory_movements', 'id'),
                COALESCE((SELECT MAX(id) FROM inventory_movements), 0) + 1,
                false
            )
        """))
        db.session.commit()
        print("[DB] Synced inventory_movements sequence", flush=True)
        return True
    except Exception as seq_err:
        db.session.rollback()
        print(f"[DB] Failed to sync inventory_movements sequence: {seq_err}", flush=True)
        return False

def gen_invoice():
    ts = datetime.utcnow().strftime("%Y%m%d%H%M")
    rand = "".join(random.choices(string.digits, k=4))
    return f"INV{ts}{rand}"

@sales_bp.route("/", methods=["GET"])
@token_required
@login_required
def get_sales():
    page = int(request.args.get("page",1))
    per_page = int(request.args.get("per_page",20))
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    q = request.args.get("q","")
    account_id = getattr(current_user, 'account_id', None)
    query = Sale.query
    if account_id and current_user.role != "superadmin":
        query = query.filter(Sale.account_id == account_id)
    if date_from: query = query.filter(Sale.sale_date >= date_from)
    if date_to:   query = query.filter(Sale.sale_date <= date_to+"T23:59:59")
    if q:         query = query.filter(Sale.invoice_number.ilike(f"%{q}%"))
    total = query.count()
    sales = query.order_by(Sale.sale_date.desc()).offset((page-1)*per_page).limit(per_page).all()
    return jsonify({"sales":[s.to_dict() for s in sales],"total":total,"page":page,"per_page":per_page})

@sales_bp.route("/<int:sid>", methods=["GET"])
@token_required
@login_required
def get_sale(sid):
    query = Sale.query
    if current_user.role != "superadmin":
        query = query.filter(Sale.account_id == current_user.account_id)
    s = query.get_or_404(sid)
    return jsonify(s.to_dict(include_items=True))

@sales_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_sale():
    try:
        # ── 1. Validate request ────────────────────────────────────────────────
        raw = request.get_json(silent=True) or {}
        schema = CreateSaleSchema()
        errors = schema.validate(raw)
        if errors:
            return jsonify({"error": "Validation failed", "fields": errors}), 422
        data = schema.load(raw)

        items_data = data["items"]

        # ── 2. Row-level locking — prevent overselling under concurrent requests ──
        product_ids = sorted({item["product_id"] for item in items_data})
        variant_ids = sorted({item["variant_id"] for item in items_data if item.get("variant_id")})
        product_query = Product.query.filter(Product.id.in_(product_ids))
        if current_user.role != "superadmin":
            product_query = product_query.filter(Product.account_id == current_user.account_id)
        locked_products = {
            p.id: p for p in
            product_query.with_for_update().all()
        }
        variant_query = ProductVariant.query.filter(ProductVariant.id.in_(variant_ids))
        if current_user.role != "superadmin":
            variant_query = variant_query.join(Product).filter(Product.account_id == current_user.account_id)
        locked_variants = {
            v.id: v for v in
            variant_query.with_for_update().all()
        } if variant_ids else {}

        # ── 3. Stock validation (product or variant) ────────────────────────────
        for item in items_data:
            p = locked_products.get(item["product_id"])
            if not p:
                return jsonify({"error": f"Product {item['product_id']} not found"}), 404
            vid = item.get("variant_id")
            if vid:
                v = locked_variants.get(vid)
                if not v:
                    return jsonify({"error": f"Variant {vid} not found"}), 404
                if v.stock_qty < item["qty"]:
                    return jsonify({"error": f"Insufficient stock for {p.name} ({v.size or ''} {v.color or ''}) (available: {v.stock_qty})"}), 400
            else:
                if p.stock_qty < item["qty"]:
                    return jsonify({"error": f"Insufficient stock for {p.name} (available: {p.stock_qty})"}), 400

        # ── 4. Build sale ──────────────────────────────────────────────────────
        def _f(v, d=0.0):
            try:
                return float(v) if v is not None else d
            except Exception:
                return d

        tax_pct  = _f(data.get("tax_pct"), 0)
        disc_pct = _f(data.get("discount_pct"), 0)

        # Hard server-side enforcement of 30% max discount policy (on manual pct)
        if disc_pct > 30:
            return jsonify({"error": "Discount cannot exceed 30%"}), 400

        customer_id = data.get("customer_id")
        if customer_id:
            customer_query = Customer.query.filter_by(id=customer_id)
            if current_user.role != "superadmin":
                customer_query = customer_query.filter(Customer.account_id == current_user.account_id)
            if not customer_query.first():
                return jsonify({"error": "Customer not found"}), 404

        sale = Sale(
            account_id=getattr(current_user, 'account_id', None),
            invoice_number=gen_invoice(),
            customer_id=customer_id,
            cashier_id=current_user.id,
            payment_method=data.get("payment_method") or "cash",
            payment_ref=data.get("payment_ref"),
            notes=data.get("notes"),
            discount_pct=disc_pct,
            tax_pct=tax_pct,
        )
        db.session.add(sale)
        db.session.flush()

        subtotal = 0
        for item in items_data:
            p = locked_products[item["product_id"]]
            vid = item.get("variant_id")
            v = locked_variants.get(vid) if vid else None

            # Price: prefer explicit, then variant effective, then product
            unit_price = _f(item.get("unit_price"))
            if not unit_price:
                if v:
                    unit_price = v.effective_price() if hasattr(v, 'effective_price') else _f(v.selling_price, _f(p.selling_price))
                else:
                    unit_price = _f(p.selling_price)
            qty = int(item.get("qty") or 0)
            item_discount = _f(item.get("discount"), 0)
            if qty < 1: qty = 1
            item_total = (unit_price * qty) - item_discount
            subtotal += item_total

            # Snapshot label for variant
            vlabel = None
            if v:
                vlabel = " ".join([x for x in [v.size, v.color] if x]).strip() or None
                if not vlabel and v.sku:
                    vlabel = v.sku

            si = SaleItem(
                sale_id=sale.id, product_id=p.id,
                variant_id=vid,
                product_name=p.name + (f" · {vlabel}" if vlabel else ""),
                sku = v.sku if (v and v.sku) else p.sku,
                variant_label = vlabel,
                qty=qty, unit_price=unit_price,
                cost_price=_f(v.cost_price if v and v.cost_price is not None else p.cost_price),
                discount=item_discount, total=item_total
            )
            db.session.add(si)

            # Deduct stock from variant or product
            # Use core insert to explicitly control columns and avoid referencing
            # variant_id column if it doesn't exist in DB yet (migration pending)
            if v:
                qty_before = v.stock_qty
                v.stock_qty -= qty
                db.session.execute(
                    insert(InventoryMovement).values(
                        product_id=p.id,
                        variant_id=vid,
                        movement_type="sale",
                        qty_before=qty_before,
                        qty_change=-qty,
                        qty_after=v.stock_qty,
                        reference_id=sale.id,
                        reference_type="sale",
                        created_by=current_user.id,
                        created_at=datetime.utcnow()
                    )
                )
            else:
                qty_before = p.stock_qty
                p.stock_qty -= qty
                db.session.execute(
                    insert(InventoryMovement).values(
                        product_id=p.id,
                        movement_type="sale",
                        qty_before=qty_before,
                        qty_change=-qty,
                        qty_after=p.stock_qty,
                        reference_id=sale.id,
                        reference_type="sale",
                        created_by=current_user.id,
                        created_at=datetime.utcnow()
                    )
                )

        # ── 5. Calculate totals ────────────────────────────────────────────────
        disc_amt = _f(data.get("discount_amount"), 0)
        if disc_amt <= 0 and disc_pct > 0:
            disc_amt = subtotal * (disc_pct / 100)
        disc_amt = min(disc_amt, subtotal) if subtotal > 0 else 0
        if disc_amt < 0:
            disc_amt = 0
        tax_amt = (subtotal - disc_amt) * (tax_pct / 100)
        total = subtotal - disc_amt + tax_amt

        sale.subtotal = subtotal
        sale.discount_amount = disc_amt
        sale.tax_amount = tax_amt
        sale.total = total
        ap = data.get("amount_paid")
        sale.amount_paid = max(0, _f(ap, total))
        sale.change_amount = max(0, sale.amount_paid - total)

        # ── 6. Points redemption ───────────────────────────────────────────────
        redeem_points = int(data.get("redeem_points") or 0)
        redeem_value = 0.0
        if redeem_points > 0 and sale.customer_id:
            rate_setting = Setting.get_setting("points_redemption_rate", account_id=sale.account_id)
            redemption_rate = _f(rate_setting.value) if rate_setting else 1
            redeem_value = redeem_points * redemption_rate
            total = max(0, total - redeem_value)
            sale.total = total
            sale.change_amount = max(0, sale.amount_paid - total)

        # ── 7. Customer loyalty ────────────────────────────────────────────────
        if sale.customer_id:
            cust = Customer.query.filter_by(id=sale.customer_id)
            if current_user.role != "superadmin":
                cust = cust.filter(Customer.account_id == sale.account_id)
            cust = cust.first()
            if cust:
                cust.total_spent = _f(cust.total_spent) + _f(sale.total)
                cust.visit_count = (cust.visit_count or 0) + 1
                pts_setting = Setting.get_setting("loyalty_points_rate", account_id=sale.account_id)
                pts_rate = _f(pts_setting.value) if pts_setting else 10
                tier_info = MEMBERSHIP_TIERS.get(cust.membership_tier or "bronze", MEMBERSHIP_TIERS["bronze"])
                multiplier = tier_info.get("points_multiplier", 1.0)
                pts_earned = int((_f(sale.total) / pts_rate) * multiplier) if pts_rate > 0 else 0
                if redeem_points > 0:
                    cust.loyalty_points = max(0, (cust.loyalty_points or 0) - redeem_points)
                    db.session.add(PointTransaction(
                        customer_id=cust.id, txn_type="redeemed",
                        points=-redeem_points, balance=cust.loyalty_points,
                        reference=sale.invoice_number,
                        note=f"Redeemed for Rs.{redeem_value:.2f} discount",
                        created_by=current_user.id
                    ))
                cust.loyalty_points = (cust.loyalty_points or 0) + pts_earned
                db.session.add(PointTransaction(
                    customer_id=cust.id, txn_type="earned",
                    points=pts_earned, balance=cust.loyalty_points,
                    reference=sale.invoice_number,
                    note=f"Earned from sale {sale.invoice_number} ({tier_info['label']} x{multiplier})",
                    created_by=current_user.id
                ))
                cust.recalculate_tier()

        # ── 7b. Hospitality — charge to room folio ────────────────────────────
        folio_booking_id = data.get("folio_booking_id")
        pay_method = (data.get("payment_method") or "cash").strip().lower()
        if folio_booking_id or pay_method == "room_charge":
            if not folio_booking_id:
                return jsonify({"error": "folio_booking_id is required for room charge"}), 400
            account_id = getattr(current_user, "account_id", None)
            if not account_id and current_user.role != "superadmin":
                return jsonify({"error": "Room charge requires a merchant account"}), 400
            try:
                from hospitality.feature_gate import hospitality_enabled_for_account
                from hospitality.folio_service import post_pos_sale_to_folio
                account = getattr(current_user, "account", None)
                if current_user.role != "superadmin" and not hospitality_enabled_for_account(account, user=current_user):
                    return jsonify({"error": "Hospitality module not enabled"}), 403
                post_pos_sale_to_folio(sale, int(folio_booking_id), account_id)
            except ValueError as e:
                db.session.rollback()
                return jsonify({"error": str(e)}), 400

        # ── 8. Audit ───────────────────────────────────────────────────────────
        audit_detail = {"invoice": sale.invoice_number, "total": float(sale.total)}
        if sale.folio_booking_id:
            audit_detail["folio_booking_id"] = sale.folio_booking_id
            log_audit("hospitality.folio_charge", resource="sale", resource_id=str(sale.id), detail=audit_detail)
        log_audit("sale.create", resource="sale", resource_id=str(sale.id), detail=audit_detail)

        db.session.commit()
        return jsonify(sale.to_dict(include_items=True)), 201
    except Exception as e:
        db.session.rollback()
        msg = str(getattr(e, "orig", e))
        is_seq_collision = (
            "inventory_movements_pkey" in msg and
            "duplicate key value" in msg
        )
        already_retried = request.environ.get("inventory_movements_seq_retried") == "1"
        if is_seq_collision and not already_retried:
            request.environ["inventory_movements_seq_retried"] = "1"
            if _sync_inventory_movements_sequence():
                return create_sale()
        import traceback
        print("[SALE CREATE ERROR]", traceback.format_exc(), flush=True)
        return jsonify({"error": f"Sale creation failed: {str(e)}"}), 500

@sales_bp.route("/<int:sid>/void", methods=["PUT"])
@token_required
@login_required
def void_sale(sid):
    if current_user.role not in ["owner","manager"]:
        return jsonify({"error":"Forbidden"}),403
    query = Sale.query
    if current_user.role != "superadmin":
        query = query.filter(Sale.account_id == current_user.account_id)
    sale = query.get_or_404(sid)
    if sale.status == "voided":
        return jsonify({"error":"Already voided"}),400
    sale.status = "voided"
    if sale.folio_booking_id:
        try:
            from hospitality.folio_service import reverse_folio_sale_charge
            reverse_folio_sale_charge(sale)
        except Exception:
            pass
    for item in sale.items:
        vid = getattr(item, 'variant_id', None)
        if vid:
            v = ProductVariant.query.get(vid)
            if v:
                qty_before = v.stock_qty
                v.stock_qty += item.qty
                db.session.execute(
                    insert(InventoryMovement).values(
                        product_id=item.product_id,
                        variant_id=vid,
                        movement_type="void",
                        qty_before=qty_before,
                        qty_change=item.qty,
                        qty_after=v.stock_qty,
                        reference_id=sale.id,
                        reference_type="sale_void",
                        created_by=current_user.id,
                        created_at=datetime.utcnow()
                    )
                )
        else:
            p = Product.query.get(item.product_id)
            if p:
                qty_before = p.stock_qty
                p.stock_qty += item.qty
                db.session.execute(
                    insert(InventoryMovement).values(
                        product_id=item.product_id,
                        movement_type="void",
                        qty_before=qty_before,
                        qty_change=item.qty,
                        qty_after=p.stock_qty,
                        reference_id=sale.id,
                        reference_type="sale_void",
                        created_by=current_user.id,
                        created_at=datetime.utcnow()
                    )
                )

    if sale.customer_id:
        cust = Customer.query.get(sale.customer_id)
        if cust:
            earned_txn = PointTransaction.query.filter_by(
                reference=sale.invoice_number, txn_type="earned").first()
            if earned_txn:
                earned_pts = earned_txn.points
                cust.loyalty_points = max(0, cust.loyalty_points - earned_pts)
                db.session.add(PointTransaction(
                    customer_id=cust.id, txn_type="adjusted",
                    points=-earned_pts, balance=cust.loyalty_points,
                    reference=sale.invoice_number, note="Reversed: sale voided",
                    created_by=current_user.id))
            redeemed_txn = PointTransaction.query.filter_by(
                reference=sale.invoice_number, txn_type="redeemed").first()
            if redeemed_txn:
                redeemed_pts = abs(redeemed_txn.points)
                cust.loyalty_points += redeemed_pts
                db.session.add(PointTransaction(
                    customer_id=cust.id, txn_type="adjusted",
                    points=redeemed_pts, balance=cust.loyalty_points,
                    reference=sale.invoice_number,
                    note="Restored: redeemed points reversed on void",
                    created_by=current_user.id))
            cust.total_spent = max(0, float(cust.total_spent or 0) - float(sale.total))
            cust.visit_count = max(0, cust.visit_count - 1)
            cust.recalculate_tier()

    log_audit("sale.void", resource="sale", resource_id=str(sid),
              detail={"invoice": sale.invoice_number})
    db.session.commit()
    return jsonify({"message":"Sale voided"})


@sales_bp.route("/<int:sid>/refund", methods=["PUT"])
@token_required
@login_required
def refund_sale(sid):
    if current_user.role not in ["owner", "superadmin", "manager"]:
        return jsonify({"error": "Forbidden"}), 403
    query = Sale.query
    if current_user.role != "superadmin":
        query = query.filter(Sale.account_id == current_user.account_id)
    sale = query.get_or_404(sid)
    if sale.status == "voided":
        return jsonify({"error": "Cannot refund a voided sale"}), 400

    raw = request.get_json(silent=True) or {}
    schema = RefundSchema()
    errors = schema.validate(raw)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422
    data = schema.load(raw)

    amount = data["amount"]
    reason = data["reason"]
    already_refunded = float(getattr(sale, "refund_amount", 0) or 0)
    if already_refunded + amount > float(sale.total):
        remaining = float(sale.total) - already_refunded
        return jsonify({"error": f"Refund would exceed sale total. Remaining refundable: Rs.{remaining:.2f}"}), 400

    sale.refund_amount = already_refunded + amount
    sale.refund_reason = reason
    sale.status = "refunded"
    if hasattr(sale, "notes"):
        sale.notes = (f"{sale.notes or ''}\nRefund Rs.{amount:.0f} — {reason}").strip()

    log_audit("sale.refund", resource="sale", resource_id=str(sid),
              detail={"amount": amount, "reason": reason})
    db.session.commit()
    return jsonify({"message": f"Refund of Rs.{amount:.0f} processed", "sale": sale.to_dict()})


# ── PDF Receipt ────────────────────────────────────────────────────────────────

@sales_bp.route("/<int:sid>/receipt.pdf", methods=["GET"])
@token_required
@login_required
def receipt_pdf(sid):
    """Generate a PDF receipt for a completed sale.
    Returns a PDF binary. Falls back to a simple text receipt if reportlab not installed.
    """
    query = Sale.query
    if current_user.role != "superadmin":
        query = query.filter(Sale.account_id == current_user.account_id)
    sale = query.get_or_404(sid)

    # Try reportlab first
    try:
        from reportlab.lib.pagesizes import A6
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        import io as _io

        buf = _io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A6, topMargin=0.5*cm,
                                bottomMargin=0.5*cm, leftMargin=0.5*cm, rightMargin=0.5*cm)
        styles = getSampleStyleSheet()
        center = ParagraphStyle("center", parent=styles["Normal"], alignment=1, fontSize=9)
        bold   = ParagraphStyle("bold",   parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9)
        small  = ParagraphStyle("small",  parent=styles["Normal"], fontSize=7.5)

        # Shop name from settings
        from models import Setting
        shop_name    = (Setting.get_setting("shop_name", account_id=current_user.account_id)    or type("o", (), {"value": "Your Store"})()).value
        shop_address = (Setting.get_setting("shop_address", account_id=current_user.account_id) or type("o", (), {"value": ""})()).value
        shop_phone   = (Setting.get_setting("shop_phone", account_id=current_user.account_id)   or type("o", (), {"value": ""})()).value
        receipt_footer = (Setting.get_setting("receipt_footer", account_id=current_user.account_id) or type("o", (), {"value": "Thank you!"})()).value

        story = []
        story.append(Paragraph(f"<b>{shop_name}</b>", center))
        if shop_address: story.append(Paragraph(shop_address, center))
        if shop_phone:   story.append(Paragraph(f"Tel: {shop_phone}", center))
        story.append(Spacer(1, 0.2*cm))
        story.append(HRFlowable(width="100%", thickness=0.5))
        story.append(Spacer(1, 0.1*cm))

        story.append(Paragraph(f"Invoice: <b>{sale.invoice_number}</b>", small))
        story.append(Paragraph(f"Date:    {sale.sale_date.strftime('%Y-%m-%d %H:%M') if sale.sale_date else '-'}", small))
        story.append(Paragraph(f"Cashier: {sale.cashier.full_name if sale.cashier else '-'}", small))
        story.append(Paragraph(f"Customer:{sale.customer.name if sale.customer else 'Walk-in'}", small))
        story.append(Spacer(1, 0.2*cm))
        story.append(HRFlowable(width="100%", thickness=0.5))

        # Items table
        rows = [["Item", "Qty", "Price", "Total"]]
        items = SaleItem.query.filter_by(sale_id=sid).all()
        for it in items:
            rows.append([
                it.product_name[:22] if it.product_name else "-",
                str(it.qty),
                f"Rs.{float(it.unit_price):.0f}",
                f"Rs.{float(it.total):.0f}",
            ])
        t = Table(rows, colWidths=[4.5*cm, 1*cm, 2*cm, 2*cm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE", (0,0), (-1,-1), 8),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.Color(0.95,0.95,0.95)]),
            ("GRID", (0,0), (-1,-1), 0.25, colors.grey),
            ("ALIGN", (1,0), (-1,-1), "RIGHT"),
        ]))
        story.append(t)
        story.append(Spacer(1, 0.2*cm))
        story.append(HRFlowable(width="100%", thickness=0.5))

        totals = [
            ["Subtotal", f"Rs.{float(sale.subtotal):.2f}"],
        ]
        if float(sale.discount_amount) > 0:
            totals.append(["Discount", f"-Rs.{float(sale.discount_amount):.2f}"])
        if float(sale.tax_amount) > 0:
            totals.append([f"Tax ({float(sale.tax_pct):.0f}%)", f"Rs.{float(sale.tax_amount):.2f}"])
        totals.append(["TOTAL", f"Rs.{float(sale.total):.2f}"])
        totals.append(["Paid", f"Rs.{float(sale.amount_paid):.2f}"])
        totals.append(["Change", f"Rs.{float(sale.change_amount):.2f}"])

        tt = Table(totals, colWidths=[5.5*cm, 4*cm])
        tt.setStyle(TableStyle([
            ("FONTSIZE", (0,0), (-1,-1), 8.5),
            ("ALIGN", (1,0), (1,-1), "RIGHT"),
            ("FONTNAME", (0,-3), (-1,-3), "Helvetica-Bold"),
            ("FONTSIZE", (0,-3), (-1,-3), 10),
        ]))
        story.append(tt)
        story.append(Spacer(1, 0.3*cm))
        story.append(HRFlowable(width="100%", thickness=0.5))
        story.append(Spacer(1, 0.1*cm))
        for line in receipt_footer.split("\n"):
            story.append(Paragraph(line.strip(), center))

        doc.build(story)
        buf.seek(0)
        resp = make_response(buf.read())
        resp.headers["Content-Type"] = "application/pdf"
        resp.headers["Content-Disposition"] = f'attachment; filename="receipt-{sale.invoice_number}.pdf"'
        return resp

    except ImportError:
        # reportlab not installed — return plain text receipt
        lines = [
            f"{'Your Store':^40}",
            f"{'DGC-POS Receipt':^40}",
            "=" * 40,
            f"Invoice : {sale.invoice_number}",
            f"Date    : {sale.sale_date.strftime('%Y-%m-%d %H:%M') if sale.sale_date else '-'}",
            f"Customer: {sale.customer.name if sale.customer else 'Walk-in'}",
            "-" * 40,
        ]
        items = SaleItem.query.filter_by(sale_id=sid).all()
        for it in items:
            lines.append(f"{it.product_name[:22]:<22} x{it.qty}  Rs.{float(it.total):.0f}")
        lines += [
            "-" * 40,
            f"{'Subtotal':<30} Rs.{float(sale.subtotal):.2f}",
            f"{'TOTAL':<30} Rs.{float(sale.total):.2f}",
            f"{'Paid':<30} Rs.{float(sale.amount_paid):.2f}",
            f"{'Change':<30} Rs.{float(sale.change_amount):.2f}",
            "=" * 40,
            "Thank you for shopping at Your Store!",
        ]
        resp = make_response("\n".join(lines))
        resp.headers["Content-Type"] = "text/plain"
        resp.headers["Content-Disposition"] = f'attachment; filename="receipt-{sale.invoice_number}.txt"'
        return resp


# ── CSV Export ────────────────────────────────────────────────────────────────

@sales_bp.route("/export.csv", methods=["GET"])
@token_required
@login_required
def export_sales_csv():
    """Export sales to CSV. Query params: date_from, date_to, status."""
    if current_user.role not in ["owner", "superadmin", "manager"]:
        return jsonify({"error": "Forbidden"}), 403

    import csv, io
    date_from = request.args.get("date_from")
    date_to   = request.args.get("date_to")
    status    = request.args.get("status")

    q = Sale.query
    if current_user.role != "superadmin":
        q = q.filter(Sale.account_id == current_user.account_id)
    if date_from: q = q.filter(Sale.sale_date >= date_from)
    if date_to:   q = q.filter(Sale.sale_date <= date_to + "T23:59:59")
    if status:    q = q.filter(Sale.status == status)
    sales = q.order_by(Sale.sale_date.desc()).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "Invoice", "Date", "Customer", "Cashier", "Payment",
        "Subtotal", "Discount", "Tax", "Total", "Amount Paid", "Change", "Status"
    ])
    for s in sales:
        w.writerow([
            s.invoice_number,
            s.sale_date.strftime("%Y-%m-%d %H:%M") if s.sale_date else "",
            s.customer.name if s.customer else "Walk-in",
            s.cashier.username if s.cashier else "",
            s.payment_method,
            float(s.subtotal or 0),
            float(s.discount_amount or 0),
            float(s.tax_amount or 0),
            float(s.total or 0),
            float(s.amount_paid or 0),
            float(s.change_amount or 0),
            s.status,
        ])

    resp = make_response(buf.getvalue())
    resp.headers["Content-Type"] = "text/csv"
    resp.headers["Content-Disposition"] = "attachment; filename=sales-export.csv"
    return resp


# ── Email Receipt ──────────────────────────────────────────────────────────────

@sales_bp.route("/<int:sid>/email-receipt", methods=["POST"])
@token_required
@login_required
def email_receipt(sid):
    import os

    try:
        query = Sale.query.options(joinedload(Sale.customer), joinedload(Sale.items))
        if current_user.role != "superadmin":
            query = query.filter(Sale.account_id == current_user.account_id)
        sale = query.get_or_404(sid)
        data = request.get_json() or {}
        to_email = (data.get("email") or "").strip()
        if not to_email and sale.customer:
            to_email = (sale.customer.email or "").strip()
        if not to_email:
            return jsonify({"error": "No email address provided"}), 400

        import json, smtplib, ssl
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        brevo_key  = os.environ.get("BREVO_API_KEY", "")
        from_email = os.environ.get("BREVO_FROM_EMAIL", "sales@example.com")
        smtp_user  = os.environ.get("SMTP_USER", "aed898001@smtp-brevo.com")
        smtp_pass  = os.environ.get("SMTP_PASS", "")

        # Load shop settings
        shop_name = "Your Store"
        currency  = "Rs."
        footer    = "Thank you for shopping with us!"
        try:
            def _s(k):
                r = Setting.get_setting(k, account_id=current_user.account_id)
                return r.value if r else ""
            shop_name = _s("shop_name") or shop_name
            currency  = _s("currency")  or currency
            footer    = _s("receipt_footer") or footer
        except Exception:
            pass

        items_html = "".join(
            f"<tr><td style='padding:4px 8px'>{ (i.product_name or ('#'+str(i.product_id))) + (f' · {i.variant_label}' if getattr(i, 'variant_label', None) else '') }</td>"
            f"<td style='padding:4px 8px;text-align:center'>{i.qty}</td>"
            f"<td style='padding:4px 8px;text-align:right'>{currency} {float(i.unit_price or 0):,.2f}</td>"
            f"<td style='padding:4px 8px;text-align:right'>{currency} {float(i.unit_price or 0)*i.qty:,.2f}</td></tr>"
            for i in sale.items
        )

        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
          <h2 style="color:#0A84FF;border-bottom:2px solid #0A84FF;padding-bottom:8px">{shop_name}</h2>
          <p style="font-size:13px;color:#555">Invoice: <strong>{sale.invoice_number}</strong> &nbsp;|&nbsp;
             Date: {sale.sale_date.strftime('%d %b %Y %H:%M') if sale.sale_date else ''}</p>
          <p style="font-size:13px;color:#555">Customer: {sale.customer.name if sale.customer else 'Walk-in'}
             &nbsp;|&nbsp; Payment: {(sale.payment_method or 'cash').upper()}</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
            <thead>
              <tr style="background:#1A2332;color:#fff">
                <th style="padding:6px 8px;text-align:left">Item</th>
                <th style="padding:6px 8px;text-align:center">Qty</th>
                <th style="padding:6px 8px;text-align:right">Unit Price</th>
                <th style="padding:6px 8px;text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>{items_html}</tbody>
          </table>
          <table style="width:100%;font-size:13px;border-top:1px solid #ddd;padding-top:8px">
            <tr><td>Subtotal</td><td style="text-align:right">{currency} {float(sale.subtotal or 0):,.2f}</td></tr>
            {"<tr><td>Discount</td><td style='text-align:right'>- "+currency+" "+f"{float(sale.discount_amount or 0):,.2f}"+"</td></tr>" if float(sale.discount_amount or 0) else ""}
            {"<tr><td>Tax</td><td style='text-align:right'>+ "+currency+" "+f"{float(sale.tax_amount or 0):,.2f}"+"</td></tr>" if float(sale.tax_amount or 0) else ""}
            <tr style="font-weight:bold;font-size:15px;border-top:2px solid #0A84FF">
              <td style="padding-top:6px">Total</td>
              <td style="text-align:right;color:#0A84FF;padding-top:6px">{currency} {float(sale.total or 0):,.2f}</td>
            </tr>
          </table>
          <p style="margin-top:20px;font-size:12px;color:#888;text-align:center">{footer}</p>
        </div>
        """

        subject = f"Your receipt from {shop_name} — {sale.invoice_number}"

        if not brevo_key and not smtp_pass:
            # Dev / local fallback: log the email instead of failing
            print(f"[EMAIL RECEIPT SIMULATED] To: {to_email}")
            print("Subject:", subject)
            print("HTML content (first 2000 chars):")
            print(html[:2000])
            print("... (full HTML above)")
            log_audit("sale.email_receipt", resource="sale", resource_id=str(sid),
                      detail={"to": to_email, "method": "simulated_console"})
            return jsonify({"message": f"Receipt simulated (check backend console) to {to_email}"}), 200

        # Build MIME message for SMTP fallback
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"{shop_name} <{from_email}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html"))

        payload = json.dumps({
            "sender":      {"name": shop_name, "email": from_email},
            "to":          [{"email": to_email}],
            "subject":     subject,
            "htmlContent": html,
        }).encode("utf-8")

        last_error = "Unknown error"

        # Method 1: Brevo HTTP API (no SMTP ports needed)
        if brevo_key:
            try:
                import urllib.request, urllib.error
                req = urllib.request.Request(
                    "https://api.brevo.com/v3/smtp/email",
                    data=payload,
                    headers={
                        "api-key":      brevo_key,
                        "Content-Type": "application/json",
                        "Accept":       "application/json",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=20) as resp:
                    resp.read()
                log_audit("sale.email_receipt", resource="sale", resource_id=str(sid),
                          detail={"to": to_email, "method": "brevo_api"})
                return jsonify({"message": f"Receipt sent to {to_email}"})
            except urllib.error.HTTPError as e:
                try:
                    body = e.read().decode("utf-8")[:300]
                except:
                    body = str(e)
                last_error = f"API:{e.code} {body}"
            except Exception as e:
                last_error = f"API:{str(e)}"

        # Method 2: Brevo SMTP port 465 (SSL — different from blocked 587)
        if smtp_pass:
            for port, use_ssl in [(465, True), (587, False), (2525, False)]:
                try:
                    if use_ssl:
                        ctx = ssl.create_default_context()
                        with smtplib.SMTP_SSL("smtp-relay.brevo.com", port, timeout=10, context=ctx) as s:
                            s.login(smtp_user, smtp_pass)
                            s.sendmail(from_email, to_email, msg.as_string())
                    else:
                        with smtplib.SMTP("smtp-relay.brevo.com", port, timeout=10) as s:
                            s.starttls()
                            s.login(smtp_user, smtp_pass)
                            s.sendmail(from_email, to_email, msg.as_string())
                    log_audit("sale.email_receipt", resource="sale", resource_id=str(sid),
                              detail={"to": to_email, "method": f"smtp_{port}"})
                    return jsonify({"message": f"Receipt sent to {to_email}"})
                except Exception as e:
                    last_error = f"SMTP{port}:{str(e)}"
                    continue

        return jsonify({"error": f"Email failed: {last_error}. Check BREVO_API_KEY or SMTP_PASS on Railway."}), 500
    except Exception as e:
        import traceback
        print("[EMAIL RECEIPT ERROR]", traceback.format_exc())
        return jsonify({"error": f"Email send failed: {str(e)}"}), 500


# ── eSewa payment verification ────────────────────────────────────────────────
# Frontend calls this after eSewa redirects back with transaction params.
# eSewa sends: oid (our invoice), amt, refId (eSewa transaction id)
# We verify with eSewa status-check API, then mark the pending sale as paid.
@sales_bp.route("/esewa/verify", methods=["POST"])
@token_required
@login_required
def esewa_verify():
    import urllib.request as _urllib
    import json as _json
    import os as _os

    data = request.get_json(force=True) or {}
    oid    = data.get("oid")       # our invoice_number or pending_id
    amt    = data.get("amt")       # amount string
    ref_id = data.get("refId")     # eSewa transaction reference

    if not all([oid, amt, ref_id]):
        return jsonify({"error": "oid, amt, refId required"}), 400

    merchant_code = _os.environ.get("ESEWA_MERCHANT_CODE", "EPAYTEST")
    esewa_url = (
        f"https://uat.esewa.com.np/epay/transrec"   # UAT; prod: epay.esewa.com.np
        if merchant_code == "EPAYTEST"
        else "https://epay.esewa.com.np/epay/transrec"
    )

    try:
        form = f"amt={amt}&scd={merchant_code}&pid={oid}&rid={ref_id}"
        req = _urllib.Request(
            esewa_url,
            data=form.encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with _urllib.urlopen(req, timeout=15) as resp:
            body = resp.read().decode()
        # eSewa returns XML: <response><response_code>Success</response_code></response>
        verified = "<response_code>Success</response_code>" in body
    except Exception as e:
        return jsonify({"error": f"eSewa check failed: {e}"}), 502

    if not verified:
        log_audit("sale.esewa_failed", resource="invoice", resource_id=oid, detail={"refId": ref_id})
        return jsonify({"error": "eSewa verification failed"}), 402

    # Find the sale by invoice_number and mark payment_method = esewa
    query = Sale.query.filter_by(invoice_number=oid)
    if current_user.role != "superadmin":
        query = query.filter(Sale.account_id == current_user.account_id)
    sale = query.first()
    if sale:
        sale.payment_method = "esewa"
        sale.payment_ref = ref_id
        db.session.commit()
        log_audit("sale.esewa_verified", resource="sale", resource_id=str(sale.id),
                  detail={"refId": ref_id, "amt": amt})
        return jsonify({"message": "Payment verified", "sale": sale.to_dict()})

    return jsonify({"message": "Verified but sale not found", "refId": ref_id}), 200


# ── Khalti payment verification ───────────────────────────────────────────────
@sales_bp.route("/khalti/verify", methods=["POST"])
@token_required
@login_required
def khalti_verify():
    import urllib.request as _urllib
    import json as _json
    import os as _os

    data    = request.get_json(force=True) or {}
    token   = data.get("token")      # Khalti payment token
    amount  = data.get("amount")     # amount in paisa (Rs × 100)
    inv_num = data.get("invoice_number")

    if not all([token, amount, inv_num]):
        return jsonify({"error": "token, amount, invoice_number required"}), 400

    secret_key = _os.environ.get("KHALTI_SECRET_KEY", "")
    if not secret_key:
        return jsonify({"error": "KHALTI_SECRET_KEY not configured"}), 500

    payload = _json.dumps({"token": token, "amount": amount}).encode()
    req = _urllib.Request(
        "https://khalti.com/api/v2/payment/verify/",
        data=payload,
        headers={"Authorization": f"Key {secret_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with _urllib.urlopen(req, timeout=15) as resp:
            result = _json.loads(resp.read())
    except Exception as e:
        return jsonify({"error": f"Khalti check failed: {e}"}), 502

    if result.get("state", {}).get("name") != "Completed":
        return jsonify({"error": "Khalti payment not completed", "detail": result}), 402

    query = Sale.query.filter_by(invoice_number=inv_num)
    if current_user.role != "superadmin":
        query = query.filter(Sale.account_id == current_user.account_id)
    sale = query.first()
    if sale:
        sale.payment_method = "khalti"
        sale.payment_ref = result.get("idx", token)
        db.session.commit()
        log_audit("sale.khalti_verified", resource="sale", resource_id=str(sale.id),
                  detail={"idx": result.get("idx"), "amount": amount})
        return jsonify({"message": "Payment verified", "sale": sale.to_dict()})

    return jsonify({"message": "Verified but sale not found"}), 200
