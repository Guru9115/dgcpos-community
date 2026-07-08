from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Customer, Sale, PointTransaction, MEMBERSHIP_TIERS

customers_bp = Blueprint("customers", __name__)

@customers_bp.route("/", methods=["GET"])
@token_required
@login_required
def get_customers():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    search = request.args.get("search", request.args.get("q", ""))
    vip = request.args.get("vip")
    tier = request.args.get("tier")
    account_id = getattr(current_user, 'account_id', None)
    query = Customer.query
    if account_id and current_user.role != "superadmin":
        query = query.filter(Customer.account_id == account_id)
    if search: query = query.filter(Customer.name.ilike(f"%{search}%") | Customer.phone.ilike(f"%{search}%"))
    if vip: query = query.filter_by(is_vip=True)
    if tier: query = query.filter_by(membership_tier=tier)
    pagination = query.order_by(Customer.name).paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        "customers": [c.to_dict() for c in pagination.items],
        "total": pagination.total,
        "pages": pagination.pages,
        "page": pagination.page,
        "per_page": pagination.per_page
    })

@customers_bp.route("/tiers", methods=["GET"])
@token_required
@login_required
def get_tiers():
    return jsonify(MEMBERSHIP_TIERS)

@customers_bp.route("/membership-stats", methods=["GET"])
@token_required
@login_required
def membership_stats():
    base = Customer.query
    if current_user.role != "superadmin":
        base = base.filter(Customer.account_id == current_user.account_id)
    stats = {}
    for tier in MEMBERSHIP_TIERS:
        stats[tier] = base.filter_by(membership_tier=tier).count()
    total_points_query = db.session.query(db.func.sum(Customer.loyalty_points))
    if current_user.role != "superadmin":
        total_points_query = total_points_query.filter(Customer.account_id == current_user.account_id)
    total_points = total_points_query.scalar() or 0
    return jsonify({"tier_counts": stats, "total_points_outstanding": int(total_points)})

@customers_bp.route("/<int:cid>", methods=["GET"])
@token_required
@login_required
def get_customer(cid):
    query = Customer.query.filter_by(id=cid)
    if current_user.role != "superadmin":
        query = query.filter(Customer.account_id == current_user.account_id)
    c = query.first()
    if not c:
        return jsonify({"error": "Not found"}), 404
    data = c.to_dict()
    sales = Sale.query.filter_by(customer_id=cid, status="completed").order_by(Sale.sale_date.desc()).limit(10).all()
    data["recent_sales"] = [s.to_dict() for s in sales]
    txns = PointTransaction.query.filter_by(customer_id=cid).order_by(PointTransaction.created_at.desc()).limit(20).all()
    data["point_history"] = [t.to_dict() for t in txns]
    return jsonify(data)

@customers_bp.route("/", methods=["POST"])
@token_required
@login_required
def create_customer():
    data = request.get_json()
    c = Customer(
        account_id=getattr(current_user, 'account_id', None),
        name=data["name"], phone=data.get("phone"), email=data.get("email"),
        address=data.get("address"), notes=data.get("notes"),
        membership_tier="bronze"
    )
    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201

@customers_bp.route("/<int:cid>", methods=["PUT"])
@token_required
@login_required
def update_customer(cid):
    query = Customer.query.filter_by(id=cid)
    if current_user.role != "superadmin":
        query = query.filter(Customer.account_id == current_user.account_id)
    c = query.first()
    if not c:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json() or {}
    for f in ["name","phone","email","address","notes"]:
        if f in data: setattr(c, f, data[f])
    if "membership_tier" in data and data["membership_tier"] in MEMBERSHIP_TIERS:
        c.membership_tier = data["membership_tier"]
    db.session.commit()
    return jsonify(c.to_dict())

@customers_bp.route("/<int:cid>/adjust-points", methods=["POST"])
@token_required
@login_required
def adjust_points(cid):
    query = Customer.query.filter_by(id=cid)
    if current_user.role != "superadmin":
        query = query.filter(Customer.account_id == current_user.account_id)
    c = query.first()
    if not c:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json() or {}
    pts = int(data.get("points", 0))
    note = data.get("note", "Manual adjustment")
    if pts == 0:
        return jsonify({"error": "Points cannot be zero"}), 400
    c.loyalty_points = max(0, c.loyalty_points + pts)
    txn = PointTransaction(
        customer_id=c.id,
        txn_type="adjusted",
        points=pts,
        balance=c.loyalty_points,
        note=note,
        created_by=current_user.id
    )
    db.session.add(txn)
    db.session.commit()
    return jsonify(c.to_dict())

@customers_bp.route("/<int:cid>/point-history", methods=["GET"])
@token_required
@login_required
def point_history(cid):
    txns = PointTransaction.query.filter_by(customer_id=cid).order_by(PointTransaction.created_at.desc()).all()
    return jsonify([t.to_dict() for t in txns])

@customers_bp.route("/<int:cid>", methods=["DELETE"])
@token_required
@login_required
def delete_customer(cid):
    c = Customer.query.get_or_404(cid)
    PointTransaction.query.filter_by(customer_id=cid).delete()
    db.session.delete(c)
    db.session.commit()
    return jsonify({"message":"Deleted"})