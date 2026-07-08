from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from auth_utils import token_required, account_filter, expenses_for_tenant
from models import db, Expense, Sale
from datetime import date, datetime
from sqlalchemy import func

finance_bp = Blueprint("finance", __name__)


def _sales_q():
    return account_filter(Sale.query, Sale)


def _get_tenant_expense(eid):
    return expenses_for_tenant().filter(Expense.id == eid).first()


@finance_bp.route("/expenses", methods=["GET"])
@token_required
@login_required
def get_expenses():
    expenses = expenses_for_tenant().order_by(Expense.expense_date.desc()).all()
    return jsonify([e.to_dict() for e in expenses])


@finance_bp.route("/expenses", methods=["POST"])
@token_required
@login_required
def create_expense():
    data = request.get_json()
    raw_date = data.get("expense_date", date.today().isoformat())
    parsed_date = datetime.strptime(raw_date, "%Y-%m-%d").date() if isinstance(raw_date, str) else raw_date
    e = Expense(
        title=data["title"], category=data.get("category"),
        amount=float(data.get("amount") or 0),
        payment_method=data.get("payment_method", "cash"),
        description=data.get("description"),
        expense_date=parsed_date,
        created_by=current_user.id
    )
    db.session.add(e)
    db.session.commit()
    return jsonify(e.to_dict()), 201


@finance_bp.route("/expenses/<int:eid>", methods=["PUT"])
@token_required
@login_required
def update_expense(eid):
    e = _get_tenant_expense(eid)
    if not e:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json()
    for f in ["title", "category", "payment_method", "description"]:
        if f in data:
            setattr(e, f, data[f])
    if "amount" in data:
        e.amount = float(data["amount"] or 0)
    if "expense_date" in data:
        raw = data["expense_date"]
        e.expense_date = datetime.strptime(raw, "%Y-%m-%d").date() if isinstance(raw, str) else raw
    db.session.commit()
    return jsonify(e.to_dict())


@finance_bp.route("/expenses/<int:eid>", methods=["DELETE"])
@token_required
@login_required
def delete_expense(eid):
    e = _get_tenant_expense(eid)
    if not e:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(e)
    db.session.commit()
    return jsonify({"message": "Deleted"})


@finance_bp.route("/summary", methods=["GET"])
@token_required
@login_required
def financial_summary():
    date_from_str = request.args.get("date_from")
    date_to_str = request.args.get("date_to")

    if date_from_str:
        try:
            date_from = datetime.strptime(date_from_str, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Invalid date_from format. Use YYYY-MM-DD."}), 400
    else:
        date_from = date.today().replace(day=1)

    if date_to_str:
        try:
            date_to = datetime.strptime(date_to_str, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Invalid date_to format. Use YYYY-MM-DD."}), 400
    else:
        date_to = date.today()

    revenue_query = _sales_q().filter(
        Sale.sale_date >= date_from,
        Sale.sale_date <= date_to,
        Sale.status == "completed",
    )
    expenses_query = expenses_for_tenant().filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    )

    revenue = revenue_query.with_entities(func.coalesce(func.sum(Sale.total), 0)).scalar() or 0
    expenses = expenses_query.with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar() or 0

    return jsonify({
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "monthly_revenue": float(revenue),
        "monthly_expenses": float(expenses),
        "net_profit": float(revenue) - float(expenses),
    })