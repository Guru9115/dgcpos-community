"""
RetailOS — Flask Backend
Production-ready retail management API
"""

from flask import Flask, jsonify, request, session, send_from_directory
from flask_cors import CORS
from flask_login import LoginManager, login_required, current_user
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_compress import Compress
from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
import os
import re
from urllib.parse import urlparse
from datetime import timedelta
from config import Config
from models import db, User, seed_default_data, DSREntry, DSRPurchase, DSRFixedCost, Payable
from sqlalchemy import inspect

# Path to the built React frontend
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # ── Sentry error monitoring ────────────────────────────────────────────────
    sentry_dsn = app.config.get("SENTRY_DSN", "")
    if sentry_dsn:
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[FlaskIntegration(), SqlalchemyIntegration()],
            traces_sample_rate=0.1,   # 10% performance tracing
            send_default_pii=False,   # never send PII to Sentry
            environment=os.environ.get("RAILWAY_ENVIRONMENT", "development"),
        )
        print("[Sentry] Error monitoring active", flush=True)

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)

    # Gzip compression — reduces API response size ~70%
    Compress(app)

    # Rate limiter — Redis in production, in-memory for local dev
    redis_url = os.environ.get("REDIS_URL")
    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        storage_uri=redis_url or "memory://",
        default_limits=["500 per hour"],
        strategy="fixed-window",
    )

    # CORS — allow local dev + Cloudflare Pages (dgcpos.com) + Vercel
    allowed = os.environ.get("ALLOWED_ORIGINS", "").split(",")
    allowed = [o.strip() for o in allowed if o.strip()]
    allowed += [
        "http://localhost:5173", "http://localhost:5174",
        "http://localhost:3000", "http://localhost:5000",
        "http://192.168.1.63:5000",
        "https://dgcpos.com", "https://www.dgcpos.com",
        "https://app.dgcpos.com",
        "https://admin.dgcpos.com",
        "https://api.dgcpos.com",
        "https://dgc-retailos-frontend.pages.dev",
        re.compile(r"^https://[a-z0-9-]+\.dgc-retailos-frontend\.pages\.dev$"),
        # Legacy Pages project name (remove after old project deleted)
        "https://dg-retailos-frontend.pages.dev",
        re.compile(r"^https://[a-z0-9-]+\.dg-retailos-frontend\.pages\.dev$"),
        # Capacitor iOS / Android shell (bundled web assets)
        "capacitor://localhost",
        "https://localhost",
        "http://localhost",
    ]
    CORS(app, supports_credentials=True, origins=allowed)

    from v2_proxy import maybe_proxy_v2

    @app.before_request
    def proxy_v2_to_nest():
        return maybe_proxy_v2()

    def _origin_allowed(origin_value):
        for allowed_origin in allowed:
            if isinstance(allowed_origin, str) and origin_value == allowed_origin:
                return True
            if hasattr(allowed_origin, "match") and allowed_origin.match(origin_value):
                return True
        return False

    def _normalize_origin(origin_or_referer):
        if not origin_or_referer:
            return ""
        parsed = urlparse(origin_or_referer)
        if not parsed.scheme or not parsed.netloc:
            return ""
        return f"{parsed.scheme}://{parsed.netloc}"

    @app.before_request
    def enforce_origin_for_cookie_writes():
        # CSRF mitigation for browser-originating writes when session/remember cookies are used.
        if not request.path.startswith("/api/"):
            return None
        if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
            return None

        auth_header = request.headers.get("Authorization", "")
        using_bearer = auth_header.startswith("Bearer ")
        session_cookie = request.cookies.get(app.config.get("SESSION_COOKIE_NAME", "session"))
        remember_cookie = request.cookies.get("remember_token")
        cookie_authenticated = bool(session_cookie or remember_cookie)

        # Only enforce strict browser-origin checks for cookie-authenticated requests.
        # API clients with bearer tokens are not affected.
        if cookie_authenticated and not using_bearer:
            origin = request.headers.get("Origin")
            referer = request.headers.get("Referer")
            browser_origin = _normalize_origin(origin or referer)
            if not browser_origin or not _origin_allowed(browser_origin):
                return jsonify({"error": "Forbidden origin"}), 403
        return None

    @app.after_request
    def apply_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if os.environ.get("RAILWAY_ENVIRONMENT"):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        # Tight CSP for API responses; frontend CSP is handled by frontend hosting.
        if request.path.startswith("/api/"):
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        return response

    migrate = Migrate(app, db)

    login_manager = LoginManager(app)
    login_manager.session_protection = "basic"

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({"error": "Authentication required"}), 401

    # Register blueprints
    from routes.auth        import auth_bp
    from routes.products    import products_bp
    from routes.inventory   import inventory_bp
    from routes.sales       import sales_bp
    from routes.customers   import customers_bp
    from routes.suppliers   import suppliers_bp
    from routes.reports     import reports_bp
    from routes.finance     import finance_bp
    from routes.settings    import settings_bp
    from routes.dashboard   import dashboard_bp
    from routes.dsr         import dsr_bp
    from routes.marketplace import marketplace_bp
    from routes.audit_route          import audit_bp
    from routes.cashier_sessions     import cashier_sessions_bp
    from routes.variants             import variants_bp
    from routes.purchase_orders      import purchase_orders_bp
    from routes.promotions           import promotions_bp
    from routes.returns              import returns_bp
    from routes.layaway              import layaway_bp
    from routes.alterations          import alterations_bp
    from routes.deliveries           import deliveries_bp
    from routes.notifications        import notifications_bp
    from routes.onboarding           import onboarding_bp

    app.register_blueprint(auth_bp,       url_prefix="/api/auth")
    app.register_blueprint(products_bp,   url_prefix="/api/products")
    app.register_blueprint(inventory_bp,  url_prefix="/api/inventory")
    app.register_blueprint(sales_bp,      url_prefix="/api/sales")
    app.register_blueprint(customers_bp,  url_prefix="/api/customers")
    app.register_blueprint(suppliers_bp,  url_prefix="/api/suppliers")
    app.register_blueprint(reports_bp,    url_prefix="/api/reports")
    app.register_blueprint(finance_bp,    url_prefix="/api/finance")
    app.register_blueprint(settings_bp,   url_prefix="/api/settings")
    app.register_blueprint(dashboard_bp,  url_prefix="/api/dashboard")
    app.register_blueprint(dsr_bp,        url_prefix="/api/dsr")
    app.register_blueprint(marketplace_bp, url_prefix="/api/marketplace")
    from routes.license import license_bp
    app.register_blueprint(license_bp,          url_prefix="/api/license")
    app.register_blueprint(audit_bp,            url_prefix="/api/audit")
    app.register_blueprint(cashier_sessions_bp, url_prefix="/api/cashier-sessions")
    app.register_blueprint(variants_bp,         url_prefix="/api/variants")
    app.register_blueprint(purchase_orders_bp,  url_prefix="/api/purchase-orders")
    app.register_blueprint(promotions_bp,       url_prefix="/api/promotions")

    app.register_blueprint(returns_bp,          url_prefix="/api/returns")
    app.register_blueprint(layaway_bp,          url_prefix="/api/layaway")

    app.register_blueprint(alterations_bp,      url_prefix="/api/alterations")
    app.register_blueprint(deliveries_bp,       url_prefix="/api/deliveries")
    app.register_blueprint(notifications_bp,    url_prefix="/api/notifications")
    app.register_blueprint(onboarding_bp,       url_prefix="/api/onboarding")
    from edition import should_mount_enterprise_api
    if should_mount_enterprise_api():
        import sys
        ee_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ee-backend"))
        if ee_root not in sys.path:
            sys.path.append(ee_root)
        from register import register_enterprise_blueprints
        register_enterprise_blueprints(app, limiter)
    from routes.team import team_bp
    app.register_blueprint(team_bp,             url_prefix="/api/team")

    # Apply aggressive rate limiting to auth endpoints
    from routes.auth import auth_bp
    limiter.limit("10 per minute; 50 per hour")(auth_bp)

    from routes.marketplace import public_feed
    limiter.limit("120 per minute")(public_feed)

    from maintenance_gate import check_request_maintenance
    from platform_modules import get_public_platform_status

    @app.before_request
    def _platform_maintenance_gate():
        return check_request_maintenance()

    @app.before_request
    def _edition_api_gate():
        from edition import edition_api_block
        from flask import jsonify

        path = request.path or ""
        blocked = edition_api_block(path)
        if blocked:
            body, status = blocked
            return jsonify(body), status
        return None

    @app.before_request
    def _api_security_gate():
        from security_policy import is_public_api, enforce_authenticated_policy
        from auth_utils import authenticate_bearer_token

        path = request.path or ""
        method = request.method or "GET"
        if not path.startswith("/api/"):
            return None
        if is_public_api(path, method):
            return None

        had_bearer = request.headers.get("Authorization", "").startswith("Bearer ")
        if had_bearer:
            err = authenticate_bearer_token(required=True)
            if err:
                return err

        if current_user.is_authenticated:
            return enforce_authenticated_policy(current_user, path)

        return None

    # ── Public platform status (kill switches for frontends) ─────────────────
    @app.route("/api/platform-status")
    def platform_status_public():
        resp = jsonify(get_public_platform_status())
        resp.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=120"
        return resp

    # ── Native iOS/Android release info (update notifications) ───────────────
    @app.route("/api/mobile-release")
    def mobile_release_public():
        from mobile_release import get_mobile_release
        resp = jsonify(get_mobile_release())
        resp.headers["Cache-Control"] = "public, max-age=300"
        return resp

    # ── Health check ──────────────────────────────────────────────────────────
    @app.route("/api/edition")
    def edition_public():
        from edition import edition_public_payload
        resp = jsonify(edition_public_payload())
        resp.headers["Cache-Control"] = "public, max-age=300"
        return resp

    @app.route("/api/health")
    def health():
        from edition import edition_public_payload
        resp = jsonify({
            "status": "ok",
            "app": "RetailOS",
            "public_beta": app.config.get("PUBLIC_BETA_ENABLED", True),
            **edition_public_payload(),
        })
        resp.headers["Cache-Control"] = "public, max-age=30"
        return resp

    # ── Seed endpoint — DISABLED after first run ──────────────────────────────
    @app.route("/api/seed")
    def seed():
        """One-time seed — permanently disabled once users exist."""
        user_count = User.query.count()
        if user_count > 0:
            # Already seeded — block and log suspicious access
            print(f"[SECURITY] /api/seed called when {user_count} users already exist — blocked", flush=True)
            return jsonify({"error": "Forbidden — system already initialized"}), 403
        try:
            db.create_all()
            _create_indexes()
            seed_default_data()
            return jsonify({"message": f"Seeded — {User.query.count()} users created"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── Serve React frontend (local/LAN only) ──────────────────────────────────
    SERVE_FRONTEND = os.environ.get("SERVE_FRONTEND", "true").lower() == "true"
    DIST = os.path.abspath(FRONTEND_DIST)

    if SERVE_FRONTEND:
        @app.route('/', defaults={'path': ''})
        @app.route('/<path:path>')
        def serve_react(path):
            if path.startswith('api/'):
                return jsonify({"error": "Not found"}), 404
            full = os.path.join(DIST, path)
            if path and os.path.isfile(full):
                return send_from_directory(DIST, path)
            index = os.path.join(DIST, 'index.html')
            if os.path.isfile(index):
                return send_from_directory(DIST, 'index.html')
            return jsonify({"error": "Frontend not built. Run: npm run build"}), 503

    # Ensure uploads directory exists
    os.makedirs(app.config.get('UPLOAD_FOLDER', 'uploads'), exist_ok=True)

    # Create tables, indexes, and seed data
    with app.app_context():
        try:
            db.create_all()
            _run_alembic_upgrades()
            _migrate_columns()
            _validate_required_columns()
            _backfill_bazaar_categories()
            _backfill_bazaar_images()
            _create_indexes()
            seed_default_data()
            try:
                from merchant_customer_id import backfill_all_merchant_customer_ids
                backfill_all_merchant_customer_ids()
            except Exception as e:
                print(f"[MERCHANT-ID] backfill note: {e}", flush=True)
            _sync_pg_sequences(
                "inventory_movements",
                "dsr_entries",
                "dsr_purchases",
                "dsr_fixed_costs",
                "payables",
                "users",
                "staff_targets",
            )
            # Extra direct ensure for the variant_id column (Postgres production safety)
            try:
                from sqlalchemy import text
                if "sqlite" in str(db.engine.url):
                    db.session.execute(text("ALTER TABLE inventory_movements ADD COLUMN variant_id INTEGER"))
                else:
                    db.session.execute(text("ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS variant_id INTEGER"))
                db.session.commit()
            except Exception:
                db.session.rollback()
        except Exception as e:
            print(f"[WARN] DB init error (may be first boot): {e}", flush=True)

    # Auto security audit — log unauthorized / forbidden access to sensitive APIs
    @app.after_request
    def _auto_security_audit(response):
        try:
            if not request.path.startswith('/api/'):
                return response
            if response.status_code not in (401, 403):
                return response
            from audit import log_security_event
            sensitive = (
                '/api/payables', '/api/audit', '/api/admin', '/api/settings',
                '/api/auth/users', '/api/finance', '/api/billing', '/api/seed',
            )
            if not any(request.path.startswith(p) for p in sensitive):
                return response
            action = 'security.access_denied' if response.status_code == 403 else 'security.unauthorized'
            log_security_event(
                action,
                detail={
                    'path': request.path,
                    'method': request.method,
                    'status': response.status_code,
                },
            )
        except Exception:
            pass
        return response

    # Auto-backup every 24 hours (daemon thread — won't block shutdown)
    _start_backup_scheduler(app)

    return app


def _run_alembic_upgrades():
    """Apply Alembic migrations at startup so schema stays in sync across deploys."""
    try:
        base_dir = os.path.dirname(__file__)
        alembic_ini = os.path.join(base_dir, "migrations", "alembic.ini")
        script_location = os.path.join(base_dir, "migrations")

        if not os.path.isfile(alembic_ini):
            print("[ALEMBIC] alembic.ini not found; skipping upgrade", flush=True)
            return

        cfg = AlembicConfig(alembic_ini)
        cfg.set_main_option("script_location", script_location)
        alembic_command.upgrade(cfg, "head")
        print("[ALEMBIC] Upgrade to head applied ✓", flush=True)
    except Exception as e:
        print(f"[ALEMBIC] upgrade note: {e}", flush=True)


def _validate_required_columns():
    """Log whether required tenant columns exist after startup migrations."""
    required = {
        "products": ["account_id"],
        "customers": ["account_id"],
        "sales": ["account_id"],
        "purchases": ["account_id"],
        "settings": ["account_id"],
        "product_variants": ["account_id"],
    }

    try:
        inspector = inspect(db.engine)
        tables = set(inspector.get_table_names())
        missing = []

        for table_name, columns in required.items():
            if table_name not in tables:
                missing.append(table_name)
                continue
            existing_cols = {col["name"] for col in inspector.get_columns(table_name)}
            for col_name in columns:
                if col_name not in existing_cols:
                    missing.append(f"{table_name}.{col_name}")

        dsr_tables = ("dsr_entries", "dsr_purchases", "dsr_fixed_costs")
        missing_dsr = [t for t in dsr_tables if t not in tables]
        missing_payables = "payables" not in tables
        missing_marketplace = "marketplace_posts" not in tables
        missing_mp_commerce = (
            "marketplace_likes" not in tables or "marketplace_orders" not in tables
        )
        if missing:
            print(f"[SCHEMA] Missing required tenant columns: {', '.join(missing)}", flush=True)
        else:
            print("[SCHEMA] Required tenant columns present ✓", flush=True)
        if missing_dsr:
            print(f"[SCHEMA] Missing DSR tables: {', '.join(missing_dsr)} — running create_all", flush=True)
            db.create_all(tables=[DSREntry.__table__, DSRPurchase.__table__, DSRFixedCost.__table__])
            db.session.commit()
        else:
            print("[SCHEMA] DSR Register tables present ✓", flush=True)
        if missing_payables:
            print("[SCHEMA] Missing payables table — running create_all", flush=True)
            from models import Payable
            db.create_all(tables=[Payable.__table__])
            db.session.commit()
        else:
            print("[SCHEMA] Payables table present ✓", flush=True)
        if missing_marketplace:
            print("[SCHEMA] Missing marketplace_posts table — running create_all", flush=True)
            from models import MarketplacePost
            db.create_all(tables=[MarketplacePost.__table__])
            db.session.commit()
        else:
            print("[SCHEMA] Marketplace posts table present ✓", flush=True)
        if missing_mp_commerce:
            print("[SCHEMA] Missing marketplace commerce tables — running create_all", flush=True)
            from models import MarketplaceLike, MarketplaceOrder
            db.create_all(tables=[MarketplaceLike.__table__, MarketplaceOrder.__table__])
            db.session.commit()
        else:
            print("[SCHEMA] Marketplace commerce tables present ✓", flush=True)
        if "marketplace_posts" in tables:
            mp_cols = {col["name"] for col in inspector.get_columns("marketplace_posts")}
            if "product_id" not in mp_cols:
                print("[SCHEMA] Adding marketplace_posts.product_id column", flush=True)
                from models import MarketplacePost
                db.session.execute(db.text(
                    "ALTER TABLE marketplace_posts ADD COLUMN product_id INTEGER REFERENCES products(id)"
                ))
                db.session.commit()
            if "bazaar_category" not in mp_cols:
                print("[SCHEMA] Adding marketplace_posts.bazaar_category column", flush=True)
                db.session.execute(db.text(
                    "ALTER TABLE marketplace_posts ADD COLUMN bazaar_category VARCHAR(32)"
                ))
                db.session.commit()
                _backfill_bazaar_categories()
            if "extra_images" not in mp_cols:
                print("[SCHEMA] Adding marketplace_posts.extra_images column", flush=True)
                db.session.execute(db.text(
                    "ALTER TABLE marketplace_posts ADD COLUMN extra_images TEXT"
                ))
                db.session.commit()
            if "listing_type" not in mp_cols:
                print("[SCHEMA] Adding marketplace_posts.listing_type column", flush=True)
                db.session.execute(db.text(
                    "ALTER TABLE marketplace_posts ADD COLUMN listing_type VARCHAR(16) DEFAULT 'product'"
                ))
                db.session.commit()
            if "stay_meta_json" not in mp_cols:
                print("[SCHEMA] Adding marketplace_posts.stay_meta_json column", flush=True)
                db.session.execute(db.text(
                    "ALTER TABLE marketplace_posts ADD COLUMN stay_meta_json TEXT"
                ))
                db.session.commit()
        if "marketplace_orders" in tables:
            mo_cols = {col["name"] for col in inspector.get_columns("marketplace_orders")}
            for col_sql in (
                "ALTER TABLE marketplace_orders ADD COLUMN guest_name VARCHAR(120)",
                "ALTER TABLE marketplace_orders ADD COLUMN guest_email VARCHAR(200)",
                "ALTER TABLE marketplace_orders ADD COLUMN payment_method VARCHAR(20) DEFAULT 'cod'",
                "ALTER TABLE marketplace_orders ADD COLUMN is_guest BOOLEAN DEFAULT false",
                "ALTER TABLE marketplace_orders ADD COLUMN shipping_carrier VARCHAR(64)",
                "ALTER TABLE marketplace_orders ADD COLUMN tracking_number VARCHAR(128)",
                "ALTER TABLE marketplace_orders ADD COLUMN shipping_notes TEXT",
            ):
                col_name = col_sql.split("ADD COLUMN ")[1].split()[0]
                if col_name not in mo_cols:
                    print(f"[SCHEMA] Adding marketplace_orders.{col_name}", flush=True)
                    db.session.execute(db.text(col_sql))
                    db.session.commit()
        if "support_threads" not in tables:
            print("[SCHEMA] Missing support chat tables — running create_all", flush=True)
            from models import SupportThread, SupportMessage
            db.create_all(tables=[SupportThread.__table__, SupportMessage.__table__])
            db.session.commit()
        else:
            print("[SCHEMA] Support chat tables present ✓", flush=True)
        if "bazaar_ads" not in tables:
            print("[SCHEMA] Missing bazaar_ads table — running create_all", flush=True)
            from models import BazaarAd
            db.create_all(tables=[BazaarAd.__table__])
            db.session.commit()
        else:
            print("[SCHEMA] Bazaar ads table present ✓", flush=True)
            ba_cols = {c["name"] for c in inspector.get_columns("bazaar_ads")}
            if "extra_images" not in ba_cols:
                print("[SCHEMA] Adding bazaar_ads.extra_images", flush=True)
                db.session.execute(db.text("ALTER TABLE bazaar_ads ADD COLUMN extra_images TEXT"))
                db.session.commit()
        if "hotel_properties" not in tables:
            print("[SCHEMA] Missing hospitality tables — running create_all", flush=True)
            from models import (
                HotelProperty, HotelRoom, RoomBlock, RoomBooking,
                RoomFolio, FolioCharge, RoomRateRule,
            )
            db.create_all(tables=[
                HotelProperty.__table__, HotelRoom.__table__, RoomBlock.__table__,
                RoomBooking.__table__, RoomFolio.__table__, FolioCharge.__table__,
                RoomRateRule.__table__,
            ])
            db.session.commit()
        elif "sales" in tables:
            sales_cols = {c["name"] for c in inspector.get_columns("sales")}
            if "folio_booking_id" not in sales_cols:
                print("[SCHEMA] Adding sales.folio_booking_id", flush=True)
                db.session.execute(db.text(
                    "ALTER TABLE sales ADD COLUMN folio_booking_id INTEGER REFERENCES room_bookings(id)"
                ))
                db.session.commit()
        if "gmail_connections" not in tables:
            print("[SCHEMA] Missing Gmail integration tables — running create_all", flush=True)
            from models import GmailConnection, InboundBookingEmail
            db.create_all(tables=[GmailConnection.__table__, InboundBookingEmail.__table__])
            db.session.commit()
        elif "gmail_connections" in tables:
            print("[SCHEMA] Gmail integration tables present ✓", flush=True)
    except Exception as e:
        print(f"[SCHEMA] validation note: {e}", flush=True)


def _backfill_bazaar_categories():
    """Set bazaar_category + placeholder images on legacy marketplace posts."""
    try:
        from models import MarketplacePost, Product
        from bazaar_sync import bazaar_category_for_product, map_to_bazaar_slug, resolve_listing_image
        from sqlalchemy.orm import joinedload

        posts = (
            MarketplacePost.query.options(
                joinedload(MarketplacePost.product).joinedload(Product.category),
                joinedload(MarketplacePost.account),
            )
            .filter(
                MarketplacePost.bazaar_category.is_(None),
                MarketplacePost.status == "active",
            )
            .limit(300)
            .all()
        )
        if not posts:
            return
        for p in posts:
            if p.product:
                p.bazaar_category = bazaar_category_for_product(p.product, p.account)
            else:
                p.bazaar_category = map_to_bazaar_slug(
                    None, p.title, getattr(p.account, "business_type", None) if p.account else None
                )
            if not p.image_url:
                cat = p.product.category.name if p.product and p.product.category else None
                p.image_url = resolve_listing_image(p.title, None, cat)
        db.session.commit()
        print(f"[BAZAAR] Backfilled {len(posts)} listing categories", flush=True)
    except Exception as e:
        db.session.rollback()
        print(f"[BAZAAR] backfill note: {e}", flush=True)


def _backfill_bazaar_images():
    """Replace unrelated Picsum placeholders with name-matched AI demo photos."""
    try:
        from models import MarketplacePost, Product
        from bazaar_sync import resolve_listing_image
        from product_images import should_use_ai_demo
        from sqlalchemy.orm import joinedload

        posts = (
            MarketplacePost.query.options(
                joinedload(MarketplacePost.product).joinedload(Product.category),
            )
            .filter(MarketplacePost.status == "active")
            .limit(500)
            .all()
        )
        updated = 0
        for p in posts:
            cat = None
            if p.product and p.product.category:
                cat = p.product.category.name
            if should_use_ai_demo(p.title, p.image_url):
                p.image_url = resolve_listing_image(p.title, None, cat, force_demo=True)
                updated += 1
            if p.product and should_use_ai_demo(p.product.name, p.product.image_url):
                p.product.image_url = resolve_listing_image(p.product.name, None, cat, force_demo=True)
        if updated:
            db.session.commit()
            print(f"[BAZAAR] Refreshed {updated} listing images (name-matched AI demo)", flush=True)
    except Exception as e:
        db.session.rollback()
        print(f"[BAZAAR] image backfill note: {e}", flush=True)


def _migrate_columns():
    """ADD COLUMN IF NOT EXISTS for every column added after initial schema.
    Safe to call multiple times — Postgres IF NOT EXISTS prevents duplicates.
    SQLite fallback: tries the statement, ignores 'duplicate column' errors.
    """
    is_sqlite = "sqlite" in db.engine.url.drivername

    def safe_alter(sql):
        """Execute ALTER TABLE, silently ignore 'already exists' on SQLite."""
        try:
            db.session.execute(db.text(sql))
            # Commit immediately for DDL statements (especially important on Postgres)
            if not is_sqlite:
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            msg = str(e).lower()
            if "duplicate column" in msg or "already exists" in msg:
                pass  # column already exists — safe to ignore
            else:
                print(f"[MIGRATE] note: {e}", flush=True)

    # SQLite does not support IF NOT EXISTS in ALTER TABLE — use bare form
    if is_sqlite:
        safe_alter("ALTER TABLE products ADD COLUMN has_variants BOOLEAN DEFAULT 0")
        safe_alter("ALTER TABLE products ADD COLUMN account_id INTEGER")
        safe_alter("ALTER TABLE customers ADD COLUMN account_id INTEGER")
        safe_alter("ALTER TABLE sales ADD COLUMN account_id INTEGER")
        safe_alter("ALTER TABLE purchases ADD COLUMN account_id INTEGER")
        safe_alter("ALTER TABLE settings ADD COLUMN account_id INTEGER")
        safe_alter("ALTER TABLE product_variants ADD COLUMN account_id INTEGER")
        safe_alter("ALTER TABLE users ADD COLUMN account_id INTEGER")
        safe_alter("ALTER TABLE users ADD COLUMN failed_login_count INTEGER DEFAULT 0")
        safe_alter("ALTER TABLE users ADD COLUMN locked_until DATETIME")
        safe_alter("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0")
        safe_alter("ALTER TABLE users ADD COLUMN google_id VARCHAR(128)")
        safe_alter("ALTER TABLE users ADD COLUMN security_epoch INTEGER DEFAULT 0")
        safe_alter("ALTER TABLE beta_leads ADD COLUMN enrollment_token_hash VARCHAR(128)")
        safe_alter("ALTER TABLE beta_leads ADD COLUMN enrollment_expires_at DATETIME")
        safe_alter("ALTER TABLE beta_leads ADD COLUMN enrollment_used_at DATETIME")
        safe_alter("ALTER TABLE accounts ADD COLUMN subscription_plan VARCHAR(32) DEFAULT 'beta'")
        safe_alter("ALTER TABLE accounts ADD COLUMN subscription_status VARCHAR(32) DEFAULT 'trialing'")
        safe_alter("ALTER TABLE accounts ADD COLUMN stripe_customer_id VARCHAR(128)")
        safe_alter("ALTER TABLE accounts ADD COLUMN stripe_subscription_id VARCHAR(128)")
        safe_alter("ALTER TABLE accounts ADD COLUMN trial_ends_at DATETIME")
        safe_alter("ALTER TABLE accounts ADD COLUMN beta_enrolled_at DATETIME")
        safe_alter("ALTER TABLE accounts ADD COLUMN business_type VARCHAR(64)")
        safe_alter("ALTER TABLE accounts ADD COLUMN business_phone VARCHAR(32)")
        safe_alter("ALTER TABLE accounts ADD COLUMN business_location VARCHAR(128)")
        safe_alter("ALTER TABLE accounts ADD COLUMN onboarding_steps TEXT")
        safe_alter("ALTER TABLE accounts ADD COLUMN onboarding_completed BOOLEAN DEFAULT 0")
        safe_alter("ALTER TABLE sale_items ADD COLUMN variant_id INTEGER")
        safe_alter("ALTER TABLE sale_items ADD COLUMN variant_label VARCHAR(80)")
        safe_alter("ALTER TABLE inventory_movements ADD COLUMN variant_id INTEGER")
        safe_alter("ALTER TABLE audit_logs ADD COLUMN account_id INTEGER")
    else:
        safe_alter("ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT false")
        safe_alter("ALTER TABLE products ADD COLUMN IF NOT EXISTS account_id INTEGER")
        safe_alter("ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_id INTEGER")
        safe_alter("ALTER TABLE sales ADD COLUMN IF NOT EXISTS account_id INTEGER")
        safe_alter("ALTER TABLE purchases ADD COLUMN IF NOT EXISTS account_id INTEGER")
        safe_alter("ALTER TABLE settings ADD COLUMN IF NOT EXISTS account_id INTEGER")
        safe_alter("ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS account_id INTEGER")
        safe_alter("ALTER TABLE users ADD COLUMN IF NOT EXISTS account_id INTEGER")
        safe_alter("ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0")
        safe_alter("ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP")
        safe_alter("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false")
        safe_alter("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128)")
        safe_alter("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_epoch INTEGER DEFAULT 0")
        safe_alter("ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS enrollment_token_hash VARCHAR(128)")
        safe_alter("ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS enrollment_expires_at TIMESTAMP")
        safe_alter("ALTER TABLE beta_leads ADD COLUMN IF NOT EXISTS enrollment_used_at TIMESTAMP")
        safe_alter("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id) WHERE google_id IS NOT NULL")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(32) DEFAULT 'beta'")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(32) DEFAULT 'trialing'")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(128)")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(128)")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS beta_enrolled_at TIMESTAMP")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS business_type VARCHAR(64)")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS business_phone VARCHAR(32)")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS business_location VARCHAR(128)")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS onboarding_steps TEXT")
        safe_alter("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false")
        safe_alter("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS variant_id INTEGER")
        safe_alter("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS variant_label VARCHAR(80)")
        safe_alter("ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS variant_id INTEGER")
        safe_alter("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS account_id INTEGER")

    # Backfill audit_logs.account_id from users (tenant privacy)
    try:
        db.session.execute(db.text("""
            UPDATE audit_logs
            SET account_id = (SELECT account_id FROM users WHERE users.id = audit_logs.user_id)
            WHERE account_id IS NULL AND user_id IS NOT NULL
        """))
        db.session.commit()
    except Exception:
        db.session.rollback()

    # Extra safety: always attempt to ensure the critical variant_id column on inventory_movements
    # (in case previous migration run was on old code)
    try:
        if is_sqlite:
            safe_alter("ALTER TABLE inventory_movements ADD COLUMN variant_id INTEGER")
        else:
            safe_alter("ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS variant_id INTEGER")
    except Exception as e:
        print(f"[MIGRATE] extra inventory variant_id note: {e}", flush=True)

    # Backfill product_variants.account_id from parent product.account_id
    try:
        if is_sqlite:
            safe_alter(
                "UPDATE product_variants "
                "SET account_id = (SELECT products.account_id FROM products WHERE products.id = product_variants.product_id) "
                "WHERE account_id IS NULL"
            )
        else:
            safe_alter(
                "UPDATE product_variants pv "
                "SET account_id = p.account_id "
                "FROM products p "
                "WHERE pv.product_id = p.id AND pv.account_id IS NULL"
            )
    except Exception as e:
        print(f"[MIGRATE] variants account backfill note: {e}", flush=True)

    # Performance indexes for dashboard + products refresh speed
    try:
        if is_sqlite:
            safe_alter("CREATE INDEX IF NOT EXISTS idx_sale_date_status ON sales (sale_date, status)")
            safe_alter("CREATE INDEX IF NOT EXISTS idx_product_name ON products (name)")
            safe_alter("CREATE INDEX IF NOT EXISTS idx_saleitem_sale ON sale_items (sale_id)")
        else:
            safe_alter("CREATE INDEX IF NOT EXISTS idx_sale_date_status ON sales (sale_date, status)")
            safe_alter("CREATE INDEX IF NOT EXISTS idx_product_name ON products (name)")
            safe_alter("CREATE INDEX IF NOT EXISTS idx_saleitem_sale ON sale_items (sale_id)")
    except Exception as e:
        print(f"[MIGRATE] index note: {e}", flush=True)

    # Multi-tenant uniqueness: SKU/barcode should be unique per account, not globally.
    # On Postgres, drop old global unique constraints/indexes and add scoped unique indexes.
    if not is_sqlite:
        try:
            safe_alter("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key")
            safe_alter("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key")
            safe_alter("ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_sku_key")
            safe_alter("ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_barcode_key")
            safe_alter("ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_key")
            safe_alter("ALTER TABLE settings DROP CONSTRAINT IF EXISTS uq_settings_account_key")

            safe_alter("DROP INDEX IF EXISTS products_sku_key")
            safe_alter("DROP INDEX IF EXISTS products_barcode_key")
            safe_alter("DROP INDEX IF EXISTS product_variants_sku_key")
            safe_alter("DROP INDEX IF EXISTS product_variants_barcode_key")
            safe_alter("DROP INDEX IF EXISTS settings_key_key")
            safe_alter("DROP INDEX IF EXISTS uq_settings_account_key")

            safe_alter("CREATE UNIQUE INDEX IF NOT EXISTS uq_products_account_sku ON products (account_id, sku) WHERE sku IS NOT NULL")
            safe_alter("CREATE UNIQUE INDEX IF NOT EXISTS uq_products_account_barcode ON products (account_id, barcode) WHERE barcode IS NOT NULL")
            safe_alter("CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_account_sku ON product_variants (account_id, sku) WHERE sku IS NOT NULL")
            safe_alter("CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_account_barcode ON product_variants (account_id, barcode) WHERE barcode IS NOT NULL")
            safe_alter("CREATE UNIQUE INDEX IF NOT EXISTS uq_settings_account_key ON settings (account_id, key)")
        except Exception as e:
            print(f"[MIGRATE] tenant uniqueness note: {e}", flush=True)

    # Final safety commit (many DDLs already committed above for Postgres)
    try:
        db.session.commit()
        print("[MIGRATE] Column migrations applied ✓", flush=True)
    except Exception as e:
        db.session.rollback()
        print(f"[MIGRATE] commit error: {e}", flush=True)


def _start_backup_scheduler(app):
    """Start a background thread that auto-backups the SQLite DB every 24 hours.
    On PostgreSQL, pg_dump is used instead.  Only runs when a backup dir exists.
    """
    import threading, time, shutil
    from datetime import datetime

    BACKUP_DIR = os.path.join(os.path.dirname(__file__), "backups")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    DB_PATH = os.path.join(os.path.dirname(__file__), "retailos.db")
    MAX_BACKUPS = 14  # keep last 14 days

    def do_backup():
        with app.app_context():
            try:
                is_sqlite = "sqlite" in db.engine.url.drivername
                stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                if is_sqlite and os.path.isfile(DB_PATH):
                    dest = os.path.join(BACKUP_DIR, f"DGRetailOS_auto_{stamp}.db")
                    shutil.copy2(DB_PATH, dest)
                    print(f"[BACKUP] Auto-backup → {dest}", flush=True)
                    # Prune old backups
                    files = sorted(
                        [f for f in os.listdir(BACKUP_DIR) if f.startswith("DGRetailOS_auto_")],
                        reverse=True
                    )
                    for old in files[MAX_BACKUPS:]:
                        os.remove(os.path.join(BACKUP_DIR, old))
                        print(f"[BACKUP] Pruned old backup: {old}", flush=True)
                elif not is_sqlite:
                    # PostgreSQL — use pg_dump if available
                    import subprocess
                    dest = os.path.join(BACKUP_DIR, f"DGRetailOS_auto_{stamp}.sql")
                    db_url = str(db.engine.url)
                    result = subprocess.run(
                        ["pg_dump", "--no-password", "-F", "p", "-f", dest, db_url],
                        capture_output=True, timeout=120
                    )
                    if result.returncode == 0:
                        print(f"[BACKUP] PostgreSQL dump → {dest}", flush=True)
                    else:
                        print(f"[BACKUP] pg_dump failed: {result.stderr.decode()}", flush=True)
            except Exception as e:
                print(f"[BACKUP] Error: {e}", flush=True)

    def scheduler_loop():
        # Wait 60 s on startup so the app finishes booting, then run every 24 h
        time.sleep(60)
        while True:
            do_backup()
            time.sleep(24 * 3600)

    t = threading.Thread(target=scheduler_loop, daemon=True, name="backup-scheduler")
    t.start()
    print("[BACKUP] Nightly auto-backup scheduler started ✓", flush=True)


def _sync_pg_sequence(table):
    """Realign a Postgres serial sequence to MAX(id)+1 after imports/migrations."""
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
        print(f"[DB] {table} sequence synced ✓", flush=True)
        return True
    except Exception as e:
        db.session.rollback()
        print(f"[DB] {table} sequence sync note: {e}", flush=True)
        return False


def _sync_pg_sequences(*tables):
    for table in tables:
        _sync_pg_sequence(table)


def _create_indexes():
    """Create performance-critical database indexes if they don't exist.
    Safe to call multiple times — uses IF NOT EXISTS.
    """
    indexes = [
        # Sale lookups by date (dashboard, reports)
        "CREATE INDEX IF NOT EXISTS idx_sale_date       ON sales(sale_date)",
        "CREATE INDEX IF NOT EXISTS idx_sale_status     ON sales(status)",
        # Sale → customer join (CRM)
        "CREATE INDEX IF NOT EXISTS idx_sale_customer   ON sales(customer_id)",
        # Invoice search
        "CREATE INDEX IF NOT EXISTS idx_sale_invoice    ON sales(invoice_number)",
        # Product barcode scan (POS)
        "CREATE INDEX IF NOT EXISTS idx_product_barcode ON products(barcode)",
        "CREATE INDEX IF NOT EXISTS idx_product_sku     ON products(sku)",
        "CREATE INDEX IF NOT EXISTS idx_product_status  ON products(status)",
        # Inventory movements
        "CREATE INDEX IF NOT EXISTS idx_inv_product     ON inventory_movements(product_id)",
        "CREATE INDEX IF NOT EXISTS idx_inv_date        ON inventory_movements(created_at)",
        # Customer phone lookup
        "CREATE INDEX IF NOT EXISTS idx_customer_phone  ON customers(phone)",
        # Point transactions
        "CREATE INDEX IF NOT EXISTS idx_points_customer ON point_transactions(customer_id)",
        # Audit log
        "CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action)",
        "CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_logs(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_audit_account   ON audit_logs(account_id)",
    ]
    for sql in indexes:
        try:
            db.session.execute(db.text(sql))
        except Exception:
            pass   # Index may already exist or table not yet created
    try:
        db.session.commit()
        print("[DB] Performance indexes verified ✓", flush=True)
    except Exception as e:
        db.session.rollback()
        print(f"[DB] Index creation note: {e}", flush=True)


app = create_app()

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
