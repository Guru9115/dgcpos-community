"""
DSR — Daily Sales Register
Endpoints for daily sales entries, wholesale purchases, fixed costs, and monthly P&L.
"""
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from auth_utils import token_required, account_filter, created_by_tenant_filter, expenses_for_tenant
from models import db, DSREntry, DSRPurchase, DSRFixedCost, Sale, Expense
from sqlalchemy import func, extract
from datetime import date
from decimal import Decimal

dsr_bp = Blueprint('dsr', __name__)


def _safe_decimal(val, default=0):
    """Parse JSON number/string; empty strings must not crash Decimal()."""
    if val is None or val == '':
        return Decimal(str(default))
    try:
        return Decimal(str(val))
    except Exception:
        return Decimal(str(default))


def _parse_date(val, fallback=None):
    fallback = fallback or date.today()
    if not val:
        return fallback
    try:
        return date.fromisoformat(str(val)[:10])
    except Exception:
        return fallback


def _sync_pg_sequence(table):
    """Realign Postgres id sequence after SQLite→Postgres imports."""
    if "postgresql" not in db.engine.url.drivername:
        return False
    try:
        db.session.execute(db.text(f"""
            SELECT setval(
                pg_get_serial_sequence('{table}', 'id'),
                COALESCE((SELECT MAX(id) FROM {table}), 0) + 1,
                false
            )
        """))
        db.session.commit()
        print(f"[DSR] {table} sequence synced ✓", flush=True)
        return True
    except Exception as e:
        db.session.rollback()
        print(f"[DSR] {table} sequence sync note: {e}", flush=True)
        return False


def _commit_or_error(action_label, seq_table=None):
    try:
        db.session.commit()
        return None
    except Exception as e:
        db.session.rollback()
        print(f"[DSR] {action_label} failed: {e}", flush=True)
        raw = str(getattr(e, 'orig', e))
        low = raw.lower()
        if seq_table and 'duplicate key value' in low and 'pkey' in low:
            if _sync_pg_sequence(seq_table):
                return 'RETRY_SEQ'
        if 'does not exist' in low or 'no such table' in low:
            return jsonify({'error': 'DSR database tables missing — redeploy backend or contact support'}), 500
        return jsonify({'error': f'Failed to {action_label}: {raw}'}), 500


def _require_manager():
    if current_user.role not in ('owner', 'superadmin', 'manager'):
        return jsonify({'error': 'Permission denied'}), 403
    return None


def _dsr_entries_q():
    return created_by_tenant_filter(DSREntry)


def _dsr_purchases_q():
    return created_by_tenant_filter(DSRPurchase)


def _dsr_fixed_q():
    return created_by_tenant_filter(DSRFixedCost)


def _sales_q():
    return account_filter(Sale.query, Sale)


# ── Daily Sales Entries ────────────────────────────────────────────────────────

@dsr_bp.route('/sales', methods=['GET'])
@token_required
@login_required
def get_sales():
    try:
        month = request.args.get('month', type=int, default=date.today().month)
        year = request.args.get('year', type=int, default=date.today().year)
        rows = _dsr_entries_q().filter(
            extract('month', DSREntry.entry_date) == month,
            extract('year', DSREntry.entry_date) == year,
        ).order_by(DSREntry.entry_date.asc()).all()
        return jsonify([r.to_dict() for r in rows])
    except Exception as e:
        print(f"[DSR] get_sales error: {e}", flush=True)
        return jsonify({'error': 'Failed to load sales entries'}), 500


@dsr_bp.route('/sales', methods=['POST'])
@token_required
@login_required
def add_sale():
    d = request.get_json() or {}
    entry_date = _parse_date(d.get('entry_date'))

    cash = _safe_decimal(d.get('cash_sales', 0))
    card = _safe_decimal(d.get('card_sales', 0))
    online = _safe_decimal(d.get('online_sales', 0))
    other = _safe_decimal(d.get('other_sales', 0))
    total = float(cash + card + online + other)
    if total <= 0:
        return jsonify({'error': 'Enter at least one sales amount'}), 400

    existing = _dsr_entries_q().filter_by(entry_date=entry_date).first()
    if existing:
        existing.cash_sales = cash
        existing.card_sales = card
        existing.online_sales = online
        existing.other_sales = other
        existing.notes = (d.get('notes') or '').strip()
        err = _commit_or_error('update sales entry')
        if err:
            return err
        return jsonify(existing.to_dict())

    entry = DSREntry(
        entry_date=entry_date,
        cash_sales=cash,
        card_sales=card,
        online_sales=online,
        other_sales=other,
        notes=(d.get('notes') or '').strip(),
        created_by=current_user.id,
    )
    db.session.add(entry)
    err = _commit_or_error('save sales entry')
    if err:
        return err
    return jsonify(entry.to_dict()), 201


@dsr_bp.route('/sales/<int:id>', methods=['PUT'])
@token_required
@login_required
def update_sale(id):
    row = _dsr_entries_q().filter_by(id=id).first()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    d = request.get_json() or {}
    for field in ('cash_sales', 'card_sales', 'online_sales', 'other_sales'):
        if field in d:
            setattr(row, field, _safe_decimal(d[field]))
    if 'notes' in d:
        row.notes = d['notes']
    if 'entry_date' in d:
        row.entry_date = _parse_date(d['entry_date'], row.entry_date)
    err = _commit_or_error('update sales entry')
    if err:
        return err
    return jsonify(row.to_dict())


@dsr_bp.route('/sales/<int:id>', methods=['DELETE'])
@token_required
@login_required
def delete_sale(id):
    err = _require_manager()
    if err:
        return err
    row = _dsr_entries_q().filter_by(id=id).first()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(row)
    err = _commit_or_error('delete sales entry')
    if err:
        return err
    return jsonify({'ok': True})


# ── Wholesale Purchases ────────────────────────────────────────────────────────

@dsr_bp.route('/purchases', methods=['GET'])
@token_required
@login_required
def get_purchases():
    try:
        month = request.args.get('month', type=int, default=date.today().month)
        year = request.args.get('year', type=int, default=date.today().year)
        rows = _dsr_purchases_q().filter(
            extract('month', DSRPurchase.purchase_date) == month,
            extract('year', DSRPurchase.purchase_date) == year,
        ).order_by(DSRPurchase.purchase_date.asc()).all()
        return jsonify([r.to_dict() for r in rows])
    except Exception as e:
        print(f"[DSR] get_purchases error: {e}", flush=True)
        return jsonify({'error': 'Failed to load purchases'}), 500


def _build_purchase(d):
    purchase_date = _parse_date(d.get('purchase_date'))
    amount = _safe_decimal(d.get('amount', 0))
    if float(amount) <= 0:
        return None, (jsonify({'error': 'Purchase amount must be greater than zero'}), 400)

    payment_method = (d.get('payment_method') or 'cash').strip().lower()[:30]
    if payment_method not in ('cash', 'card', 'online', 'other'):
        payment_method = 'other'

    return DSRPurchase(
        purchase_date=purchase_date,
        supplier_name=(d.get('supplier_name') or '').strip()[:200],
        category=(d.get('category') or '').strip()[:100],
        amount=amount,
        payment_method=payment_method,
        invoice_ref=(d.get('invoice_ref') or '').strip()[:64],
        notes=(d.get('notes') or '').strip(),
        created_by=current_user.id,
    ), None


@dsr_bp.route('/purchases', methods=['POST'])
@token_required
@login_required
def add_purchase():
    d = request.get_json() or {}
    row, err_resp = _build_purchase(d)
    if err_resp:
        return err_resp

    db.session.add(row)
    err = _commit_or_error('save purchase', 'dsr_purchases')
    if err == 'RETRY_SEQ' and not request.environ.get('dsr_purchase_seq_retry'):
        request.environ['dsr_purchase_seq_retry'] = '1'
        row, err_resp = _build_purchase(d)
        if err_resp:
            return err_resp
        db.session.add(row)
        err = _commit_or_error('save purchase', 'dsr_purchases')
    if err:
        return err
    return jsonify(row.to_dict()), 201


@dsr_bp.route('/purchases/<int:id>', methods=['DELETE'])
@token_required
@login_required
def delete_purchase(id):
    err = _require_manager()
    if err:
        return err
    row = _dsr_purchases_q().filter_by(id=id).first()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(row)
    err = _commit_or_error('delete purchase')
    if err:
        return err
    return jsonify({'ok': True})


# ── Fixed Costs ────────────────────────────────────────────────────────────────

@dsr_bp.route('/fixed-costs', methods=['GET'])
@token_required
@login_required
def get_fixed_costs():
    try:
        month = request.args.get('month', type=int, default=date.today().month)
        year = request.args.get('year', type=int, default=date.today().year)
        rows = _dsr_fixed_q().filter_by(month=month, year=year).order_by(DSRFixedCost.category).all()
        return jsonify([r.to_dict() for r in rows])
    except Exception as e:
        print(f"[DSR] get_fixed_costs error: {e}", flush=True)
        return jsonify({'error': 'Failed to load fixed costs'}), 500


@dsr_bp.route('/fixed-costs', methods=['POST'])
@token_required
@login_required
def add_fixed_cost():
    d = request.get_json() or {}
    name = (d.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Description is required'}), 400

    amount = _safe_decimal(d.get('amount', 0))
    if float(amount) <= 0:
        return jsonify({'error': 'Amount must be greater than zero'}), 400

    category = (d.get('category') or 'other').strip().lower()[:64]
    if category not in ('rent', 'salary', 'utility', 'other'):
        category = 'other'

    try:
        month = int(d.get('month', date.today().month))
        year = int(d.get('year', date.today().year))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid month or year'}), 400

    row = DSRFixedCost(
        month=month,
        year=year,
        name=name[:200],
        category=category,
        amount=amount,
        notes=(d.get('notes') or '').strip(),
        created_by=current_user.id,
    )
    db.session.add(row)
    err = _commit_or_error('save fixed cost', 'dsr_fixed_costs')
    if err == 'RETRY_SEQ' and not request.environ.get('dsr_fixed_seq_retry'):
        request.environ['dsr_fixed_seq_retry'] = '1'
        row = DSRFixedCost(
            month=month,
            year=year,
            name=name[:200],
            category=category,
            amount=amount,
            notes=(d.get('notes') or '').strip(),
            created_by=current_user.id,
        )
        db.session.add(row)
        err = _commit_or_error('save fixed cost', 'dsr_fixed_costs')
    if err:
        return err
    return jsonify(row.to_dict()), 201


@dsr_bp.route('/fixed-costs/<int:id>', methods=['DELETE'])
@token_required
@login_required
def delete_fixed_cost(id):
    err = _require_manager()
    if err:
        return err
    row = _dsr_fixed_q().filter_by(id=id).first()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(row)
    err = _commit_or_error('delete fixed cost')
    if err:
        return err
    return jsonify({'ok': True})


# ── Monthly P&L Report ─────────────────────────────────────────────────────────

@dsr_bp.route('/pl-report', methods=['GET'])
@token_required
@login_required
def pl_report():
    try:
        month = request.args.get('month', type=int, default=date.today().month)
        year = request.args.get('year', type=int, default=date.today().year)

        sales_rows = _dsr_entries_q().filter(
            extract('month', DSREntry.entry_date) == month,
            extract('year', DSREntry.entry_date) == year,
        ).order_by(DSREntry.entry_date).all()

        total_dsr_sales = sum(r.total_sales for r in sales_rows)

        purchase_rows = _dsr_purchases_q().filter(
            extract('month', DSRPurchase.purchase_date) == month,
            extract('year', DSRPurchase.purchase_date) == year,
        ).order_by(DSRPurchase.purchase_date).all()

        total_purchases = sum(float(r.amount or 0) for r in purchase_rows)

        fixed_rows = _dsr_fixed_q().filter_by(month=month, year=year).all()
        total_fixed = sum(float(r.amount or 0) for r in fixed_rows)
        fixed_by_cat = {}
        for r in fixed_rows:
            fixed_by_cat.setdefault(r.category, 0)
            fixed_by_cat[r.category] += float(r.amount or 0)

        pos_sales = 0.0
        try:
            pos_sales = _sales_q().filter(
                extract('month', Sale.sale_date) == month,
                extract('year', Sale.sale_date) == year,
                Sale.status == 'completed',
            ).with_entities(func.coalesce(func.sum(Sale.total), 0)).scalar() or 0
            pos_sales = float(pos_sales)
        except Exception as e:
            print(f"[DSR] pos_sales query note: {e}", flush=True)

        fin_expenses = 0.0
        try:
            fin_expenses = expenses_for_tenant().filter(
                extract('month', Expense.expense_date) == month,
                extract('year', Expense.expense_date) == year,
            ).with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar() or 0
            fin_expenses = float(fin_expenses)
        except Exception as e:
            print(f"[DSR] fin_expenses query note: {e}", flush=True)

        revenue = total_dsr_sales if total_dsr_sales > 0 else pos_sales
        cogs = total_purchases
        gross_profit = revenue - cogs
        total_expenses = total_fixed + fin_expenses
        net_profit = gross_profit - total_expenses
        gross_margin = (gross_profit / revenue * 100) if revenue > 0 else 0
        net_margin = (net_profit / revenue * 100) if revenue > 0 else 0

        daily = []
        for row in sales_rows:
            day_purchases = sum(
                float(p.amount or 0) for p in purchase_rows if p.purchase_date == row.entry_date
            )
            daily.append({
                "date": row.entry_date.isoformat(),
                "sales": row.total_sales,
                "purchases": day_purchases,
                "profit": row.total_sales - day_purchases,
                "cash": float(row.cash_sales or 0),
                "card": float(row.card_sales or 0),
                "online": float(row.online_sales or 0),
                "other": float(row.other_sales or 0),
            })

        return jsonify({
            "month": month,
            "year": year,
            "revenue": revenue,
            "total_dsr_sales": total_dsr_sales,
            "pos_sales": pos_sales,
            "cogs": cogs,
            "gross_profit": gross_profit,
            "gross_margin": round(gross_margin, 1),
            "total_fixed": total_fixed,
            "fin_expenses": fin_expenses,
            "total_expenses": total_expenses,
            "net_profit": net_profit,
            "net_margin": round(net_margin, 1),
            "fixed_by_cat": fixed_by_cat,
            "daily": daily,
            "purchase_rows": [r.to_dict() for r in purchase_rows],
            "fixed_rows": [r.to_dict() for r in fixed_rows],
        })
    except Exception as e:
        print(f"[DSR] pl_report error: {e}", flush=True)
        return jsonify({'error': 'Failed to load P&L report'}), 500