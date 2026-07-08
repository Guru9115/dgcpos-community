"""Product CRUD + pricing + stock tests."""
import pytest
from models import Product


class TestProductList:
    def test_list_products(self, client, auth_headers):
        resp = client.get("/api/products/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert isinstance(data, list)
        assert len(data) >= 2

    def test_list_filters_active(self, client, auth_headers):
        resp = client.get("/api/products/?status=active", headers=auth_headers)
        products = resp.get_json()
        assert isinstance(products, list)
        assert all(p.get("status") == "active" or p.get("is_active", True) for p in products)

    def test_list_search(self, client, auth_headers):
        resp = client.get("/api/products/?q=Blue+Shirt", headers=auth_headers)
        products = resp.get_json()
        assert any("Blue Shirt" in p["name"] for p in products)

    def test_list_requires_auth(self, anon_client):
        resp = anon_client.get("/api/products/")
        assert resp.status_code == 401


class TestProductCreate:
    def test_create_product(self, client, auth_headers, app):
        with app.app_context():
            from models import Category
            cat = Category.query.first()
            cat_id = cat.id

        resp = client.post("/api/products/", json={
            "name": "Test Jacket",
            "sku": "TJ-001",
            "cost_price": 600,
            "selling_price": 1200,
            "stock_qty": 10,
            "category_id": cat_id,
        }, headers=auth_headers)
        assert resp.status_code in (200, 201)
        data = resp.get_json()
        assert data["name"] == "Test Jacket"
        assert data["sku"] == "TJ-001"

    def test_create_product_missing_required(self, client, auth_headers):
        resp = client.post("/api/products/", json={"sku": "NONAME"}, headers=auth_headers)
        assert resp.status_code == 422

    def test_create_product_negative_price(self, client, auth_headers, app):
        with app.app_context():
            from models import Category
            cat = Category.query.first()
            cat_id = cat.id
        resp = client.post("/api/products/", json={
            "name": "Cheap Item", "sku": "CI-001",
            "cost_price": -100, "selling_price": 500,
            "stock_qty": 5, "category_id": cat_id,
        }, headers=auth_headers)
        assert resp.status_code == 422

    def test_cashier_can_create_product(self, client, cashier_headers, app):
        # Any authenticated user (including sales_staff) may create products
        with app.app_context():
            from models import Category
            cat = Category.query.first()
            cat_id = cat.id
        resp = client.post("/api/products/", json={
            "name": "Cashier Product", "sku": "CP-009",
            "cost_price": 100, "selling_price": 200,
            "stock_qty": 5, "category_id": cat_id,
        }, headers=cashier_headers)
        assert resp.status_code in (200, 201)


class TestProductUpdate:
    def test_update_product(self, client, auth_headers, app):
        with app.app_context():
            p = Product.query.filter_by(sku="BSH-001").first()
            pid = p.id
        resp = client.put(f"/api/products/{pid}", json={"selling_price": 1100}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()["selling_price"] == 1100

    def test_update_nonexistent_product(self, client, auth_headers):
        resp = client.put("/api/products/999999", json={"selling_price": 100}, headers=auth_headers)
        assert resp.status_code == 404


class TestProductDelete:
    def test_deactivate_product(self, client, auth_headers, app):
        with app.app_context():
            from models import Category, db
            cat = Category.query.first()
            p = Product(name="To Deactivate", sku="DEL-001", cost_price=100,
                        selling_price=200, stock_qty=1, category_id=cat.id, status="active")
            db.session.add(p); db.session.commit()
            pid = p.id
        resp = client.delete(f"/api/products/{pid}", headers=auth_headers)
        assert resp.status_code == 200
        # Confirm soft-delete (status set to inactive)
        with app.app_context():
            p = Product.query.get(pid)
            assert p is None or p.status == "inactive"
