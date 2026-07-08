"""DSR Register API tests — sales, purchases, fixed costs."""
from datetime import date
from decimal import Decimal

from models import db, DSREntry, DSRPurchase, DSRFixedCost


def _login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.get_json()
    return r.get_json()["access_token"]


def _create_owner(app, slug, password="testpass"):
    from tests.test_tenant_isolation import _create_store
    _, owner_id = _create_store(app, f"Store {slug}", slug, password, 0)
    return owner_id


class TestDSRRegister:
    def test_add_sale_empty_strings(self, client, app):
        _create_owner(app, "dsr_sale1")
        token = _login(client, "dsr_sale1", "testpass")
        today = date.today().isoformat()
        r = client.post(
            "/api/dsr/sales",
            json={
                "entry_date": today,
                "cash_sales": "",
                "card_sales": "1500",
                "online_sales": "",
                "other_sales": "",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 201, r.get_json()
        assert float(r.get_json()["card_sales"]) == 1500

    def test_add_sale_requires_amount(self, client, app):
        _create_owner(app, "dsr_sale2")
        token = _login(client, "dsr_sale2", "testpass")
        r = client.post(
            "/api/dsr/sales",
            json={"entry_date": date.today().isoformat(), "cash_sales": "", "card_sales": ""},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400

    def test_add_purchase(self, client, app):
        _create_owner(app, "dsr_pur1")
        token = _login(client, "dsr_pur1", "testpass")
        r = client.post(
            "/api/dsr/purchases",
            json={
                "purchase_date": date.today().isoformat(),
                "supplier_name": "Pooja Traders",
                "category": "Saree",
                "amount": "25000",
                "payment_method": "cash",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 201, r.get_json()
        assert float(r.get_json()["amount"]) == 25000

    def test_add_purchase_empty_amount_fails(self, client, app):
        _create_owner(app, "dsr_pur2")
        token = _login(client, "dsr_pur2", "testpass")
        r = client.post(
            "/api/dsr/purchases",
            json={"purchase_date": date.today().isoformat(), "amount": ""},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400

    def test_add_fixed_cost(self, client, app):
        _create_owner(app, "dsr_fix1")
        token = _login(client, "dsr_fix1", "testpass")
        today = date.today()
        r = client.post(
            "/api/dsr/fixed-costs",
            json={
                "month": today.month,
                "year": today.year,
                "name": "Shop Rent",
                "category": "rent",
                "amount": 45000,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 201, r.get_json()
        assert float(r.get_json()["amount"]) == 45000

    def test_pl_report_after_entries(self, client, app):
        owner_id = _create_owner(app, "dsr_pl1")
        today = date.today()
        with app.app_context():
            db.session.add(DSREntry(
                entry_date=today, cash_sales=Decimal("5000"), created_by=owner_id
            ))
            db.session.add(DSRPurchase(
                purchase_date=today, amount=Decimal("2000"), created_by=owner_id
            ))
            db.session.commit()

        token = _login(client, "dsr_pl1", "testpass")
        r = client.get(
            f"/api/dsr/pl-report?month={today.month}&year={today.year}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.get_json()
        data = r.get_json()
        assert data["total_dsr_sales"] == 5000
        assert data["cogs"] == 2000