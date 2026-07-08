"""
RetailOS - Database Models
Complete SQLAlchemy ORM with all tables
"""

from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, date, timedelta
import random
import json
import secrets

db = SQLAlchemy()

SUBSCRIPTION_PLANS = {
    "beta": {
        "id": "beta",
        "name": "Public Beta",
        "price_monthly": 0,
        "currency": "USD",
        "description": "Free during public beta — full access for early adopters",
        "features": ["Unlimited POS", "Inventory & CRM", "Reports & DSR", "Priority feedback channel"],
    },
    "beta_guest": {
        "id": "beta_guest",
        "name": "Guest Beta",
        "price_monthly": 0,
        "currency": "USD",
        "description": "Isolated guest sandbox with demo data only",
        "features": ["Sample products & customers", "Full POS tour", "No production data", "Email-verified access"],
    },
    "starter": {
        "id": "starter",
        "name": "Starter",
        "price_monthly": 29,
        "currency": "USD",
        "description": "Single-location retail shops getting started",
        "features": ["1 location", "Up to 5 staff", "POS & inventory", "Email support"],
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price_monthly": 79,
        "currency": "USD",
        "description": "Growing retailers that need advanced ops",
        "features": ["Unlimited staff", "Advanced reports", "AI assistant", "Priority support"],
    },
}

DEFAULT_ONBOARDING_STEPS = [
    {"id": "profile", "label": "Complete store profile", "done": False},
    {"id": "products", "label": "Add your first products", "done": False},
    {"id": "pos_sale", "label": "Run a test POS sale", "done": False},
    {"id": "team", "label": "Invite a team member", "done": False},
    {"id": "feedback", "label": "Share beta feedback", "done": False},
]


# ═══════════════════════════════════════
# ACCOUNTS (Multi-tenant: each user has their own retail OS)
# ═══════════════════════════════════════
class Account(db.Model):
    __tablename__ = "accounts"
    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(128), default="My Retail OS")
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    # Subscription & billing
    subscription_plan    = db.Column(db.String(32), default="beta")
    subscription_status  = db.Column(db.String(32), default="trialing")  # trialing|active|past_due|canceled|beta
    stripe_customer_id   = db.Column(db.String(128), nullable=True)
    stripe_subscription_id = db.Column(db.String(128), nullable=True)
    trial_ends_at        = db.Column(db.DateTime, nullable=True)
    beta_enrolled_at     = db.Column(db.DateTime, nullable=True)

    # Business onboarding
    business_type        = db.Column(db.String(64), nullable=True)
    business_phone       = db.Column(db.String(32), nullable=True)
    business_location    = db.Column(db.String(128), nullable=True)
    onboarding_steps     = db.Column(db.Text, nullable=True)  # JSON list
    onboarding_completed = db.Column(db.Boolean, default=False)

    users = db.relationship("User", backref="account", lazy=True)

    def get_onboarding_steps(self):
        if self.onboarding_steps:
            try:
                return json.loads(self.onboarding_steps)
            except (json.JSONDecodeError, TypeError):
                pass
        return [dict(s) for s in DEFAULT_ONBOARDING_STEPS]

    def set_onboarding_steps(self, steps):
        self.onboarding_steps = json.dumps(steps)

    def mark_onboarding_step(self, step_id):
        steps = self.get_onboarding_steps()
        changed = False
        for step in steps:
            if step.get("id") == step_id and not step.get("done"):
                step["done"] = True
                changed = True
        if changed:
            self.set_onboarding_steps(steps)
            if all(s.get("done") for s in steps):
                self.onboarding_completed = True
        return changed

    def subscription_active(self):
        if self.subscription_status in ("active", "beta", "beta_locked"):
            return True
        if self.subscription_status == "trialing":
            if not self.trial_ends_at:
                return True
            return datetime.utcnow() <= self.trial_ends_at
        return False

    def to_dict(self):
        from merchant_customer_id import get_merchant_customer_id
        plan = SUBSCRIPTION_PLANS.get(self.subscription_plan, SUBSCRIPTION_PLANS["beta"])
        steps = self.get_onboarding_steps()
        return {
            "id": self.id,
            "name": self.name,
            "merchant_customer_id": get_merchant_customer_id(self.id),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "subscription_plan": self.subscription_plan,
            "subscription_status": self.subscription_status,
            "subscription_active": self.subscription_active(),
            "is_guest": self.subscription_plan in ("beta_guest", "beta"),
            "subscription_locked": self.subscription_plan in ("beta", "beta_guest")
                or self.subscription_status == "beta_locked",
            "max_staff": 10,
            "trial_ends_at": self.trial_ends_at.isoformat() if self.trial_ends_at else None,
            "beta_enrolled_at": self.beta_enrolled_at.isoformat() if self.beta_enrolled_at else None,
            "plan_details": plan,
            "business_type": self.business_type,
            "business_phone": self.business_phone,
            "business_location": self.business_location,
            "onboarding_steps": steps,
            "onboarding_completed": self.onboarding_completed,
            "onboarding_progress": round(
                100 * sum(1 for s in steps if s.get("done")) / max(len(steps), 1)
            ),
        }


# ═══════════════════════════════════════
# USERS & AUTH
# ═══════════════════════════════════════
class User(UserMixin, db.Model):
    __tablename__ = "users"
    id         = db.Column(db.Integer, primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)
    username   = db.Column(db.String(64), unique=True, nullable=False)
    email      = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    full_name  = db.Column(db.String(128))
    role       = db.Column(db.String(20), default="sales_staff")  # superadmin|owner|manager|sales_staff
    is_active  = db.Column(db.Boolean, default=True)
    must_change_password = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    failed_login_count = db.Column(db.Integer, default=0)
    locked_until       = db.Column(db.DateTime, nullable=True)
    security_epoch     = db.Column(db.Integer, default=0, nullable=False, server_default="0")

    def is_locked(self):
        from datetime import datetime
        if self.locked_until and datetime.utcnow() < self.locked_until:
            return True
        if self.locked_until and datetime.utcnow() >= self.locked_until:
            self.locked_until = None
            self.failed_login_count = 0
        return False

    def record_failed_login(self):
        from datetime import datetime, timedelta
        self.failed_login_count = (self.failed_login_count or 0) + 1
        if self.failed_login_count >= 5:
            self.locked_until = datetime.utcnow() + timedelta(minutes=30)

    def record_successful_login(self):
        self.failed_login_count = 0
        self.locked_until = None

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    email_verified = db.Column(db.Boolean, default=False)
    google_id      = db.Column(db.String(128), unique=True, nullable=True)

    def to_dict(self):
        data = {
            "id": self.id,
            "account_id": self.account_id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "is_active": self.is_active,
            "must_change_password": self.must_change_password,
            "email_verified": self.email_verified,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
        }
        if self.account:
            data["account"] = self.account.to_dict()
        return data


# ═══════════════════════════════════════
# AUTH TOKENS (password reset, email verify, refresh)
# ═══════════════════════════════════════
class AuthToken(db.Model):
    __tablename__ = "auth_tokens"
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    token_hash = db.Column(db.String(128), nullable=False, unique=True)
    purpose    = db.Column(db.String(32), nullable=False)  # refresh|reset_password|verify_email
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at    = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", backref="auth_tokens")

    @staticmethod
    def generate_plaintext():
        return secrets.token_urlsafe(32)

    @staticmethod
    def hash_token(plaintext):
        import hashlib
        return hashlib.sha256(plaintext.encode()).hexdigest()

    def is_valid(self):
        return not self.used_at and datetime.utcnow() <= self.expires_at

    @classmethod
    def create_for_user(cls, user, purpose, hours=24):
        plaintext = cls.generate_plaintext()
        record = cls(
            user_id=user.id,
            token_hash=cls.hash_token(plaintext),
            purpose=purpose,
            expires_at=datetime.utcnow() + timedelta(hours=hours),
        )
        db.session.add(record)
        return plaintext, record


# ═══════════════════════════════════════
# BETA LEADS & BUSINESS FEEDBACK
# ═══════════════════════════════════════
class BetaLead(db.Model):
    __tablename__ = "beta_leads"
    id            = db.Column(db.Integer, primary_key=True)
    business_name = db.Column(db.String(128), nullable=False)
    contact_name  = db.Column(db.String(128), nullable=False)
    email         = db.Column(db.String(120), nullable=False)
    phone         = db.Column(db.String(32), nullable=True)
    business_type = db.Column(db.String(64), nullable=True)
    location      = db.Column(db.String(128), nullable=True)
    message       = db.Column(db.Text, nullable=True)
    status                 = db.Column(db.String(32), default="new")  # new|contacted|onboarded|declined
    enrollment_token_hash  = db.Column(db.String(128), nullable=True)
    enrollment_expires_at  = db.Column(db.DateTime, nullable=True)
    enrollment_used_at     = db.Column(db.DateTime, nullable=True)
    created_at             = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "business_name": self.business_name,
            "contact_name": self.contact_name,
            "email": self.email,
            "phone": self.phone,
            "business_type": self.business_type,
            "location": self.location,
            "message": self.message,
            "status": self.status,
            "has_enrollment": bool(
                self.enrollment_token_hash
                and not self.enrollment_used_at
                and self.enrollment_expires_at
                and datetime.utcnow() <= self.enrollment_expires_at
            ),
            "enrollment_used_at": self.enrollment_used_at.isoformat() if self.enrollment_used_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class BusinessFeedback(db.Model):
    __tablename__ = "business_feedback"
    id         = db.Column(db.Integer, primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    category   = db.Column(db.String(64), default="general")
    rating     = db.Column(db.Integer, nullable=True)
    message    = db.Column(db.Text, nullable=False)
    page       = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "account_id": self.account_id,
            "user_id": self.user_id,
            "category": self.category,
            "rating": self.rating,
            "message": self.message,
            "page": self.page,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ═══════════════════════════════════════
# CATEGORIES
# ═══════════════════════════════════════
class Category(db.Model):
    __tablename__ = "categories"
    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(64), unique=True, nullable=False)
    description = db.Column(db.Text)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    products    = db.relationship("Product", backref="category", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "product_count": len(self.products),
        }


# ═══════════════════════════════════════
# PRODUCTS
# ═══════════════════════════════════════
class Product(db.Model):
    __tablename__ = "products"
    __table_args__ = (
        db.UniqueConstraint("account_id", "sku", name="uq_products_account_sku"),
        db.UniqueConstraint("account_id", "barcode", name="uq_products_account_barcode"),
    )
    id            = db.Column(db.Integer, primary_key=True)
    account_id    = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)
    name          = db.Column(db.String(200), nullable=False)
    sku           = db.Column(db.String(64))
    barcode       = db.Column(db.String(64))
    category_id   = db.Column(db.Integer, db.ForeignKey("categories.id"))
    cost_price    = db.Column(db.Numeric(12, 2), default=0)
    selling_price = db.Column(db.Numeric(12, 2), default=0)
    stock_qty     = db.Column(db.Integer, default=0)
    reorder_level = db.Column(db.Integer, default=10)
    unit          = db.Column(db.String(20), default="pcs")
    description   = db.Column(db.Text)
    image_url     = db.Column(db.String(500))
    status        = db.Column(db.String(20), default="active")  # active|inactive
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at    = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    has_variants  = db.Column(db.Boolean, default=False)

    sale_items    = db.relationship("SaleItem", backref="product", lazy=True)
    purchase_items = db.relationship("PurchaseItem", backref="product", lazy=True)
    inventory_movements = db.relationship("InventoryMovement", backref="product", lazy=True)
    variants      = db.relationship("ProductVariant", back_populates="product", lazy=True, cascade="all, delete-orphan")

    @property
    def profit_margin(self):
        if self.cost_price and float(self.cost_price) > 0:
            return round(((float(self.selling_price) - float(self.cost_price)) / float(self.cost_price)) * 100, 2)
        return 0

    @property
    def is_low_stock(self):
        return self.stock_qty <= self.reorder_level

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "sku": self.sku,
            "barcode": self.barcode,
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "cost_price": float(self.cost_price) if self.cost_price else 0,
            "selling_price": float(self.selling_price) if self.selling_price else 0,
            "stock_qty": self.stock_qty,
            "reorder_level": self.reorder_level,
            "unit": self.unit,
            "description": self.description,
            "image_url": self.image_url,
            "status": self.status,
            "profit_margin": self.profit_margin,
            "is_low_stock": self.is_low_stock,
            "has_variants": self.has_variants,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ═══════════════════════════════════════
# CUSTOMERS
# ═══════════════════════════════════════
MEMBERSHIP_TIERS = {
    "bronze":   {"min_spent": 0,      "label": "Bronze",   "color": "#cd7f32", "discount_pct": 0,   "points_multiplier": 1.0, "points_per_rupee": 0.1,  "rupees_per_point": 1.0},
    "silver":   {"min_spent": 5000,   "label": "Silver",   "color": "#C0C0C0", "discount_pct": 3,   "points_multiplier": 1.5, "points_per_rupee": 0.15, "rupees_per_point": 1.0},
    "gold":     {"min_spent": 15000,  "label": "Gold",     "color": "#D4AF37", "discount_pct": 5,   "points_multiplier": 2.0, "points_per_rupee": 0.2,  "rupees_per_point": 1.0},
    "platinum": {"min_spent": 50000,  "label": "Platinum", "color": "#E5E4E2", "discount_pct": 10,  "points_multiplier": 3.0, "points_per_rupee": 0.3,  "rupees_per_point": 1.0},
}

def get_tier(total_spent):
    tiers = sorted(MEMBERSHIP_TIERS.items(), key=lambda x: x[1]["min_spent"], reverse=True)
    for key, info in tiers:
        if float(total_spent or 0) >= info["min_spent"]:
            return key
    return "bronze"

class Customer(db.Model):
    __tablename__ = "customers"
    id              = db.Column(db.Integer, primary_key=True)
    account_id      = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)
    name            = db.Column(db.String(128), nullable=False)
    phone           = db.Column(db.String(20))
    email           = db.Column(db.String(120))
    address         = db.Column(db.Text)
    loyalty_points  = db.Column(db.Integer, default=0)
    total_spent     = db.Column(db.Numeric(14, 2), default=0)
    visit_count     = db.Column(db.Integer, default=0)
    is_vip          = db.Column(db.Boolean, default=False)
    membership_tier = db.Column(db.String(20), default="bronze")
    member_since    = db.Column(db.DateTime, default=datetime.utcnow)
    notes           = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    sales           = db.relationship("Sale", backref="customer", lazy=True)
    point_txns      = db.relationship("PointTransaction", backref="customer", lazy=True)

    def recalculate_tier(self):
        self.membership_tier = get_tier(self.total_spent)
        vip_thresh = 10000
        try:
            from models import Setting
            s = Setting.query.filter_by(key="vip_threshold").first()
            if s: vip_thresh = float(s.value)
        except Exception:
            pass
        self.is_vip = float(self.total_spent or 0) >= vip_thresh

    def to_dict(self):
        tier_info = MEMBERSHIP_TIERS.get(self.membership_tier or "bronze", MEMBERSHIP_TIERS["bronze"])
        spent = float(self.total_spent) if self.total_spent else 0
        tiers_sorted = sorted(MEMBERSHIP_TIERS.items(), key=lambda x: x[1]["min_spent"])
        next_tier = None
        next_min = None
        for key, info in tiers_sorted:
            if info["min_spent"] > spent:
                next_tier = key
                next_min = info["min_spent"]
                break
        return {
            "id": self.id,
            "name": self.name,
            "phone": self.phone,
            "email": self.email,
            "address": self.address,
            "loyalty_points": self.loyalty_points,
            "total_spent": spent,
            "visit_count": self.visit_count,
            "is_vip": self.is_vip,
            "membership_tier": self.membership_tier or "bronze",
            "tier_info": tier_info,
            "next_tier": next_tier,
            "next_tier_min": next_min,
            "next_tier_gap": round(next_min - spent, 2) if next_min else 0,
            "member_since": self.member_since.isoformat() if self.member_since else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ═══════════════════════════════════════
# POINT TRANSACTIONS
# ═══════════════════════════════════════
class PointTransaction(db.Model):
    __tablename__ = "point_transactions"
    id          = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    txn_type    = db.Column(db.String(20))  # earned | redeemed | adjusted | expired
    points      = db.Column(db.Integer, nullable=False)  # positive=earned, negative=redeemed
    balance     = db.Column(db.Integer, default=0)  # balance after transaction
    reference   = db.Column(db.String(64))  # sale invoice or note
    note        = db.Column(db.String(256))
    created_by  = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "txn_type": self.txn_type,
            "points": self.points,
            "balance": self.balance,
            "reference": self.reference,
            "note": self.note,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ═══════════════════════════════════════
# SUPPLIERS
# ═══════════════════════════════════════
class Supplier(db.Model):
    __tablename__ = "suppliers"
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(128), nullable=False)
    contact    = db.Column(db.String(64))
    phone      = db.Column(db.String(20))
    email      = db.Column(db.String(120))
    address    = db.Column(db.Text)
    notes      = db.Column(db.Text)
    pan_number = db.Column(db.String(20))
    tax_number = db.Column(db.String(30))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    purchases  = db.relationship("Purchase", backref="supplier", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "contact": self.contact,
            "phone": self.phone,
            "email": self.email,
            "address": self.address,
            "notes": self.notes,
            "pan_number": self.pan_number,
            "tax_number": self.tax_number,
            "purchase_count": len(self.purchases),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ═══════════════════════════════════════
# INVOICE NUMBER GENERATOR
# ═══════════════════════════════════════
def gen_invoice_number():
    now = datetime.utcnow()
    date_part = now.strftime("%Y%m%d")
    time_part = now.strftime("%H%M%S")
    rand_part = str(random.randint(1000, 9999))
    return f"INV-{date_part}-{time_part}-{rand_part}"


# ═══════════════════════════════════════
# SALES
# ═══════════════════════════════════════
class Sale(db.Model):
    __tablename__ = "sales"
    id              = db.Column(db.Integer, primary_key=True)
    account_id      = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)
    invoice_number  = db.Column(db.String(32), unique=True, nullable=False)
    customer_id     = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=True)
    cashier_id      = db.Column(db.Integer, db.ForeignKey("users.id"))
    subtotal        = db.Column(db.Numeric(14, 2), default=0)
    discount_amount = db.Column(db.Numeric(14, 2), default=0)
    discount_pct    = db.Column(db.Numeric(5, 2), default=0)
    tax_amount      = db.Column(db.Numeric(14, 2), default=0)
    tax_pct         = db.Column(db.Numeric(5, 2), default=0)
    total           = db.Column(db.Numeric(14, 2), default=0)
    amount_paid     = db.Column(db.Numeric(14, 2), default=0)
    change_amount   = db.Column(db.Numeric(14, 2), default=0)
    payment_method  = db.Column(db.String(30), default="cash")
    payment_ref     = db.Column(db.String(64))
    status          = db.Column(db.String(20), default="completed")
    notes           = db.Column(db.Text)
    sale_date       = db.Column(db.DateTime, default=datetime.utcnow)
    refund_amount   = db.Column(db.Numeric(14, 2), default=0)
    refund_reason   = db.Column(db.Text)
    folio_booking_id = db.Column(db.Integer, db.ForeignKey("room_bookings.id"), nullable=True, index=True)

    items    = db.relationship("SaleItem", backref="sale", lazy=True, cascade="all, delete-orphan")
    cashier  = db.relationship("User", foreign_keys=[cashier_id])

    def to_dict(self, include_items=False):
        data = {
            "id": self.id,
            "invoice_number": self.invoice_number,
            "customer_id": self.customer_id,
            "customer_name": self.customer.name if self.customer else "Walk-in",
            "customer_email": self.customer.email if self.customer else None,
            "cashier_id": self.cashier_id,
            "cashier_name": self.cashier.full_name if self.cashier else None,
            "subtotal": float(self.subtotal),
            "discount_amount": float(self.discount_amount),
            "discount_pct": float(self.discount_pct),
            "tax_amount": float(self.tax_amount),
            "tax_pct": float(self.tax_pct),
            "total": float(self.total),
            "amount_paid": float(self.amount_paid),
            "change_amount": float(self.change_amount),
            "payment_method": self.payment_method,
            "payment_ref": self.payment_ref,
            "folio_booking_id": self.folio_booking_id,
            "status": self.status,
            "notes": self.notes,
            "sale_date": self.sale_date.isoformat() if self.sale_date else None,
            "item_count": len(self.items) if hasattr(self, 'items') and self.items is not None else 0,
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
        return data


class SaleItem(db.Model):
    __tablename__ = "sale_items"
    id           = db.Column(db.Integer, primary_key=True)
    sale_id      = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=False)
    product_id   = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    variant_id   = db.Column(db.Integer, db.ForeignKey("product_variants.id"))
    product_name = db.Column(db.String(200))  # snapshot
    sku          = db.Column(db.String(64))
    variant_label= db.Column(db.String(80))   # e.g. "L / Navy Blue" for receipt/history
    qty          = db.Column(db.Integer, nullable=False)
    unit_price   = db.Column(db.Numeric(12, 2), nullable=False)
    cost_price   = db.Column(db.Numeric(12, 2), default=0)
    discount     = db.Column(db.Numeric(12, 2), default=0)
    total        = db.Column(db.Numeric(12, 2), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "variant_id": self.variant_id,
            "product_name": self.product_name,
            "sku": self.sku,
            "variant_label": self.variant_label,
            "qty": self.qty,
            "unit_price": float(self.unit_price),
            "cost_price": float(self.cost_price),
            "discount": float(self.discount),
            "total": float(self.total),
        }


# ═══════════════════════════════════════
# PURCHASES
# ═══════════════════════════════════════
class Purchase(db.Model):
    __tablename__ = "purchases"
    id               = db.Column(db.Integer, primary_key=True)
    account_id       = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)
    ref_number       = db.Column(db.String(32), unique=True, nullable=False)
    supplier_id      = db.Column(db.Integer, db.ForeignKey("suppliers.id"))
    total            = db.Column(db.Numeric(14, 2), default=0)
    status           = db.Column(db.String(20), default="received")
    notes            = db.Column(db.Text)
    purchase_date    = db.Column(db.DateTime, default=datetime.utcnow)
    items            = db.relationship("PurchaseItem", backref="purchase", lazy=True, cascade="all, delete-orphan")

    def to_dict(self, include_items=False):
        data = {
            "id": self.id,
            "ref_number": self.ref_number,
            "supplier_id": self.supplier_id,
            "supplier_name": self.supplier.name if self.supplier else None,
            "total": float(self.total),
            "status": self.status,
            "notes": self.notes,
            "purchase_date": self.purchase_date.isoformat() if self.purchase_date else None,
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
        return data


class PurchaseItem(db.Model):
    __tablename__ = "purchase_items"
    id           = db.Column(db.Integer, primary_key=True)
    purchase_id  = db.Column(db.Integer, db.ForeignKey("purchases.id"), nullable=False)
    product_id   = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    qty          = db.Column(db.Integer, nullable=False)
    unit_cost    = db.Column(db.Numeric(12, 2), nullable=False)
    total        = db.Column(db.Numeric(12, 2), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "product_name": self.product.name if self.product else None,
            "qty": self.qty,
            "unit_cost": float(self.unit_cost),
            "total": float(self.total),
        }


# ═══════════════════════════════════════
# INVENTORY MOVEMENTS
# ═══════════════════════════════════════
class InventoryMovement(db.Model):
    __tablename__ = "inventory_movements"
    id           = db.Column(db.Integer, primary_key=True)
    product_id   = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    variant_id   = db.Column(db.Integer, db.ForeignKey("product_variants.id"))
    movement_type = db.Column(db.String(20))  # sale|purchase|adjustment|return
    qty_before   = db.Column(db.Integer, default=0)
    qty_change   = db.Column(db.Integer, default=0)  # positive=in, negative=out
    qty_after    = db.Column(db.Integer, default=0)
    reference_id = db.Column(db.Integer)
    reference_type = db.Column(db.String(20))  # sale|purchase
    notes        = db.Column(db.Text)
    created_by   = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "variant_id": self.variant_id,
            "product_name": self.product.name if self.product else None,
            "movement_type": self.movement_type,
            "qty_before": self.qty_before,
            "qty_change": self.qty_change,
            "qty_after": self.qty_after,
            "reference_id": self.reference_id,
            "reference_type": self.reference_type,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ═══════════════════════════════════════
# EXPENSES
# ═══════════════════════════════════════
class Expense(db.Model):
    __tablename__ = "expenses"
    id           = db.Column(db.Integer, primary_key=True)
    title        = db.Column(db.String(200), nullable=False)
    category     = db.Column(db.String(64))
    amount       = db.Column(db.Numeric(14, 2), nullable=False)
    payment_method = db.Column(db.String(30), default="cash")
    description  = db.Column(db.Text)
    expense_date = db.Column(db.Date, default=date.today)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    created_by   = db.Column(db.Integer, db.ForeignKey("users.id"))

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "category": self.category,
            "amount": float(self.amount),
            "payment_method": self.payment_method,
            "description": self.description,
            "expense_date": self.expense_date.isoformat() if self.expense_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ═══════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════
# ── DSR: Daily Sales Register ─────────────────────────────────────────────────

class DSREntry(db.Model):
    """Manual daily sales entry for the DSR register."""
    __tablename__ = "dsr_entries"
    id            = db.Column(db.Integer, primary_key=True)
    entry_date    = db.Column(db.Date, nullable=False, default=date.today)
    cash_sales    = db.Column(db.Numeric(14, 2), default=0)   # retail counter cash
    card_sales    = db.Column(db.Numeric(14, 2), default=0)
    online_sales  = db.Column(db.Numeric(14, 2), default=0)   # esewa/khalti/QR
    other_sales   = db.Column(db.Numeric(14, 2), default=0)
    notes         = db.Column(db.Text)
    created_by    = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def total_sales(self):
        return float(self.cash_sales or 0) + float(self.card_sales or 0) + float(self.online_sales or 0) + float(self.other_sales or 0)

    def to_dict(self):
        return {
            "id": self.id,
            "entry_date": self.entry_date.isoformat() if self.entry_date else None,
            "cash_sales":   float(self.cash_sales   or 0),
            "card_sales":   float(self.card_sales   or 0),
            "online_sales": float(self.online_sales or 0),
            "other_sales":  float(self.other_sales  or 0),
            "total_sales":  self.total_sales,
            "notes":        self.notes,
            "created_by":   self.created_by,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
        }


class DSRPurchase(db.Model):
    """Wholesale / stock purchase entry for DSR."""
    __tablename__ = "dsr_purchases"
    id              = db.Column(db.Integer, primary_key=True)
    purchase_date   = db.Column(db.Date, nullable=False, default=date.today)
    supplier_name   = db.Column(db.String(200))
    category        = db.Column(db.String(100))          # saree, accessories, etc.
    amount          = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    payment_method  = db.Column(db.String(30), default="cash")
    invoice_ref     = db.Column(db.String(64))
    notes           = db.Column(db.Text)
    created_by      = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "purchase_date":  self.purchase_date.isoformat() if self.purchase_date else None,
            "supplier_name":  self.supplier_name,
            "category":       self.category,
            "amount":         float(self.amount or 0),
            "payment_method": self.payment_method,
            "invoice_ref":    self.invoice_ref,
            "notes":          self.notes,
            "created_by":     self.created_by,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
        }


class DSRFixedCost(db.Model):
    """Monthly fixed costs: rent, staff salaries, utilities, etc."""
    __tablename__ = "dsr_fixed_costs"
    id          = db.Column(db.Integer, primary_key=True)
    month       = db.Column(db.Integer, nullable=False)   # 1-12
    year        = db.Column(db.Integer, nullable=False)
    name        = db.Column(db.String(200), nullable=False)  # "Room Rent", "Staff Salary"
    category    = db.Column(db.String(64), default="other")  # rent|salary|utility|other
    amount      = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    notes       = db.Column(db.Text)
    created_by  = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":       self.id,
            "month":    self.month,
            "year":     self.year,
            "name":     self.name,
            "category": self.category,
            "amount":   float(self.amount or 0),
            "notes":    self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Payable(db.Model):
    """Month-wise payables — landlord rent, staff salary, utilities with paid/due tracking."""
    __tablename__ = "payables"
    id              = db.Column(db.Integer, primary_key=True)
    month           = db.Column(db.Integer, nullable=False)
    year            = db.Column(db.Integer, nullable=False)
    payee_name      = db.Column(db.String(200), nullable=False)
    category        = db.Column(db.String(64), default="other")  # rent|salary|utility|other
    amount_due      = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    amount_paid     = db.Column(db.Numeric(14, 2), default=0)
    due_date        = db.Column(db.Date)
    paid_date       = db.Column(db.Date)
    payment_method  = db.Column(db.String(30), default="cash")
    status          = db.Column(db.String(20), default="pending")  # pending|partial|paid|overdue
    notes           = db.Column(db.Text)
    created_by      = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def balance_due(self):
        return max(float(self.amount_due or 0) - float(self.amount_paid or 0), 0)

    def refresh_status(self):
        due = float(self.amount_due or 0)
        paid = float(self.amount_paid or 0)
        if due <= 0 or paid >= due:
            self.status = "paid"
        elif paid > 0:
            self.status = "partial"
        elif self.due_date and self.due_date < date.today():
            self.status = "overdue"
        else:
            self.status = "pending"

    def to_dict(self):
        balance = self.balance_due()
        return {
            "id": self.id,
            "month": self.month,
            "year": self.year,
            "payee_name": self.payee_name,
            "category": self.category,
            "amount_due": float(self.amount_due or 0),
            "amount_paid": float(self.amount_paid or 0),
            "balance_due": balance,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "paid_date": self.paid_date.isoformat() if self.paid_date else None,
            "payment_method": self.payment_method,
            "status": self.status,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class MarketplacePost(db.Model):
    """Cross-store product listings — Facebook-style marketplace feed."""
    __tablename__ = "marketplace_posts"
    id           = db.Column(db.Integer, primary_key=True)
    account_id   = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    created_by   = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    title        = db.Column(db.String(200), nullable=False)
    description  = db.Column(db.Text)
    price        = db.Column(db.Numeric(12, 2), default=0)
    image_url    = db.Column(db.String(500))
    product_id   = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=True, index=True)
    bazaar_category = db.Column(db.String(32), nullable=True, index=True)  # grocery|fashion|electronics|…
    listing_type    = db.Column(db.String(16), default="product")  # product|stay
    stay_meta_json  = db.Column(db.Text)  # JSON metadata for stay listings
    extra_images    = db.Column(db.Text)  # JSON array of additional image URLs
    visibility   = db.Column(db.String(20), default="public")  # public|private|draft
    status       = db.Column(db.String(20), default="active")   # active|sold|archived
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at   = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    account = db.relationship("Account", foreign_keys=[account_id])
    author  = db.relationship("User", foreign_keys=[created_by])
    product = db.relationship("Product", foreign_keys=[product_id])

    def to_dict(self):
        store_name = None
        store_location = None
        business_type = None
        store_phone = None
        if self.account:
            store_name = self.account.name
            store_location = self.account.business_location
            business_type = self.account.business_type
            store_phone = self.account.business_phone
        author_name = None
        if self.author:
            author_name = self.author.full_name or self.author.username
        extra = []
        if self.extra_images:
            try:
                extra = json.loads(self.extra_images)
            except (json.JSONDecodeError, TypeError):
                extra = []
        stay_meta = {}
        if self.stay_meta_json:
            try:
                stay_meta = json.loads(self.stay_meta_json)
            except (json.JSONDecodeError, TypeError):
                stay_meta = {}
        images = [u for u in ([self.image_url] + list(extra)) if u]
        return {
            "id": self.id,
            "account_id": self.account_id,
            "store_name": store_name or "Store",
            "store_location": store_location,
            "store_phone": store_phone,
            "business_type": business_type,
            "author_name": author_name,
            "title": self.title,
            "description": self.description,
            "price": float(self.price or 0),
            "image_url": self.image_url,
            "images": images,
            "extra_images": extra,
            "product_id": self.product_id,
            "bazaar_category": self.bazaar_category,
            "listing_type": self.listing_type or "product",
            "stay_meta": stay_meta,
            "category_name": self.product.category.name if self.product and self.product.category else None,
            "visibility": self.visibility,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "is_mine": False,
        }


class MarketplaceLike(db.Model):
    """Like / save on a marketplace listing."""
    __tablename__ = "marketplace_likes"
    id         = db.Column(db.Integer, primary_key=True)
    post_id    = db.Column(db.Integer, db.ForeignKey("marketplace_posts.id"), nullable=False, index=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    account_id = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    post = db.relationship("MarketplacePost", foreign_keys=[post_id])
    user = db.relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        db.UniqueConstraint("post_id", "user_id", name="uq_marketplace_like_post_user"),
    )


class MarketplaceOrder(db.Model):
    """Cross-store order placed on a marketplace listing."""
    __tablename__ = "marketplace_orders"
    id                 = db.Column(db.Integer, primary_key=True)
    order_number       = db.Column(db.String(32), unique=True, nullable=False, index=True)
    post_id            = db.Column(db.Integer, db.ForeignKey("marketplace_posts.id"), nullable=False, index=True)
    buyer_account_id   = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    buyer_user_id      = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    seller_account_id  = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    quantity           = db.Column(db.Integer, default=1)
    unit_price         = db.Column(db.Numeric(12, 2), default=0)
    total_amount       = db.Column(db.Numeric(12, 2), default=0)
    message            = db.Column(db.Text)
    delivery_address   = db.Column(db.Text)
    delivery_phone     = db.Column(db.String(32))
    guest_name         = db.Column(db.String(120))
    guest_email        = db.Column(db.String(200))
    payment_method     = db.Column(db.String(20), default="cod")  # cod | online
    is_guest           = db.Column(db.Boolean, default=False)
    status             = db.Column(db.String(20), default="pending")
    # pending → accepted → packed → dispatched → delivered | rejected | cancelled
    delivery_order_id  = db.Column(db.Integer, db.ForeignKey("delivery_orders.id"), nullable=True)
    messenger_thread_id = db.Column(db.Integer, db.ForeignKey("messenger_threads.id"), nullable=True)
    shipping_carrier   = db.Column(db.String(64))
    tracking_number    = db.Column(db.String(128))
    shipping_notes     = db.Column(db.Text)
    created_at         = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at         = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    accepted_at        = db.Column(db.DateTime)
    delivered_at       = db.Column(db.DateTime)

    post    = db.relationship("MarketplacePost", foreign_keys=[post_id])
    buyer   = db.relationship("Account", foreign_keys=[buyer_account_id])
    seller  = db.relationship("Account", foreign_keys=[seller_account_id])
    buyer_user = db.relationship("User", foreign_keys=[buyer_user_id])
    delivery = db.relationship("DeliveryOrder", foreign_keys=[delivery_order_id])

    def to_dict(self, include_post=False):
        buyer_name = self.guest_name or (self.buyer.name if self.buyer else "Buyer")
        seller_name = self.seller.name if self.seller else "Store"
        post_title = self.post.title if self.post else None
        author = None
        if self.buyer_user:
            author = self.buyer_user.full_name or self.buyer_user.username
        d = {
            "id": self.id,
            "order_number": self.order_number,
            "post_id": self.post_id,
            "post_title": post_title,
            "buyer_account_id": self.buyer_account_id,
            "buyer_store_name": buyer_name,
            "buyer_user_name": author,
            "seller_account_id": self.seller_account_id,
            "seller_store_name": seller_name,
            "quantity": self.quantity or 1,
            "unit_price": float(self.unit_price or 0),
            "total_amount": float(self.total_amount or 0),
            "message": self.message,
            "delivery_address": self.delivery_address,
            "delivery_phone": self.delivery_phone,
            "guest_name": self.guest_name,
            "guest_email": self.guest_email,
            "payment_method": self.payment_method or "cod",
            "is_guest": bool(self.is_guest),
            "status": self.status,
            "delivery_order_id": self.delivery_order_id,
            "messenger_thread_id": self.messenger_thread_id,
            "shipping_carrier": self.shipping_carrier,
            "tracking_number": self.tracking_number,
            "shipping_notes": self.shipping_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "accepted_at": self.accepted_at.isoformat() if self.accepted_at else None,
            "delivered_at": self.delivered_at.isoformat() if self.delivered_at else None,
        }
        if include_post and self.post:
            d["post"] = self.post.to_dict()
        return d


class BazaarAd(db.Model):
    """Paid promotional slots on DGC Bazaar — weekly/monthly packages."""
    __tablename__ = "bazaar_ads"
    id                 = db.Column(db.Integer, primary_key=True)
    account_id         = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    created_by         = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    title              = db.Column(db.String(120), nullable=False)
    subtitle           = db.Column(db.String(200))
    link_url           = db.Column(db.String(500))
    image_url          = db.Column(db.String(500))
    extra_images       = db.Column(db.Text)  # JSON array of additional image URLs
    slot_type          = db.Column(db.String(30), nullable=False, default="inline")
    package            = db.Column(db.String(20), nullable=False, default="weekly")
    amount             = db.Column(db.Numeric(12, 2), default=500)
    currency           = db.Column(db.String(8), default="NPR")
    payment_reference  = db.Column(db.String(64), index=True)
    payment_status     = db.Column(db.String(20), default="unpaid")
    payment_note       = db.Column(db.Text)
    status             = db.Column(db.String(30), default="draft")
    starts_at          = db.Column(db.DateTime)
    ends_at            = db.Column(db.DateTime)
    reviewed_by        = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    reviewed_at        = db.Column(db.DateTime)
    reject_reason      = db.Column(db.Text)
    created_at         = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at         = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    account = db.relationship("Account", foreign_keys=[account_id])
    author  = db.relationship("User", foreign_keys=[created_by])
    reviewer = db.relationship("User", foreign_keys=[reviewed_by])

    def all_images(self):
        import json
        urls = []
        if self.image_url:
            urls.append(self.image_url)
        if self.extra_images:
            try:
                extra = json.loads(self.extra_images)
                if isinstance(extra, list):
                    for u in extra:
                        if u and u not in urls:
                            urls.append(u)
            except (TypeError, ValueError):
                pass
        return urls

    def to_dict(self):
        store_name = self.account.name if self.account else "Store"
        author_name = None
        if self.author:
            author_name = self.author.full_name or self.author.username
        images = self.all_images()
        return {
            "id": self.id,
            "account_id": self.account_id,
            "store_name": store_name,
            "author_name": author_name,
            "title": self.title,
            "subtitle": self.subtitle,
            "link_url": self.link_url,
            "image_url": self.image_url,
            "images": images,
            "slot_type": self.slot_type,
            "package": self.package,
            "amount": float(self.amount or 0),
            "currency": self.currency,
            "payment_reference": self.payment_reference,
            "payment_status": self.payment_status,
            "payment_note": self.payment_note,
            "status": self.status,
            "starts_at": self.starts_at.isoformat() if self.starts_at else None,
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
            "reject_reason": self.reject_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Setting(db.Model):
    __tablename__ = "settings"
    id         = db.Column(db.Integer, primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)
    key        = db.Column(db.String(64), nullable=False)
    value      = db.Column(db.Text)
    type       = db.Column(db.String(20), default="string")

    __table_args__ = (
        db.UniqueConstraint("account_id", "key", name="uq_settings_account_key"),
    )

    def to_dict(self):
        return {"key": self.key, "value": self.value, "type": self.type}

    @classmethod
    def get_setting(cls, key, account_id=None, fallback=True):
        query = cls.query.filter_by(key=key)
        if account_id is not None:
            setting = query.filter_by(account_id=account_id).first()
            if setting or not fallback:
                return setting
        return query.filter_by(account_id=None).first()


# ═══════════════════════════════════════
# SEED DATA
# ═══════════════════════════════════════
def seed_default_data():
    """Create default owner account and settings if not exist.

    Passwords come from environment variables — never hardcoded.
    Set ADMIN_INIT_PASSWORD and SUPERADMIN_INIT_PASSWORD in Railway env vars.
    If not set, a secure random password is generated and printed ONCE to logs.
    """
    import os, secrets as _secrets

    def _get_or_generate(env_var, username):
        """Return env var password or generate + log a secure random one."""
        pwd = os.environ.get(env_var)
        if pwd:
            return pwd, False
        generated = _secrets.token_urlsafe(16)
        print(f"\n{'='*60}", flush=True)
        print(f"[SECURITY] No {env_var} set — generated password for '{username}':", flush=True)
        print(f"[SECURITY] {username} password: {generated}", flush=True)
        print(f"[SECURITY] Set {env_var} env var to silence this warning.", flush=True)
        print(f"{'='*60}\n", flush=True)
        return generated, True   # True = must_change_password

    # Default admin user
    if not User.query.filter_by(username="admin").first():
        pwd, must_change = _get_or_generate("ADMIN_INIT_PASSWORD", "admin")
        admin = User(
            username="admin",
            email="admin@example.com",
            full_name="Shop Owner",
            role="owner",
            must_change_password=must_change,
        )
        admin.set_password(pwd)
        db.session.add(admin)

    # Default superadmin user
    if not User.query.filter_by(username="superadmin").first():
        pwd, must_change = _get_or_generate("SUPERADMIN_INIT_PASSWORD", "superadmin")
        superadmin = User(
            username="superadmin",
            email="superadmin@example.com",
            full_name="Super Admin",
            role="superadmin",
            must_change_password=must_change,
        )
        superadmin.set_password(pwd)
        db.session.add(superadmin)

    # Default categories
    default_categories = ["Clothing", "Shoes", "Accessories", "Bags", "Jewelry",
                          "Kids Wear", "Sportswear", "Ethnic Wear"]
    for cat_name in default_categories:
        if not Category.query.filter_by(name=cat_name).first():
            db.session.add(Category(name=cat_name))

    # Default settings
    defaults = {
        "shop_name": "Your Store",
        "shop_address": "Your Shop Address",
        "shop_phone": "+977-XXXXXXXXXX",
        "shop_email": "info@example.com",
        "currency": "Rs.",
        "currency_code": "NPR",
        "tax_rate": "13",
        "receipt_footer": "Thank you for shopping at Your Store!\nThank you for your business",
        "loyalty_points_rate": "10",       # Rs. 10 = 1 point
        "points_redemption_rate": "1",     # 1 point = Rs. 1 discount
        "vip_threshold": "10000",          # Rs. 10000 total spend = VIP
        "low_stock_threshold": "10",
        "membership_enabled": "true",
    }
    for k, v in defaults.items():
        if not Setting.query.filter_by(key=k).first():
            db.session.add(Setting(key=k, value=v))

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Seed error: {e}")


# ═══════════════════════════════════════
# CASHIER SESSION
# ═══════════════════════════════════════
class CashierSession(db.Model):
    """Tracks cashier till open/close with cash float reconciliation."""
    __tablename__ = "cashier_sessions"
    id           = db.Column(db.Integer, primary_key=True)
    cashier_id   = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    opened_at    = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    closed_at    = db.Column(db.DateTime)
    opening_cash = db.Column(db.Numeric(14, 2), default=0)
    closing_cash = db.Column(db.Numeric(14, 2))
    notes        = db.Column(db.Text)
    status       = db.Column(db.String(16), default="open")  # open | closed

    cashier = db.relationship("User", foreign_keys=[cashier_id])

    def to_dict(self):
        return {
            "id":           self.id,
            "cashier_id":   self.cashier_id,
            "cashier_name": self.cashier.full_name if self.cashier else None,
            "opened_at":    self.opened_at.isoformat() if self.opened_at else None,
            "closed_at":    self.closed_at.isoformat() if self.closed_at else None,
            "opening_cash": float(self.opening_cash or 0),
            "closing_cash": float(self.closing_cash) if self.closing_cash is not None else None,
            "notes":        self.notes,
            "status":       self.status,
        }


# ═══════════════════════════════════════
# PRODUCT VARIANTS
# ═══════════════════════════════════════
class ProductVariant(db.Model):
    """Size/colour variants for a parent product (fashion retail)."""
    __tablename__ = "product_variants"
    __table_args__ = (
        db.UniqueConstraint("account_id", "sku", name="uq_product_variants_account_sku"),
        db.UniqueConstraint("account_id", "barcode", name="uq_product_variants_account_barcode"),
    )
    id            = db.Column(db.Integer, primary_key=True)
    product_id    = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    account_id    = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)
    size          = db.Column(db.String(20))      # S, M, L, XL, 28, 30 …
    color         = db.Column(db.String(50))      # Red, Black …
    sku           = db.Column(db.String(64))
    barcode       = db.Column(db.String(64))
    stock_qty     = db.Column(db.Integer, default=0)
    cost_price    = db.Column(db.Numeric(12, 2))  # None = inherit parent
    selling_price = db.Column(db.Numeric(12, 2))  # None = inherit parent
    is_active     = db.Column(db.Boolean, default=True)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    product       = db.relationship("Product", back_populates="variants")

    def effective_price(self):
        return float(self.selling_price) if self.selling_price is not None else float(self.product.selling_price or 0)

    def effective_cost(self):
        return float(self.cost_price) if self.cost_price is not None else float(self.product.cost_price or 0)

    def to_dict(self):
        return {
            "id":            self.id,
            "product_id":    self.product_id,
            "product_name":  self.product.name if self.product else None,
            "size":          self.size,
            "color":         self.color,
            "sku":           self.sku,
            "barcode":       self.barcode,
            "stock_qty":     self.stock_qty,
            "cost_price":    float(self.cost_price) if self.cost_price is not None else None,
            "selling_price": float(self.selling_price) if self.selling_price is not None else None,
            "effective_price": self.effective_price(),
            "effective_cost":  self.effective_cost(),
            "is_active":     self.is_active,
            "is_low_stock":  self.stock_qty <= (self.product.reorder_level if self.product else 5),
        }


# ═══════════════════════════════════════
# PURCHASE ORDERS
# ═══════════════════════════════════════
class PurchaseOrder(db.Model):
    """Formal purchase order sent to a supplier before stock arrives."""
    __tablename__ = "purchase_orders"
    id            = db.Column(db.Integer, primary_key=True)
    po_number     = db.Column(db.String(20), unique=True, nullable=False)
    supplier_id   = db.Column(db.Integer, db.ForeignKey("suppliers.id"))
    created_by    = db.Column(db.Integer, db.ForeignKey("users.id"))
    status        = db.Column(db.String(20), default="draft")  # draft|sent|partial|received|cancelled
    order_date    = db.Column(db.Date, default=date.today)
    expected_date = db.Column(db.Date)
    received_date = db.Column(db.Date)
    notes         = db.Column(db.Text)
    total_amount  = db.Column(db.Numeric(14, 2), default=0)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    items         = db.relationship("PurchaseOrderItem", backref="purchase_order", lazy=True, cascade="all, delete-orphan")
    supplier      = db.relationship("Supplier", foreign_keys=[supplier_id])
    creator       = db.relationship("User", foreign_keys=[created_by])

    def to_dict(self, include_items=False):
        data = {
            "id":            self.id,
            "po_number":     self.po_number,
            "supplier_id":   self.supplier_id,
            "supplier_name": self.supplier.name if self.supplier else None,
            "created_by":    self.created_by,
            "creator_name":  self.creator.full_name if self.creator else None,
            "status":        self.status,
            "order_date":    self.order_date.isoformat() if self.order_date else None,
            "expected_date": self.expected_date.isoformat() if self.expected_date else None,
            "received_date": self.received_date.isoformat() if self.received_date else None,
            "notes":         self.notes,
            "total_amount":  float(self.total_amount or 0),
            "item_count":    len(self.items),
            "created_at":    self.created_at.isoformat() if self.created_at else None,
        }
        if include_items:
            data["items"] = [i.to_dict() for i in self.items]
        return data


class PurchaseOrderItem(db.Model):
    __tablename__ = "purchase_order_items"
    id            = db.Column(db.Integer, primary_key=True)
    po_id         = db.Column(db.Integer, db.ForeignKey("purchase_orders.id"), nullable=False)
    product_id    = db.Column(db.Integer, db.ForeignKey("products.id"))
    variant_id    = db.Column(db.Integer, db.ForeignKey("product_variants.id"))
    qty_ordered   = db.Column(db.Integer, nullable=False, default=1)
    qty_received  = db.Column(db.Integer, default=0)
    unit_cost     = db.Column(db.Numeric(12, 2), nullable=False)
    product       = db.relationship("Product")
    variant       = db.relationship("ProductVariant")

    def to_dict(self):
        return {
            "id":           self.id,
            "po_id":        self.po_id,
            "product_id":   self.product_id,
            "product_name": self.product.name if self.product else None,
            "variant_id":   self.variant_id,
            "variant_label": (
                f"{self.variant.size or ''} {self.variant.color or ''}".strip()
                if self.variant else None
            ),
            "qty_ordered":  self.qty_ordered,
            "qty_received": self.qty_received,
            "unit_cost":    float(self.unit_cost),
            "line_total":   float(self.unit_cost) * self.qty_ordered,
        }


# ═══════════════════════════════════════
# PROMOTIONS
# ═══════════════════════════════════════
class Promotion(db.Model):
    """Discount promotions applied at POS checkout."""
    __tablename__ = "promotions"
    id            = db.Column(db.Integer, primary_key=True)
    name          = db.Column(db.String(100), nullable=False)
    description   = db.Column(db.Text)
    promo_type    = db.Column(db.String(20), nullable=False)  # pct_off|flat_off|bogo|min_spend
    value         = db.Column(db.Numeric(10, 2), default=0)   # % or flat Rs
    min_purchase  = db.Column(db.Numeric(10, 2), default=0)   # min subtotal to trigger
    buy_qty       = db.Column(db.Integer, default=0)           # for BOGO: buy N
    get_qty       = db.Column(db.Integer, default=0)           # for BOGO: get M free
    code          = db.Column(db.String(20))                   # optional promo code
    applies_to    = db.Column(db.String(20), default="all")    # all|category|product
    category_id   = db.Column(db.Integer, db.ForeignKey("categories.id"))
    product_id    = db.Column(db.Integer, db.ForeignKey("products.id"))
    start_date    = db.Column(db.Date)
    end_date      = db.Column(db.Date)
    max_uses      = db.Column(db.Integer)                      # None = unlimited
    used_count    = db.Column(db.Integer, default=0)
    is_active     = db.Column(db.Boolean, default=True)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    category      = db.relationship("Category")
    product       = db.relationship("Product")

    @property
    def is_valid_today(self):
        today = date.today()
        if self.start_date and today < self.start_date:
            return False
        if self.end_date and today > self.end_date:
            return False
        if self.max_uses and self.used_count >= self.max_uses:
            return False
        return self.is_active

    def to_dict(self):
        return {
            "id":            self.id,
            "name":          self.name,
            "description":   self.description,
            "promo_type":    self.promo_type,
            "value":         float(self.value or 0),
            "min_purchase":  float(self.min_purchase or 0),
            "buy_qty":       self.buy_qty,
            "get_qty":       self.get_qty,
            "code":          self.code,
            "applies_to":    self.applies_to,
            "category_id":   self.category_id,
            "category_name": self.category.name if self.category else None,
            "product_id":    self.product_id,
            "product_name":  self.product.name if self.product else None,
            "start_date":    self.start_date.isoformat() if self.start_date else None,
            "end_date":      self.end_date.isoformat() if self.end_date else None,
            "max_uses":      self.max_uses,
            "used_count":    self.used_count,
            "is_active":     self.is_active,
            "is_valid_today": self.is_valid_today,
        }


# ═══════════════════════════════════════
# AUDIT LOG
# ═══════════════════════════════════════
class AuditLog(db.Model):
    """Immutable record of every significant user action."""
    __tablename__ = "audit_logs"
    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    account_id  = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True, index=True)
    username    = db.Column(db.String(64))          # snapshot — survives user deletion
    action      = db.Column(db.String(64), nullable=False)   # e.g. "sale.create"
    resource    = db.Column(db.String(64))          # e.g. "sale"
    resource_id = db.Column(db.String(32))          # pk of affected row (string for flexibility)
    detail      = db.Column(db.Text)                # JSON or free text (sanitized)
    ip_address  = db.Column(db.String(45))
    created_at  = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def _parsed_detail(self):
        if not self.detail:
            return None
        try:
            return json.loads(self.detail)
        except Exception:
            return self.detail

    def to_dict(self, *, mask_ip=True):
        from audit import mask_ip as _mask_ip
        return {
            "id":          self.id,
            "user_id":     self.user_id,
            "account_id":  self.account_id,
            "username":    self.username,
            "action":      self.action,
            "resource":    self.resource,
            "resource_id": self.resource_id,
            "detail":      self._parsed_detail(),
            "ip_address":  _mask_ip(self.ip_address) if mask_ip else self.ip_address,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
        }


# ═══════════════════════════════════════
# GIFT CARDS
# ═══════════════════════════════════════
import secrets as _secrets

class GiftCard(db.Model):
    """Prepaid gift card — can be sold and redeemed at POS."""
    __tablename__ = "gift_cards"
    id            = db.Column(db.Integer, primary_key=True)
    code          = db.Column(db.String(20), unique=True, nullable=False)
    initial_amount= db.Column(db.Numeric(12, 2), nullable=False)
    balance       = db.Column(db.Numeric(12, 2), nullable=False)
    issued_to     = db.Column(db.String(128))       # customer name/phone
    issued_by     = db.Column(db.Integer, db.ForeignKey("users.id"))
    status        = db.Column(db.String(16), default="active")  # active|used|expired|void
    expires_at    = db.Column(db.Date)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    redeemed_at   = db.Column(db.DateTime)
    notes         = db.Column(db.Text)
    issuer        = db.relationship("User", foreign_keys=[issued_by])

    @staticmethod
    def generate_code():
        """Generates a readable 12-char code like GC-XXXX-XXXX."""
        part = lambda: _secrets.token_hex(2).upper()
        return f"GC-{part()}-{part()}"

    def to_dict(self):
        return {
            "id":             self.id,
            "code":           self.code,
            "initial_amount": float(self.initial_amount),
            "balance":        float(self.balance),
            "issued_to":      self.issued_to,
            "issued_by":      self.issued_by,
            "issuer_name":    self.issuer.full_name if self.issuer else None,
            "status":         self.status,
            "expires_at":     self.expires_at.isoformat() if self.expires_at else None,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
            "redeemed_at":    self.redeemed_at.isoformat() if self.redeemed_at else None,
            "notes":          self.notes,
        }


# ═══════════════════════════════════════
# STAFF TARGETS
# ═══════════════════════════════════════
class StaffTarget(db.Model):
    """Monthly sales target per staff member."""
    __tablename__ = "staff_targets"
    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    month         = db.Column(db.Integer, nullable=False)   # 1-12
    year          = db.Column(db.Integer, nullable=False)
    target_amount = db.Column(db.Numeric(14, 2), nullable=False)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    staff         = db.relationship("User", foreign_keys=[user_id])

    __table_args__ = (db.UniqueConstraint("user_id", "month", "year", name="uq_staff_month_year"),)

    def to_dict(self):
        return {
            "id":            self.id,
            "user_id":       self.user_id,
            "staff_name":    self.staff.full_name if self.staff else None,
            "month":         self.month,
            "year":          self.year,
            "target_amount": float(self.target_amount),
        }


# ═══════════════════════════════════════
# LAYAWAY
# ═══════════════════════════════════════
class Layaway(db.Model):
    """Deposit-based reservation — customer pays in instalments, picks up on full payment."""
    __tablename__ = "layaways"
    id              = db.Column(db.Integer, primary_key=True)
    layaway_number  = db.Column(db.String(32), unique=True, nullable=False)
    customer_id     = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=True)
    customer_name   = db.Column(db.String(128))          # snapshot for walk-in
    customer_phone  = db.Column(db.String(32))
    created_by      = db.Column(db.Integer, db.ForeignKey("users.id"))
    total_amount    = db.Column(db.Numeric(14, 2), nullable=False)
    deposit_amount  = db.Column(db.Numeric(14, 2), default=0)
    paid_amount     = db.Column(db.Numeric(14, 2), default=0)
    balance_due     = db.Column(db.Numeric(14, 2), nullable=False)
    status          = db.Column(db.String(20), default="active")  # active|completed|cancelled|forfeited
    due_date        = db.Column(db.Date)
    notes           = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at    = db.Column(db.DateTime)

    items           = db.relationship("LayawayItem",    backref="layaway", lazy=True, cascade="all, delete-orphan")
    payments        = db.relationship("LayawayPayment", backref="layaway", lazy=True, cascade="all, delete-orphan")
    customer        = db.relationship("Customer", foreign_keys=[customer_id])
    creator         = db.relationship("User",     foreign_keys=[created_by])

    def to_dict(self, include_items=False, include_payments=False):
        d = {
            "id":             self.id,
            "layaway_number": self.layaway_number,
            "customer_id":    self.customer_id,
            "customer_name":  self.customer.name if self.customer else self.customer_name or "Walk-in",
            "customer_phone": self.customer_phone,
            "created_by":     self.created_by,
            "creator_name":   self.creator.full_name if self.creator else None,
            "total_amount":   float(self.total_amount),
            "deposit_amount": float(self.deposit_amount),
            "paid_amount":    float(self.paid_amount),
            "balance_due":    float(self.balance_due),
            "status":         self.status,
            "due_date":       self.due_date.isoformat() if self.due_date else None,
            "notes":          self.notes,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
            "completed_at":   self.completed_at.isoformat() if self.completed_at else None,
        }
        if include_items:    d["items"]    = [i.to_dict() for i in self.items]
        if include_payments: d["payments"] = [p.to_dict() for p in self.payments]
        return d


class LayawayItem(db.Model):
    __tablename__ = "layaway_items"
    id           = db.Column(db.Integer, primary_key=True)
    layaway_id   = db.Column(db.Integer, db.ForeignKey("layaways.id"), nullable=False)
    product_id   = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    product_name = db.Column(db.String(200))
    sku          = db.Column(db.String(64))
    qty          = db.Column(db.Integer, nullable=False)
    unit_price   = db.Column(db.Numeric(12, 2), nullable=False)
    total        = db.Column(db.Numeric(12, 2), nullable=False)
    product      = db.relationship("Product", foreign_keys=[product_id])

    def to_dict(self):
        return {
            "id": self.id, "product_id": self.product_id,
            "product_name": self.product_name, "sku": self.sku,
            "qty": self.qty, "unit_price": float(self.unit_price), "total": float(self.total),
        }


class LayawayPayment(db.Model):
    __tablename__ = "layaway_payments"
    id             = db.Column(db.Integer, primary_key=True)
    layaway_id     = db.Column(db.Integer, db.ForeignKey("layaways.id"), nullable=False)
    amount         = db.Column(db.Numeric(12, 2), nullable=False)
    payment_method = db.Column(db.String(30), default="cash")
    received_by    = db.Column(db.Integer, db.ForeignKey("users.id"))
    notes          = db.Column(db.Text)
    paid_at        = db.Column(db.DateTime, default=datetime.utcnow)
    collector      = db.relationship("User", foreign_keys=[received_by])

    def to_dict(self):
        return {
            "id": self.id, "layaway_id": self.layaway_id,
            "amount": float(self.amount), "payment_method": self.payment_method,
            "received_by": self.received_by,
            "collector_name": self.collector.full_name if self.collector else None,
            "notes": self.notes,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
        }


# ═══════════════════════════════════════
# ALTERATIONS / REPAIRS
# ═══════════════════════════════════════
class Alteration(db.Model):
    """Alteration or repair job for a garment."""
    __tablename__ = "alterations"
    id              = db.Column(db.Integer, primary_key=True)
    job_number      = db.Column(db.String(32), unique=True, nullable=False)
    customer_id     = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=True)
    customer_name   = db.Column(db.String(128))
    customer_phone  = db.Column(db.String(32))
    garment_desc    = db.Column(db.String(256), nullable=False)   # e.g. "Blue Kurta – size M"
    work_description= db.Column(db.Text)                          # what needs to be done
    measurements    = db.Column(db.Text)                          # JSON string of measurements
    assigned_to     = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_by      = db.Column(db.Integer, db.ForeignKey("users.id"))
    charge          = db.Column(db.Numeric(10, 2), default=0)
    paid_amount     = db.Column(db.Numeric(10, 2), default=0)
    payment_method  = db.Column(db.String(30), default="cash")
    status          = db.Column(db.String(20), default="received")
    # received → in_progress → ready → delivered → cancelled
    priority        = db.Column(db.String(10), default="normal")  # normal | urgent
    due_date        = db.Column(db.Date)
    notes           = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    delivered_at    = db.Column(db.DateTime)

    customer  = db.relationship("Customer", foreign_keys=[customer_id])
    tailor    = db.relationship("User",     foreign_keys=[assigned_to])
    creator   = db.relationship("User",     foreign_keys=[created_by])

    def to_dict(self):
        return {
            "id":               self.id,
            "job_number":       self.job_number,
            "customer_id":      self.customer_id,
            "customer_name":    self.customer.name if self.customer else self.customer_name or "Walk-in",
            "customer_phone":   self.customer_phone,
            "garment_desc":     self.garment_desc,
            "work_description": self.work_description,
            "measurements":     self.measurements,
            "assigned_to":      self.assigned_to,
            "tailor_name":      self.tailor.full_name if self.tailor else None,
            "created_by":       self.created_by,
            "creator_name":     self.creator.full_name if self.creator else None,
            "charge":           float(self.charge),
            "paid_amount":      float(self.paid_amount),
            "balance":          float(self.charge) - float(self.paid_amount),
            "payment_method":   self.payment_method,
            "status":           self.status,
            "priority":         self.priority,
            "due_date":         self.due_date.isoformat() if self.due_date else None,
            "notes":            self.notes,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
            "updated_at":       self.updated_at.isoformat() if self.updated_at else None,
            "delivered_at":     self.delivered_at.isoformat() if self.delivered_at else None,
        }


# ═══════════════════════════════════════
# DELIVERY ORDERS
# ═══════════════════════════════════════
class DeliveryOrder(db.Model):
    """Customer delivery — items to be dispatched with status tracking."""
    __tablename__ = "delivery_orders"
    id              = db.Column(db.Integer, primary_key=True)
    delivery_number = db.Column(db.String(32), unique=True, nullable=False)
    customer_id     = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=True)
    customer_name   = db.Column(db.String(128))
    customer_phone  = db.Column(db.String(32))
    delivery_address= db.Column(db.Text)
    sale_id         = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=True)
    created_by      = db.Column(db.Integer, db.ForeignKey("users.id"))
    assigned_rider  = db.Column(db.String(128))                   # rider name or ID
    status          = db.Column(db.String(20), default="pending")
    # pending → packed → dispatched → delivered → failed → cancelled
    delivery_charge = db.Column(db.Numeric(10, 2), default=0)
    notes           = db.Column(db.Text)
    scheduled_date  = db.Column(db.Date)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    dispatched_at   = db.Column(db.DateTime)
    delivered_at    = db.Column(db.DateTime)

    items    = db.relationship("DeliveryItem", backref="delivery", lazy=True, cascade="all, delete-orphan")
    customer = db.relationship("Customer", foreign_keys=[customer_id])
    creator  = db.relationship("User",     foreign_keys=[created_by])
    sale     = db.relationship("Sale",     foreign_keys=[sale_id])

    def to_dict(self, include_items=False):
        d = {
            "id":               self.id,
            "delivery_number":  self.delivery_number,
            "customer_id":      self.customer_id,
            "customer_name":    self.customer.name if self.customer else self.customer_name or "—",
            "customer_phone":   self.customer_phone,
            "delivery_address": self.delivery_address,
            "sale_id":          self.sale_id,
            "sale_invoice":     self.sale.invoice_number if self.sale else None,
            "created_by":       self.created_by,
            "creator_name":     self.creator.full_name if self.creator else None,
            "assigned_rider":   self.assigned_rider,
            "status":           self.status,
            "delivery_charge":  float(self.delivery_charge),
            "notes":            self.notes,
            "scheduled_date":   self.scheduled_date.isoformat() if self.scheduled_date else None,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
            "dispatched_at":    self.dispatched_at.isoformat() if self.dispatched_at else None,
            "delivered_at":     self.delivered_at.isoformat() if self.delivered_at else None,
        }
        if include_items:
            d["items"] = [i.to_dict() for i in self.items]
        return d


class DeliveryItem(db.Model):
    __tablename__ = "delivery_items"
    id           = db.Column(db.Integer, primary_key=True)
    delivery_id  = db.Column(db.Integer, db.ForeignKey("delivery_orders.id"), nullable=False)
    product_id   = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=True)
    description  = db.Column(db.String(256), nullable=False)
    qty          = db.Column(db.Integer, default=1)
    product      = db.relationship("Product", foreign_keys=[product_id])

    def to_dict(self):
        return {
            "id": self.id, "delivery_id": self.delivery_id,
            "product_id": self.product_id,
            "description": self.description, "qty": self.qty,
        }


# ═══════════════════════════════════════
# DC MESSENGER — dealer & customer chat
# ═══════════════════════════════════════
class MessengerThread(db.Model):
    __tablename__ = "messenger_threads"
    id               = db.Column(db.Integer, primary_key=True)
    account_id       = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    contact_type     = db.Column(db.String(20), default="customer")  # customer|dealer|external
    contact_id       = db.Column(db.Integer, nullable=True)
    contact_name     = db.Column(db.String(128), nullable=False)
    contact_email    = db.Column(db.String(120))
    contact_phone    = db.Column(db.String(32))
    last_message     = db.Column(db.Text)
    last_message_at  = db.Column(db.DateTime, default=datetime.utcnow)
    unread_store     = db.Column(db.Integer, default=0)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)
    messages         = db.relationship("MessengerMessage", backref="thread", lazy=True, order_by="MessengerMessage.created_at")

    def to_dict(self, include_messages=False):
        d = {
            "id": self.id,
            "account_id": self.account_id,
            "contact_type": self.contact_type,
            "contact_id": self.contact_id,
            "contact_name": self.contact_name,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "last_message": self.last_message,
            "last_message_at": self.last_message_at.isoformat() if self.last_message_at else None,
            "unread_store": self.unread_store or 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_messages:
            d["messages"] = [m.to_dict() for m in self.messages]
        return d


class MessengerMessage(db.Model):
    __tablename__ = "messenger_messages"
    id            = db.Column(db.Integer, primary_key=True)
    thread_id     = db.Column(db.Integer, db.ForeignKey("messenger_threads.id"), nullable=False, index=True)
    account_id    = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False)
    sender_role   = db.Column(db.String(16), default="store")  # store|contact
    message_type  = db.Column(db.String(16), default="text")   # text|file|order
    body          = db.Column(db.Text)
    file_name     = db.Column(db.String(256))
    file_url      = db.Column(db.String(512))
    file_mime     = db.Column(db.String(128))
    file_size     = db.Column(db.Integer)
    order_payload = db.Column(db.Text)
    order_status  = db.Column(db.String(20))  # pending|accepted|rejected|fulfilled
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    read_at       = db.Column(db.DateTime)

    def to_dict(self):
        payload = None
        if self.order_payload:
            if isinstance(self.order_payload, str) and self.order_payload.startswith("E2EE1:"):
                payload = None
            else:
                try:
                    payload = json.loads(self.order_payload)
                except (json.JSONDecodeError, TypeError):
                    payload = {"raw": self.order_payload}
        return {
            "id": self.id,
            "thread_id": self.thread_id,
            "account_id": self.account_id,
            "sender_role": self.sender_role,
            "message_type": self.message_type,
            "body": self.body,
            "file_name": self.file_name,
            "file_url": self.file_url,
            "file_mime": self.file_mime,
            "file_size": self.file_size,
            "order_payload": payload,
            "order_status": self.order_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
        }


class MessengerE2EEBackup(db.Model):
    """PIN-wrapped E2EE master key backup (ciphertext only — server cannot decrypt)."""
    __tablename__ = "messenger_e2ee_backups"
    id           = db.Column(db.Integer, primary_key=True)
    account_id   = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, unique=True, index=True)
    salt         = db.Column(db.String(64), nullable=False)
    wrapped_key  = db.Column(db.Text, nullable=False)
    kdf_version  = db.Column(db.Integer, default=1)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at   = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_wrapped=False):
        d = {
            "has_backup": True,
            "kdf_version": self.kdf_version or 1,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_wrapped:
            d["salt"] = self.salt
            d["wrapped_key"] = self.wrapped_key
        return d


# ═══════════════════════════════════════
# PLATFORM SUPPORT — seller ↔ superadmin chat
# ═══════════════════════════════════════

class SupportThread(db.Model):
    __tablename__ = "support_threads"
    id               = db.Column(db.Integer, primary_key=True)
    account_id       = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, unique=True, index=True)
    store_name       = db.Column(db.String(200), nullable=False)
    owner_name       = db.Column(db.String(120))
    owner_phone      = db.Column(db.String(32))
    owner_email      = db.Column(db.String(120))
    business_type    = db.Column(db.String(64))
    call_enabled     = db.Column(db.Boolean, default=True)
    last_message     = db.Column(db.Text)
    last_message_at  = db.Column(db.DateTime, default=datetime.utcnow)
    unread_seller    = db.Column(db.Integer, default=0)
    unread_platform  = db.Column(db.Integer, default=0)
    status           = db.Column(db.String(20), default="open")  # open|resolved
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)
    messages         = db.relationship(
        "SupportMessage", backref="thread", lazy=True,
        order_by="SupportMessage.created_at",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "account_id": self.account_id,
            "store_name": self.store_name,
            "owner_name": self.owner_name,
            "owner_phone": self.owner_phone,
            "owner_email": self.owner_email,
            "business_type": self.business_type,
            "call_enabled": bool(self.call_enabled),
            "last_message": self.last_message,
            "last_message_at": self.last_message_at.isoformat() if self.last_message_at else None,
            "unread_seller": self.unread_seller or 0,
            "unread_platform": self.unread_platform or 0,
            "status": self.status or "open",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SupportMessage(db.Model):
    __tablename__ = "support_messages"
    id            = db.Column(db.Integer, primary_key=True)
    thread_id     = db.Column(db.Integer, db.ForeignKey("support_threads.id"), nullable=False, index=True)
    account_id    = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    sender_role   = db.Column(db.String(16), default="seller")  # seller|platform
    message_type  = db.Column(db.String(20), default="text")    # text|request|issue|order|shipping
    body          = db.Column(db.Text, nullable=False)
    meta_json     = db.Column(db.Text)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    read_at       = db.Column(db.DateTime)

    def to_dict(self):
        meta = None
        if self.meta_json:
            try:
                meta = json.loads(self.meta_json)
            except (json.JSONDecodeError, TypeError):
                meta = {"raw": self.meta_json}
        return {
            "id": self.id,
            "thread_id": self.thread_id,
            "account_id": self.account_id,
            "sender_role": self.sender_role,
            "message_type": self.message_type,
            "body": self.body,
            "meta": meta,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
        }


# ═══════════════════════════════════════
# HOSPITALITY
# ═══════════════════════════════════════

class HotelProperty(db.Model):
    __tablename__ = "hotel_properties"
    id              = db.Column(db.Integer, primary_key=True)
    account_id      = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    name            = db.Column(db.String(200), nullable=False)
    slug            = db.Column(db.String(80), nullable=False)
    property_type   = db.Column(db.String(32), default="hotel")
    address_line1   = db.Column(db.String(200))
    address_line2   = db.Column(db.String(200))
    city            = db.Column(db.String(80))
    country         = db.Column(db.String(80))
    timezone        = db.Column(db.String(64), default="Asia/Kathmandu")
    currency_code   = db.Column(db.String(8), default="NPR")
    check_in_time   = db.Column(db.String(8), default="14:00")
    check_out_time  = db.Column(db.String(8), default="11:00")
    hero_image_url  = db.Column(db.String(500))
    amenities_json  = db.Column(db.Text)
    is_default      = db.Column(db.Boolean, default=True)
    status          = db.Column(db.String(20), default="active")
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    rooms = db.relationship("HotelRoom", backref="property", lazy=True)

    def get_amenities(self):
        if self.amenities_json:
            try:
                return json.loads(self.amenities_json)
            except (json.JSONDecodeError, TypeError):
                pass
        return []

    def to_dict(self):
        return {
            "id": self.id,
            "account_id": self.account_id,
            "name": self.name,
            "slug": self.slug,
            "property_type": self.property_type,
            "address_line1": self.address_line1,
            "address_line2": self.address_line2,
            "city": self.city,
            "country": self.country,
            "timezone": self.timezone,
            "currency_code": self.currency_code,
            "check_in_time": self.check_in_time,
            "check_out_time": self.check_out_time,
            "hero_image_url": self.hero_image_url,
            "amenities": self.get_amenities(),
            "is_default": self.is_default,
            "status": self.status,
            "room_count": len(self.rooms) if self.rooms is not None else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class HotelRoom(db.Model):
    __tablename__ = "hotel_rooms"
    id                  = db.Column(db.Integer, primary_key=True)
    account_id          = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    property_id         = db.Column(db.Integer, db.ForeignKey("hotel_properties.id"), nullable=False, index=True)
    room_code           = db.Column(db.String(32), nullable=False)
    name                = db.Column(db.String(120), nullable=False)
    room_type           = db.Column(db.String(64))
    max_occupancy       = db.Column(db.Integer, default=2)
    base_rate           = db.Column(db.Numeric(12, 2), default=0)
    housekeeping_status = db.Column(db.String(20), default="clean")
    operational_status  = db.Column(db.String(20), default="available")
    product_id          = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=True)
    marketplace_post_id = db.Column(db.Integer, db.ForeignKey("marketplace_posts.id"), nullable=True)
    images_json         = db.Column(db.Text)
    list_on_bazaar      = db.Column(db.Boolean, default=False)
    bazaar_min_nights   = db.Column(db.Integer, default=1)
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("property_id", "room_code", name="uq_hotel_rooms_property_code"),
    )

    def get_images(self):
        if self.images_json:
            try:
                return json.loads(self.images_json)
            except (json.JSONDecodeError, TypeError):
                pass
        return []

    def to_dict(self, include_property=False):
        data = {
            "id": self.id,
            "account_id": self.account_id,
            "property_id": self.property_id,
            "room_code": self.room_code,
            "name": self.name,
            "room_type": self.room_type,
            "max_occupancy": self.max_occupancy,
            "base_rate": float(self.base_rate or 0),
            "housekeeping_status": self.housekeeping_status,
            "operational_status": self.operational_status,
            "product_id": self.product_id,
            "marketplace_post_id": self.marketplace_post_id,
            "images": self.get_images(),
            "list_on_bazaar": self.list_on_bazaar,
            "bazaar_min_nights": self.bazaar_min_nights,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_property and self.property:
            data["property_name"] = self.property.name
        return data


class RoomBlock(db.Model):
    __tablename__ = "room_blocks"
    id           = db.Column(db.Integer, primary_key=True)
    account_id   = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    room_id      = db.Column(db.Integer, db.ForeignKey("hotel_rooms.id"), nullable=False, index=True)
    start_date   = db.Column(db.Date, nullable=False)
    end_date     = db.Column(db.Date, nullable=False)
    reason       = db.Column(db.String(32), default="maintenance")
    notes        = db.Column(db.Text)
    created_by   = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    room = db.relationship("HotelRoom", backref="blocks")

    def to_dict(self):
        return {
            "id": self.id,
            "room_id": self.room_id,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "reason": self.reason,
            "notes": self.notes,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class RoomBooking(db.Model):
    __tablename__ = "room_bookings"
    id                   = db.Column(db.Integer, primary_key=True)
    account_id           = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    property_id          = db.Column(db.Integer, db.ForeignKey("hotel_properties.id"), nullable=False)
    room_id              = db.Column(db.Integer, db.ForeignKey("hotel_rooms.id"), nullable=False, index=True)
    booking_number       = db.Column(db.String(32), unique=True, nullable=False)
    source               = db.Column(db.String(32), default="direct")
    status               = db.Column(db.String(24), default="confirmed")
    guest_name           = db.Column(db.String(120), nullable=False)
    guest_email          = db.Column(db.String(200))
    guest_phone          = db.Column(db.String(32))
    customer_id          = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=True)
    check_in_date        = db.Column(db.Date, nullable=False)
    check_out_date       = db.Column(db.Date, nullable=False)
    nights               = db.Column(db.Integer, nullable=False)
    adults               = db.Column(db.Integer, default=1)
    children             = db.Column(db.Integer, default=0)
    nightly_rates_json   = db.Column(db.Text)
    subtotal             = db.Column(db.Numeric(14, 2), default=0)
    tax_amount           = db.Column(db.Numeric(14, 2), default=0)
    total_amount         = db.Column(db.Numeric(14, 2), default=0)
    amount_paid          = db.Column(db.Numeric(14, 2), default=0)
    payment_method       = db.Column(db.String(30))
    marketplace_order_id = db.Column(db.Integer, db.ForeignKey("marketplace_orders.id"), nullable=True)
    ota_reference        = db.Column(db.String(64))
    tentative_expires_at = db.Column(db.DateTime, nullable=True)
    notes                = db.Column(db.Text)
    checked_in_at        = db.Column(db.DateTime)
    checked_out_at       = db.Column(db.DateTime)
    cancelled_at         = db.Column(db.DateTime)
    cancellation_reason  = db.Column(db.Text)
    created_at           = db.Column(db.DateTime, default=datetime.utcnow)

    room = db.relationship("HotelRoom", backref="bookings")
    hotel_property = db.relationship("HotelProperty", backref="bookings")
    folio = db.relationship("RoomFolio", backref="booking", uselist=False)

    def to_dict(self, include_room=False):
        data = {
            "id": self.id,
            "account_id": self.account_id,
            "property_id": self.property_id,
            "room_id": self.room_id,
            "booking_number": self.booking_number,
            "source": self.source,
            "status": self.status,
            "guest_name": self.guest_name,
            "guest_email": self.guest_email,
            "guest_phone": self.guest_phone,
            "customer_id": self.customer_id,
            "check_in_date": self.check_in_date.isoformat() if self.check_in_date else None,
            "check_out_date": self.check_out_date.isoformat() if self.check_out_date else None,
            "nights": self.nights,
            "adults": self.adults,
            "children": self.children,
            "subtotal": float(self.subtotal or 0),
            "tax_amount": float(self.tax_amount or 0),
            "total_amount": float(self.total_amount or 0),
            "amount_paid": float(self.amount_paid or 0),
            "payment_method": self.payment_method,
            "marketplace_order_id": self.marketplace_order_id,
            "ota_reference": self.ota_reference,
            "notes": self.notes,
            "checked_in_at": self.checked_in_at.isoformat() if self.checked_in_at else None,
            "checked_out_at": self.checked_out_at.isoformat() if self.checked_out_at else None,
            "cancelled_at": self.cancelled_at.isoformat() if self.cancelled_at else None,
            "cancellation_reason": self.cancellation_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_room and self.room:
            data["room_name"] = self.room.name
            data["room_code"] = self.room.room_code
        if self.hotel_property:
            data["property_name"] = self.hotel_property.name
        return data


class RoomFolio(db.Model):
    __tablename__ = "room_folios"
    id           = db.Column(db.Integer, primary_key=True)
    account_id   = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False)
    booking_id   = db.Column(db.Integer, db.ForeignKey("room_bookings.id"), unique=True)
    status       = db.Column(db.String(20), default="open")
    balance      = db.Column(db.Numeric(14, 2), default=0)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    charges = db.relationship("FolioCharge", backref="folio", lazy=True)

    def to_dict(self, include_charges=False):
        data = {
            "id": self.id,
            "account_id": self.account_id,
            "booking_id": self.booking_id,
            "status": self.status,
            "balance": float(self.balance or 0),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_charges:
            data["charges"] = [c.to_dict() for c in (self.charges or [])]
        return data


class FolioCharge(db.Model):
    __tablename__ = "folio_charges"
    id           = db.Column(db.Integer, primary_key=True)
    folio_id     = db.Column(db.Integer, db.ForeignKey("room_folios.id"), nullable=False)
    charge_type  = db.Column(db.String(32))
    description  = db.Column(db.String(200))
    amount       = db.Column(db.Numeric(12, 2))
    sale_id      = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=True)
    posted_at    = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "folio_id": self.folio_id,
            "charge_type": self.charge_type,
            "description": self.description,
            "amount": float(self.amount or 0),
            "sale_id": self.sale_id,
            "posted_at": self.posted_at.isoformat() if self.posted_at else None,
        }


class RoomRateRule(db.Model):
    __tablename__ = "room_rate_rules"
    id            = db.Column(db.Integer, primary_key=True)
    account_id    = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False)
    room_id       = db.Column(db.Integer, db.ForeignKey("hotel_rooms.id"), nullable=True)
    property_id   = db.Column(db.Integer, db.ForeignKey("hotel_properties.id"), nullable=False)
    name          = db.Column(db.String(80))
    rule_type     = db.Column(db.String(24))
    value         = db.Column(db.Numeric(10, 2))
    days_of_week  = db.Column(db.String(16))
    date_from     = db.Column(db.Date)
    date_to       = db.Column(db.Date)
    flash_label   = db.Column(db.String(40))
    priority      = db.Column(db.Integer, default=100)
    is_active     = db.Column(db.Boolean, default=True)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "account_id": self.account_id,
            "room_id": self.room_id,
            "property_id": self.property_id,
            "name": self.name,
            "rule_type": self.rule_type,
            "value": float(self.value or 0),
            "days_of_week": self.days_of_week,
            "date_from": self.date_from.isoformat() if self.date_from else None,
            "date_to": self.date_to.isoformat() if self.date_to else None,
            "flash_label": self.flash_label,
            "priority": self.priority,
            "is_active": self.is_active,
        }


class GmailConnection(db.Model):
    __tablename__ = "gmail_connections"
    id                = db.Column(db.Integer, primary_key=True)
    account_id        = db.Column(db.Integer, db.ForeignKey("accounts.id"), unique=True)
    connected_email   = db.Column(db.String(200))
    refresh_token_enc = db.Column(db.Text)
    scopes            = db.Column(db.String(200))
    gmail_history_id  = db.Column(db.String(64), nullable=True)
    last_sync_at      = db.Column(db.DateTime)
    status            = db.Column(db.String(20), default="active")
    created_at        = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "account_id": self.account_id,
            "connected_email": self.connected_email,
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "status": self.status,
        }


class InboundBookingEmail(db.Model):
    __tablename__ = "inbound_booking_emails"
    id               = db.Column(db.Integer, primary_key=True)
    account_id       = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False)
    gmail_message_id = db.Column(db.String(128), unique=True)
    from_address     = db.Column(db.String(200))
    subject          = db.Column(db.String(300))
    received_at      = db.Column(db.DateTime)
    parser           = db.Column(db.String(32))
    parse_status     = db.Column(db.String(20), default="pending")
    parsed_json      = db.Column(db.Text)
    booking_id       = db.Column(db.Integer, db.ForeignKey("room_bookings.id"), nullable=True)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        parsed = None
        if self.parsed_json:
            try:
                parsed = json.loads(self.parsed_json)
            except (json.JSONDecodeError, TypeError):
                pass
        return {
            "id": self.id,
            "account_id": self.account_id,
            "from_address": self.from_address,
            "subject": self.subject,
            "received_at": self.received_at.isoformat() if self.received_at else None,
            "parser": self.parser,
            "parse_status": self.parse_status,
            "parsed": parsed,
            "booking_id": self.booking_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PaymentTransaction(db.Model):
    """Pending POS payment session — verified before sale is finalized."""
    __tablename__ = "payment_transactions"
    id           = db.Column(db.Integer, primary_key=True)
    account_id   = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    reference    = db.Column(db.String(64), unique=True, nullable=False, index=True)
    amount       = db.Column(db.Numeric(14, 2), nullable=False)
    currency     = db.Column(db.String(8), default="NPR")
    method       = db.Column(db.String(30), nullable=False)
    status       = db.Column(db.String(20), default="pending")  # pending|completed|failed|expired
    gateway_ref  = db.Column(db.String(128))
    meta         = db.Column(db.Text)
    sale_id      = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=True)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            "id": self.id,
            "reference": self.reference,
            "amount": float(self.amount),
            "currency": self.currency,
            "method": self.method,
            "status": self.status,
            "gateway_ref": self.gateway_ref,
            "sale_id": self.sale_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
