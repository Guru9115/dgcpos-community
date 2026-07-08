"""Sales creation, stock deduction, validation, refund, and void tests."""
import pytest
from models import Product, Sale


def _prod(app, sku):
    """Return (id, selling_price, stock_qty) for a product by SKU."""
    with app.app_context():
        p = Product.query.filter_by(sku=sku).first()
        return p.id, float(p.selling_price), p.stock_qty


def _pid(app, sku):
    return _prod(app, sku)[0]


def _stock(app, sku):
    return _prod(app, sku)[2]


class TestCreateSale:
    def test_basic_sale_success(self, client, auth_headers, app):
        pid, price, before = _prod(app, "BSH-001")
        resp = client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": 2}],
            "payment_method": "cash",
            "amount_paid": price * 2,
        }, headers=auth_headers)
        assert resp.status_code in (200, 201)
        data = resp.get_json()
        assert "invoice_number" in data
        assert data["total"] == pytest.approx(price * 2)
        assert _stock(app, "BSH-001") == before - 2

    def test_sale_with_discount(self, client, auth_headers, app):
        pid, price, _ = _prod(app, "BSH-001")
        expected_disc = round(price * 0.1, 2)
        expected_total = round(price - expected_disc, 2)
        resp = client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": 1}],
            "discount_pct": 10,
            "payment_method": "cash",
            "amount_paid": expected_total,
        }, headers=auth_headers)
        assert resp.status_code in (200, 201)
        data = resp.get_json()
        assert data["discount_amount"] == pytest.approx(expected_disc, abs=0.05)
        assert data["total"] == pytest.approx(expected_total, abs=0.05)

    def test_sale_with_tax(self, client, auth_headers, app):
        pid, price, _ = _prod(app, "BSH-001")
        expected_tax = round(price * 0.13, 2)
        expected_total = round(price + expected_tax, 2)
        resp = client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": 1}],
            "tax_pct": 13,
            "payment_method": "cash",
            "amount_paid": expected_total,
        }, headers=auth_headers)
        assert resp.status_code in (200, 201)
        data = resp.get_json()
        assert data["tax_amount"] == pytest.approx(expected_tax, abs=0.05)
        assert data["total"] == pytest.approx(expected_total, abs=0.05)

    def test_sale_multiple_items(self, client, auth_headers, app):
        p1, price1, before1 = _prod(app, "BSH-001")
        p2, price2, before2 = _prod(app, "RDS-001")
        resp = client.post("/api/sales/", json={
            "items": [
                {"product_id": p1, "qty": 1},
                {"product_id": p2, "qty": 1},
            ],
            "payment_method": "card",
            "amount_paid": price1 + price2,
        }, headers=auth_headers)
        assert resp.status_code in (200, 201)
        assert _stock(app, "BSH-001") == before1 - 1
        assert _stock(app, "RDS-001") == before2 - 1

    def test_sale_with_qr_payment(self, client, auth_headers, app):
        pid, price, _ = _prod(app, "BSH-001")
        resp = client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": 1}],
            "payment_method": "qr",
            "amount_paid": price,
        }, headers=auth_headers)
        assert resp.status_code in (200, 201)
        assert resp.get_json()["payment_method"] == "qr"


class TestSaleValidation:
    def test_empty_cart_rejected(self, client, auth_headers):
        resp = client.post("/api/sales/", json={
            "items": [], "payment_method": "cash", "amount_paid": 0
        }, headers=auth_headers)
        assert resp.status_code == 422

    def test_missing_items_field(self, client, auth_headers):
        resp = client.post("/api/sales/", json={"payment_method": "cash"}, headers=auth_headers)
        assert resp.status_code == 422

    def test_invalid_payment_method(self, client, auth_headers, app):
        pid = _pid(app, "BSH-001")
        resp = client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": 1}],
            "payment_method": "bitcoin",
            "amount_paid": 1000,
        }, headers=auth_headers)
        assert resp.status_code == 422

    def test_discount_over_30_rejected(self, client, auth_headers, app):
        pid = _pid(app, "BSH-001")
        resp = client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": 1}],
            "discount_pct": 35,
            "payment_method": "cash",
            "amount_paid": 0,
        }, headers=auth_headers)
        assert resp.status_code == 422

    def test_nonexistent_product(self, client, auth_headers):
        resp = client.post("/api/sales/", json={
            "items": [{"product_id": 999999, "qty": 1}],
            "payment_method": "cash",
            "amount_paid": 100,
        }, headers=auth_headers)
        assert resp.status_code in (400, 404, 422)

    def test_insufficient_stock(self, client, auth_headers, app):
        pid = _pid(app, "RDS-001")
        stock = _stock(app, "RDS-001")
        resp = client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": stock + 999}],
            "payment_method": "cash",
            "amount_paid": 999999,
        }, headers=auth_headers)
        assert resp.status_code in (400, 422)
        # Stock must NOT change
        assert _stock(app, "RDS-001") == stock

    def test_requires_auth(self, anon_client, app):
        pid = _pid(app, "BSH-001")
        resp = anon_client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": 1}],
            "payment_method": "cash", "amount_paid": 1000,
        })
        assert resp.status_code == 401


class TestSaleLookup:
    def _create_sale(self, client, auth_headers, app):
        pid = _pid(app, "BSH-001")
        r = client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": 1}],
            "payment_method": "cash", "amount_paid": 1000,
        }, headers=auth_headers)
        assert r.status_code in (200, 201)
        return r.get_json()["id"]

    def test_get_sale_by_id(self, client, auth_headers, app):
        sid = self._create_sale(client, auth_headers, app)
        resp = client.get(f"/api/sales/{sid}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()["id"] == sid

    def test_list_sales(self, client, auth_headers):
        resp = client.get("/api/sales/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert "sales" in data
        assert len(data["sales"]) >= 1

    def test_get_nonexistent_sale(self, client, auth_headers):
        resp = client.get("/api/sales/999999", headers=auth_headers)
        assert resp.status_code == 404


class TestSaleVoidRefund:
    def _create_sale(self, client, headers, app):
        pid = _pid(app, "BSH-001")
        r = client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": 1}],
            "payment_method": "cash", "amount_paid": 1000,
        }, headers=headers)
        assert r.status_code in (200, 201)
        return r.get_json()["id"]

    def test_void_sale_restores_stock(self, client, auth_headers, app):
        before = _stock(app, "BSH-001")
        sid = self._create_sale(client, auth_headers, app)
        after_sale = _stock(app, "BSH-001")
        assert after_sale == before - 1

        resp = client.put(f"/api/sales/{sid}/void", headers=auth_headers)
        assert resp.status_code == 200
        assert _stock(app, "BSH-001") == before

    def test_cannot_void_already_voided_sale(self, client, auth_headers, app):
        sid = self._create_sale(client, auth_headers, app)
        client.put(f"/api/sales/{sid}/void", headers=auth_headers)
        resp = client.put(f"/api/sales/{sid}/void", headers=auth_headers)
        assert resp.status_code in (400, 409)

    def test_cashier_cannot_void(self, client, cashier_headers, auth_headers, app):
        sid = self._create_sale(client, auth_headers, app)
        resp = client.put(f"/api/sales/{sid}/void", headers=cashier_headers)
        assert resp.status_code == 403

    def test_partial_refund(self, client, auth_headers, app):
        pid, price, _ = _prod(app, "BSH-001")
        r = client.post("/api/sales/", json={
            "items": [{"product_id": pid, "qty": 3}],
            "payment_method": "cash", "amount_paid": price * 3,
        }, headers=auth_headers)
        assert r.status_code in (200, 201)
        sid = r.get_json()["id"]

        resp = client.put(f"/api/sales/{sid}/refund", json={
            "amount": price, "reason": "Customer return"
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert "message" in data or "sale" in data
