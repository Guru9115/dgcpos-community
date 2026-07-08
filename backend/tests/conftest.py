"""
Pytest fixtures shared across all test modules.
Uses an in-memory SQLite DB — never touches the real retailos.db.
"""
import hashlib
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import werkzeug.security as _ws
if not hasattr(hashlib, "scrypt"):
    _orig_generate_password_hash = _ws.generate_password_hash

    def _pbkdf2_password_hash(password, method=None, salt_length=16):
        return _orig_generate_password_hash(
            password, method=method or "pbkdf2:sha256", salt_length=salt_length
        )

    _ws.generate_password_hash = _pbkdf2_password_hash

from sqlalchemy.pool import StaticPool
from app import create_app
from models import db as _db, User, Product, Category, Account
import models as _models

if not hasattr(hashlib, "scrypt"):
    _models.generate_password_hash = _pbkdf2_password_hash
from config import Config


class TestConfig(Config):
    TESTING = True
    # StaticPool keeps the same in-memory connection alive without a persistent
    # app context, which is important: Flask 3.0 stores g on the app context.
    # If we keep a session-scoped app context alive, g._login_user persists
    # between requests (shared across all tests). Using StaticPool + no persistent
    # app context means each test request gets a clean g, while the DB survives.
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"check_same_thread": False},
        "poolclass": StaticPool,
    }
    WTF_CSRF_ENABLED = False
    SECRET_KEY = "test-secret-key-not-for-production"
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_SAMESITE = "Lax"
    RATELIMIT_ENABLED = False
    RATELIMIT_STORAGE_URI = "memory://"
    R2_ENABLED = False


@pytest.fixture(scope="session")
def app():
    """Create Flask app once per test session with an in-memory SQLite DB."""
    application = create_app(TestConfig)
    # Short-lived app context just for setup — does NOT stay alive between tests
    with application.app_context():
        _db.create_all()
        _seed_base_data()
    # Yield the app WITHOUT a persistent app context so each request gets its
    # own fresh g object (prevents g._login_user leaking across tests).
    yield application


def _seed_base_data():
    """Seed the minimum rows needed by every test."""
    account = Account(name="Test Store", business_location="Kathmandu, Nepal")
    _db.session.add(account)
    _db.session.flush()

    owner = User(
        username="owner",
        email="owner@test.local",
        full_name="Owner User",
        role="owner",
        is_active=True,
        account_id=account.id,
    )
    owner.set_password("ownerpass")
    cashier = User(
        username="cashier",
        email="cashier@test.local",
        full_name="Cashier User",
        role="sales_staff",
        is_active=True,
        account_id=account.id,
    )
    cashier.set_password("cashierpass")
    _db.session.add_all([owner, cashier])

    cat = Category(name="Apparel")
    _db.session.add(cat)
    _db.session.flush()

    # Two products with known stock
    p1 = Product(
        name="Blue Shirt",
        sku="BSH-001",
        cost_price=500,
        selling_price=1000,
        stock_qty=50,
        category_id=cat.id,
        status="active",
        account_id=account.id,
    )
    p2 = Product(
        name="Red Dress",
        sku="RDS-001",
        cost_price=800,
        selling_price=1600,
        stock_qty=20,
        category_id=cat.id,
        status="active",
        account_id=account.id,
    )
    _db.session.add_all([p1, p2])
    _db.session.commit()


@pytest.fixture(scope="session")
def client(app):
    return app.test_client()


@pytest.fixture
def anon_client(app):
    """Fresh client with no session/cookies — for testing unauthenticated access."""
    return app.test_client()


@pytest.fixture(scope="session")
def owner_token(client):
    """JWT for the owner user — reused across the whole session."""
    resp = client.post("/api/auth/login", json={"username": "owner", "password": "ownerpass"})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(scope="session")
def cashier_token(client):
    resp = client.post("/api/auth/login", json={"username": "cashier", "password": "cashierpass"})
    assert resp.status_code == 200
    return resp.get_json()["token"]


@pytest.fixture(scope="session")
def auth_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}"}


@pytest.fixture(scope="session")
def cashier_headers(cashier_token):
    return {"Authorization": f"Bearer {cashier_token}"}


# ── helpers ───────────────────────────────────────────────────────────────────

def get_product_ids(app):
    """Return (p1_id, p2_id) from the seeded products."""
    with app.app_context():
        p1 = Product.query.filter_by(sku="BSH-001").first()
        p2 = Product.query.filter_by(sku="RDS-001").first()
        return p1.id, p2.id
