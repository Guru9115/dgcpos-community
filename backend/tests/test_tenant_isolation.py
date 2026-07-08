"""Dashboard, reports, finance, and DSR must only return data for the logged-in store."""
from datetime import datetime, date
from decimal import Decimal

from models import db, Account, User, Sale, Product, Customer, Expense, DSREntry


def _create_store(app, name, username, password, sale_total):
    with app.app_context():
        account = Account(name=name, business_location="Test City")
        db.session.add(account)
        db.session.flush()

        owner = User(
            username=username,
            email=f"{username}@test.local",
            full_name=f"{name} Owner",
            role="owner",
            is_active=True,
            account_id=account.id,
        )
        owner.set_password(password)
        db.session.add(owner)
        db.session.flush()

        customer = Customer(name=f"{name} Customer", phone="9800000000", account_id=account.id)
        db.session.add(customer)
        db.session.flush()

        product = Product(
            name=f"{name} Product",
            sku=f"SKU-{username}",
            cost_price=100,
            selling_price=200,
            stock_qty=10,
            status="active",
            account_id=account.id,
        )
        db.session.add(product)
        db.session.flush()

        sale = Sale(
            invoice_number=f"INV-{username}",
            customer_id=customer.id,
            cashier_id=owner.id,
            account_id=account.id,
            subtotal=sale_total,
            total=sale_total,
            payment_method="cash",
            status="completed",
            sale_date=datetime.utcnow(),
        )
        db.session.add(sale)
        db.session.commit()
        return account.id, owner.id


def _login(client, username, password):
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()["token"]


class TestTenantIsolation:
    def test_dashboard_kpis_scoped_per_account(self, client, app):
        _create_store(app, "Store Alpha", "alpha_owner", "alphapass", 1000)
        _create_store(app, "Store Beta", "beta_owner", "betapass", 5000)

        alpha_token = _login(client, "alpha_owner", "alphapass")
        resp = client.get(
            "/api/dashboard/kpis",
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()
        assert data["today_sales"] == 1000
        assert data["today_transactions"] == 1
        assert data["customer_count"] == 1

        beta_token = _login(client, "beta_owner", "betapass")
        resp2 = client.get(
            "/api/dashboard/kpis",
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        assert resp2.status_code == 200
        data2 = resp2.get_json()
        assert data2["today_sales"] == 5000
        assert data2["today_transactions"] == 1

    def test_reports_summary_scoped_per_account(self, client, app):
        _create_store(app, "Gamma Shop", "gamma_owner", "gammapass", 2500)
        _create_store(app, "Delta Shop", "delta_owner", "deltapass", 7500)

        gamma_token = _login(client, "gamma_owner", "gammapass")
        today = datetime.utcnow().date().isoformat()
        resp = client.get(
            f"/api/reports/summary?date_from={today}&date_to={today}",
            headers={"Authorization": f"Bearer {gamma_token}"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["total_revenue"] == 2500
        assert data["transactions"] == 1

        delta_token = _login(client, "delta_owner", "deltapass")
        resp2 = client.get(
            f"/api/reports/summary?date_from={today}&date_to={today}",
            headers={"Authorization": f"Bearer {delta_token}"},
        )
        assert resp2.status_code == 200
        assert resp2.get_json()["total_revenue"] == 7500

    def test_dashboard_recent_transactions_not_cross_tenant(self, client, app):
        _create_store(app, "Epsilon", "eps_owner", "epspass", 111)
        _create_store(app, "Zeta", "zeta_owner", "zetapass", 999)

        eps_token = _login(client, "eps_owner", "epspass")
        resp = client.get(
            "/api/dashboard/recent-transactions",
            headers={"Authorization": f"Bearer {eps_token}"},
        )
        assert resp.status_code == 200
        rows = resp.get_json()
        assert len(rows) == 1
        assert rows[0]["total"] == 111
        assert "INV-zeta_owner" not in [r.get("invoice_number") for r in rows]

    def test_finance_expenses_scoped_per_account(self, client, app):
        _, alpha_owner_id = _create_store(app, "Finance Alpha", "fin_alpha", "alphapass", 100)
        _, beta_owner_id = _create_store(app, "Finance Beta", "fin_beta", "betapass", 100)

        with app.app_context():
            db.session.add(Expense(
                title="Alpha Rent", amount=100, expense_date=date.today(), created_by=alpha_owner_id
            ))
            db.session.add(Expense(
                title="Beta Rent", amount=500, expense_date=date.today(), created_by=beta_owner_id
            ))
            db.session.commit()

        alpha_token = _login(client, "fin_alpha", "alphapass")
        resp = client.get(
            "/api/finance/expenses",
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        assert resp.status_code == 200
        rows = resp.get_json()
        assert len(rows) == 1
        assert rows[0]["title"] == "Alpha Rent"
        assert rows[0]["amount"] == 100

        beta_token = _login(client, "fin_beta", "betapass")
        resp2 = client.get(
            "/api/finance/summary",
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        assert resp2.status_code == 200
        assert resp2.get_json()["monthly_expenses"] == 500

    def test_finance_cannot_mutate_other_tenant_expense(self, client, app):
        _, alpha_owner_id = _create_store(app, "Mut Alpha", "mut_alpha", "alphapass", 0)
        _create_store(app, "Mut Beta", "mut_beta", "betapass", 0)

        with app.app_context():
            beta_expense = Expense(
                title="Secret", amount=999, expense_date=date.today(), created_by=alpha_owner_id
            )
            db.session.add(beta_expense)
            db.session.commit()
            expense_id = beta_expense.id

        beta_token = _login(client, "mut_beta", "betapass")
        resp = client.delete(
            f"/api/finance/expenses/{expense_id}",
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        assert resp.status_code == 404

    def test_dsr_sales_scoped_per_account(self, client, app):
        _, alpha_owner_id = _create_store(app, "DSR Alpha", "dsr_alpha", "alphapass", 0)
        _, beta_owner_id = _create_store(app, "DSR Beta", "dsr_beta", "betapass", 0)
        today = date.today()

        with app.app_context():
            db.session.add(DSREntry(
                entry_date=today, cash_sales=Decimal("1200"), created_by=alpha_owner_id
            ))
            db.session.add(DSREntry(
                entry_date=today, cash_sales=Decimal("8800"), created_by=beta_owner_id
            ))
            db.session.commit()

        alpha_token = _login(client, "dsr_alpha", "alphapass")
        resp = client.get(
            f"/api/dsr/sales?month={today.month}&year={today.year}",
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        assert resp.status_code == 200
        rows = resp.get_json()
        assert len(rows) == 1
        assert float(rows[0]["cash_sales"]) == 1200

        beta_token = _login(client, "dsr_beta", "betapass")
        resp2 = client.get(
            f"/api/dsr/pl-report?month={today.month}&year={today.year}",
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        assert resp2.status_code == 200
        assert resp2.get_json()["total_dsr_sales"] == 8800