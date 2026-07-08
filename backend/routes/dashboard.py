from flask import Blueprint, jsonify, request
from flask_login import login_required
from auth_utils import token_required, account_filter
from models import db, Sale, SaleItem, Product, Customer
from sqlalchemy import func, extract
from datetime import datetime, date, timedelta

def _get_date_range():
    """Return (date_from, date_to) as YYYY-MM-DD strings (UTC-aware default)."""
    df = (request.args.get('date_from') or datetime.utcnow().date().isoformat())[:10]
    dt = (request.args.get('date_to') or datetime.utcnow().date().isoformat())[:10]
    return df, dt


def _sales_q():
    return account_filter(Sale.query, Sale)


def _products_q():
    return account_filter(Product.query, Product)


def _customers_q():
    return account_filter(Customer.query, Customer)


def _completed_sales_in_range(date_from, date_to):
    d_from = date_from[:10]
    d_to = date_to[:10]
    return _sales_q().filter(
        func.date(Sale.sale_date) >= d_from,
        func.date(Sale.sale_date) <= d_to,
        Sale.status == "completed",
    )


def _sale_range_clauses(date_from, date_to):
    d_from = date_from[:10]
    d_to = date_to[:10]
    return (
        func.date(Sale.sale_date) >= d_from,
        func.date(Sale.sale_date) <= d_to,
        Sale.status == "completed",
    )


dashboard_bp = Blueprint("dashboard", __name__)

@dashboard_bp.route("/kpis", methods=["GET"])
@token_required
@login_required
def get_kpis():
    date_from, date_to = _get_date_range()
    in_range = _completed_sales_in_range(date_from, date_to)

    period_sales = in_range.with_entities(func.coalesce(func.sum(Sale.total), 0)).scalar() or 0
    period_count = in_range.count()

    monthly_profit = db.session.query(
        func.sum((SaleItem.unit_price - SaleItem.cost_price) * SaleItem.qty)
    ).join(Sale).filter(
        Sale.id.in_(in_range.with_entities(Sale.id).scalar_subquery())
    ).scalar() or 0

    inventory_value = db.session.query(
        func.sum(Product.selling_price * Product.stock_qty)
    ).filter(
        Product.id.in_(
            _products_q().filter(Product.status == "active").with_entities(Product.id)
        )
    ).scalar() or 0

    customer_count = _customers_q().count()
    low_stock_count = _products_q().filter(
        Product.stock_qty <= Product.reorder_level,
        Product.status == "active",
    ).count()

    return jsonify({
        "today_sales": float(period_sales),
        "today_transactions": period_count,
        "monthly_revenue": float(period_sales),
        "monthly_profit": float(monthly_profit),
        "inventory_value": float(inventory_value),
        "customer_count": customer_count,
        "low_stock_count": low_stock_count,
    })

@dashboard_bp.route("/sales-trend", methods=["GET"])
@token_required
@login_required
def sales_trend():
    date_from, date_to = _get_date_range()
    try:
        d_from = datetime.fromisoformat(date_from[:10]).date()
        d_to = datetime.fromisoformat(date_to[:10]).date()
    except Exception:
        d_from = date.today() - timedelta(days=29)
        d_to = date.today()

    in_range = _completed_sales_in_range(date_from, date_to)
    rows = db.session.query(
        func.date(Sale.sale_date).label("day"),
        func.sum(Sale.total).label("revenue"),
    ).filter(
        Sale.id.in_(in_range.with_entities(Sale.id).scalar_subquery())
    ).group_by(func.date(Sale.sale_date)).all()

    revenue_map = {str(r.day): float(r.revenue) for r in rows}
    result = []
    cur = d_from
    while cur <= d_to:
        dstr = cur.isoformat()
        result.append({"date": dstr, "revenue": revenue_map.get(dstr, 0)})
        cur += timedelta(days=1)
    return jsonify(result)

@dashboard_bp.route("/top-products", methods=["GET"])
@token_required
@login_required
def top_products():
    date_from, date_to = _get_date_range()
    in_range = _completed_sales_in_range(date_from, date_to)
    results = db.session.query(
        SaleItem.product_name,
        func.sum(SaleItem.qty).label("total_qty"),
        func.sum(SaleItem.total).label("total_revenue"),
    ).join(Sale).filter(
        Sale.id.in_(in_range.with_entities(Sale.id).scalar_subquery())
    ).group_by(SaleItem.product_name).order_by(
        func.sum(SaleItem.total).desc()
    ).limit(10).all()
    return jsonify([{"name": r[0], "qty": int(r[1]), "revenue": float(r[2])} for r in results])

@dashboard_bp.route("/recent-transactions", methods=["GET"])
@token_required
@login_required
def recent_transactions():
    date_from, date_to = _get_date_range()
    d_from, d_to = date_from[:10], date_to[:10]
    sales = _sales_q().filter(
        Sale.status == "completed",
        func.date(Sale.sale_date) >= d_from,
        func.date(Sale.sale_date) <= d_to,
    ).order_by(Sale.sale_date.desc()).limit(10).all()
    return jsonify([s.to_dict() for s in sales])

@dashboard_bp.route("/monthly-revenue", methods=["GET"])
@token_required
@login_required
def monthly_revenue():
    date_from, date_to = _get_date_range()
    in_range = _completed_sales_in_range(date_from, date_to)
    results = db.session.query(
        extract('year', Sale.sale_date).label('year'),
        extract('month', Sale.sale_date).label('month'),
        func.sum(Sale.total).label('revenue'),
    ).filter(
        Sale.id.in_(in_range.with_entities(Sale.id).scalar_subquery())
    ).group_by('year', 'month').order_by('year', 'month').limit(12).all()
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return jsonify([{"month": months[int(r[1]) - 1], "revenue": float(r[2])} for r in results])

@dashboard_bp.route("/hourly-sales", methods=["GET"])
@token_required
@login_required
def hourly_sales():
    date_from, date_to = _get_date_range()
    target_day = date_to[:10] if date_to else date.today().isoformat()
    day_sales = _completed_sales_in_range(target_day, target_day)
    rows = db.session.query(
        extract('hour', Sale.sale_date).label('hour'),
        func.sum(Sale.total).label('revenue'),
        func.count(Sale.id).label('txn_count'),
    ).filter(
        Sale.id.in_(day_sales.with_entities(Sale.id).scalar_subquery())
    ).group_by('hour').all()
    result = {h: {"revenue": 0, "count": 0} for h in range(24)}
    for r in rows:
        result[int(r.hour)] = {"revenue": float(r.revenue), "count": int(r.txn_count)}
    return jsonify([{"hour": h, **v} for h, v in result.items()])


@dashboard_bp.route("/payment-breakdown", methods=["GET"])
@token_required
@login_required
def payment_breakdown():
    date_from, date_to = _get_date_range()
    in_range = _completed_sales_in_range(date_from, date_to)
    rows = db.session.query(
        Sale.payment_method,
        func.sum(Sale.total).label('total'),
        func.count(Sale.id).label('count'),
    ).filter(
        Sale.id.in_(in_range.with_entities(Sale.id).scalar_subquery())
    ).group_by(Sale.payment_method).all()
    return jsonify([{
        "method": r[0] or "cash",
        "total": float(r[1]),
        "count": int(r[2]),
    } for r in rows])


@dashboard_bp.route("/top-customers", methods=["GET"])
@token_required
@login_required
def top_customers():
    date_from, date_to = _get_date_range()
    q = db.session.query(
        Customer.id,
        Customer.name,
        Customer.phone,
        func.sum(Sale.total).label('revenue'),
        func.count(Sale.id).label('visits'),
    ).join(Sale, Sale.customer_id == Customer.id).filter(
        func.date(Sale.sale_date) >= date_from[:10],
        func.date(Sale.sale_date) <= date_to[:10],
        Sale.status == "completed",
    )
    q = account_filter(q, Sale)
    q = account_filter(q, Customer)
    rows = q.group_by(Customer.id, Customer.name, Customer.phone).order_by(
        func.sum(Sale.total).desc()
    ).limit(8).all()
    return jsonify([{
        "id": r[0], "name": r[1], "phone": r[2],
        "revenue": float(r[3]), "visits": int(r[4]),
    } for r in rows])


@dashboard_bp.route("/bundle", methods=["GET"])
@token_required
@login_required
def dashboard_bundle():
    """Single round-trip for dashboard — avoids 8 parallel HTTP calls from the browser."""
    date_from, date_to = _get_date_range()
    in_range = _completed_sales_in_range(date_from, date_to)

    period_sales = in_range.with_entities(func.coalesce(func.sum(Sale.total), 0)).scalar() or 0
    period_count = in_range.count()
    monthly_profit = account_filter(
        db.session.query(
            func.sum((SaleItem.unit_price - SaleItem.cost_price) * SaleItem.qty)
        ).join(Sale),
        Sale,
    ).filter(*_sale_range_clauses(date_from, date_to)).scalar() or 0
    inventory_value = db.session.query(
        func.sum(Product.selling_price * Product.stock_qty)
    ).filter(
        Product.id.in_(
            _products_q().filter(Product.status == "active").with_entities(Product.id)
        )
    ).scalar() or 0

    try:
        d_from = datetime.fromisoformat(date_from[:10]).date()
        d_to = datetime.fromisoformat(date_to[:10]).date()
    except Exception:
        d_from = date.today() - timedelta(days=29)
        d_to = date.today()

    trend_rows = in_range.with_entities(
        func.date(Sale.sale_date).label("day"),
        func.sum(Sale.total).label("revenue"),
    ).group_by(func.date(Sale.sale_date)).all()
    revenue_map = {str(r.day): float(r.revenue) for r in trend_rows}
    trend = []
    cur = d_from
    while cur <= d_to:
        dstr = cur.isoformat()
        trend.append({"date": dstr, "revenue": revenue_map.get(dstr, 0)})
        cur += timedelta(days=1)

    top_prod_rows = account_filter(
        db.session.query(
            SaleItem.product_name,
            func.sum(SaleItem.qty).label("total_qty"),
            func.sum(SaleItem.total).label("total_revenue"),
        ).join(Sale),
        Sale,
    ).filter(*_sale_range_clauses(date_from, date_to)).group_by(
        SaleItem.product_name
    ).order_by(func.sum(SaleItem.total).desc()).limit(10).all()

    d_from, d_to = date_from[:10], date_to[:10]
    recent_sales = _sales_q().filter(
        Sale.status == "completed",
        func.date(Sale.sale_date) >= d_from,
        func.date(Sale.sale_date) <= d_to,
    ).order_by(Sale.sale_date.desc()).limit(10).all()

    month_rows = in_range.with_entities(
        extract('year', Sale.sale_date).label('year'),
        extract('month', Sale.sale_date).label('month'),
        func.sum(Sale.total).label('revenue'),
    ).group_by('year', 'month').order_by('year', 'month').limit(12).all()
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    target_day = date_to[:10] if date_to else date.today().isoformat()
    day_sales = _completed_sales_in_range(target_day, target_day)
    hourly_rows = day_sales.with_entities(
        extract('hour', Sale.sale_date).label('hour'),
        func.sum(Sale.total).label('revenue'),
        func.count(Sale.id).label('txn_count'),
    ).group_by('hour').all()
    hourly_map = {h: {"revenue": 0, "count": 0} for h in range(24)}
    for r in hourly_rows:
        hourly_map[int(r.hour)] = {"revenue": float(r.revenue), "count": int(r.txn_count)}

    pay_rows = in_range.with_entities(
        Sale.payment_method,
        func.sum(Sale.total).label('total'),
        func.count(Sale.id).label('count'),
    ).group_by(Sale.payment_method).all()

    cust_q = db.session.query(
        Customer.id,
        Customer.name,
        Customer.phone,
        func.sum(Sale.total).label('revenue'),
        func.count(Sale.id).label('visits'),
    ).join(Sale, Sale.customer_id == Customer.id).filter(
        func.date(Sale.sale_date) >= date_from[:10],
        func.date(Sale.sale_date) <= date_to[:10],
        Sale.status == "completed",
    )
    cust_q = account_filter(cust_q, Sale)
    cust_q = account_filter(cust_q, Customer)
    cust_rows = cust_q.group_by(Customer.id, Customer.name, Customer.phone).order_by(
        func.sum(Sale.total).desc()
    ).limit(8).all()

    return jsonify({
        "kpi": {
            "today_sales": float(period_sales),
            "today_transactions": period_count,
            "monthly_revenue": float(period_sales),
            "monthly_profit": float(monthly_profit),
            "inventory_value": float(inventory_value),
            "customer_count": _customers_q().count(),
            "low_stock_count": _products_q().filter(
                Product.stock_qty <= Product.reorder_level,
                Product.status == "active",
            ).count(),
        },
        "trend": trend,
        "top_products": [
            {"name": r[0], "qty": int(r[1]), "revenue": float(r[2])} for r in top_prod_rows
        ],
        "recent": [s.to_dict() for s in recent_sales],
        "monthly": [{"month": months[int(r[1]) - 1], "revenue": float(r[2])} for r in month_rows],
        "hourly": [{"hour": h, **v} for h, v in hourly_map.items()],
        "payment": [{
            "method": r[0] or "cash",
            "total": float(r[1]),
            "count": int(r[2]),
        } for r in pay_rows],
        "top_customers": [{
            "id": r[0], "name": r[1], "phone": r[2],
            "revenue": float(r[3]), "visits": int(r[4]),
        } for r in cust_rows],
    })