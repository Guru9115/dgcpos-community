import os
import secrets
from datetime import timedelta

# ── Secret Key ────────────────────────────────────────────────────────────────
# PRODUCTION: must set SECRET_KEY env var — a random 64-char hex string
# Generate one: python3 -c "import secrets; print(secrets.token_hex(32))"
_secret = os.environ.get("SECRET_KEY")
_is_production = os.environ.get("RAILWAY_ENVIRONMENT") is not None

if _is_production and not _secret:
    raise RuntimeError(
        "CRITICAL: SECRET_KEY environment variable is required in production. "
        "Generate one: python3 -c \"import secrets; print(secrets.token_hex(32))\""
    )

# Dev fallback: stable key so JWT works across gunicorn workers.
# (In production always set SECRET_KEY env var.)
DEV_SECRET = "dg-retailos-local-dev-secret-key-CHANGE-IN-PRODUCTION-9f8e7d6c5b4a3210"
SECRET_KEY_VALUE = _secret or DEV_SECRET

class Config:
    SECRET_KEY = SECRET_KEY_VALUE

    # Railway sets DATABASE_URL as postgres:// — SQLAlchemy needs postgresql://
    _db_url = os.environ.get("DATABASE_URL",
              f"sqlite:///{os.path.join(os.path.dirname(__file__), 'retailos.db')}")
    if _db_url.startswith("postgres://"):
        _db_url = _db_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URI = _db_url

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Connection pooling — PostgreSQL only (SQLite uses StaticPool)
    if not _db_url.startswith("sqlite"):
        SQLALCHEMY_ENGINE_OPTIONS = {
            "pool_size":    10,
            "pool_timeout": 30,
            "pool_recycle": 1800,
            "max_overflow": 20,
            "pool_pre_ping": True,
        }
    else:
        SQLALCHEMY_ENGINE_OPTIONS = {
            "pool_pre_ping": True,
            "connect_args": {"check_same_thread": False},
        }

    SESSION_COOKIE_NAME = "__Host-dg_session" if _is_production else "dg_session"
    SESSION_COOKIE_PATH = "/"
    SESSION_COOKIE_HTTPONLY  = True
    SESSION_COOKIE_SAMESITE  = "None"   # cross-origin (dgcpos.com Cloudflare → Railway)
    SESSION_COOKIE_SECURE    = _is_production
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SECURE = _is_production
    REMEMBER_COOKIE_SAMESITE = "None" if _is_production else "Lax"
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    REMEMBER_COOKIE_DURATION = timedelta(days=30)
    REMEMBER_COOKIE_NAME = "__Host-dg_remember" if _is_production else "dg_remember"
    PREFERRED_URL_SCHEME = "https" if _is_production else "http"
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB

    # Cloudflare R2 — reuses BACKUP_AWS_* credentials when R2_* unset
    R2_ENABLED = os.environ.get("R2_ENABLED", "true").lower() == "true"
    R2_BUCKET = os.environ.get("R2_BUCKET", os.environ.get("CDN_S3_BUCKET", "dgcpos-cdn-prod"))
    R2_ENDPOINT = os.environ.get("R2_ENDPOINT", os.environ.get("BACKUP_S3_ENDPOINT", ""))
    R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", os.environ.get("BACKUP_AWS_ACCESS_KEY_ID", ""))
    R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", os.environ.get("BACKUP_AWS_SECRET_ACCESS_KEY", ""))
    R2_PUBLIC_BASE_URL = os.environ.get("R2_PUBLIC_BASE_URL", "")
    R2_PREFIX = os.environ.get("R2_PREFIX", "uploads")
    R2_REGION = os.environ.get("R2_REGION", os.environ.get("BACKUP_AWS_REGION", "auto"))

    # Sentry DSN (optional — set in Railway env vars)
    SENTRY_DSN = os.environ.get("SENTRY_DSN", "")

    # Stripe billing (optional — dev mode when unset)
    STRIPE_SECRET_KEY      = os.environ.get("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET  = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_PRICE_STARTER   = os.environ.get("STRIPE_PRICE_STARTER", "")
    STRIPE_PRICE_PRO       = os.environ.get("STRIPE_PRICE_PRO", "")
    STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
    FRONTEND_URL           = os.environ.get("FRONTEND_URL", "https://app.dgcpos.com")

    # POS payment gateways — Nepal
    ESEWA_MERCHANT_CODE    = os.environ.get("ESEWA_MERCHANT_CODE", "EPAYTEST")
    ESEWA_ENV              = os.environ.get("ESEWA_ENV", "uat")  # uat|prod
    KHALTI_SECRET_KEY      = os.environ.get("KHALTI_SECRET_KEY", "")
    KHALTI_PUBLIC_KEY      = os.environ.get("KHALTI_PUBLIC_KEY", "")
    FONEPAY_MERCHANT_CODE  = os.environ.get("FONEPAY_MERCHANT_CODE", "")

    # POS payment gateways — International
    PAYPAL_CLIENT_ID       = os.environ.get("PAYPAL_CLIENT_ID", "")
    PAYPAL_CLIENT_SECRET   = os.environ.get("PAYPAL_CLIENT_SECRET", "")
    PAYPAL_MODE            = os.environ.get("PAYPAL_MODE", "sandbox")  # sandbox|live
    OCTOPUS_MERCHANT_ID    = os.environ.get("OCTOPUS_MERCHANT_ID", "")

    # POS online gateways — disabled by default (cash/free/manual card only)
    PAYMENT_GATEWAYS_ENABLED = os.environ.get("PAYMENT_GATEWAYS_ENABLED", "false").lower() == "true"

    # Public beta
    PUBLIC_BETA_ENABLED       = os.environ.get("PUBLIC_BETA_ENABLED", "true").lower() == "true"
    BETA_TRIAL_DAYS           = int(os.environ.get("BETA_TRIAL_DAYS", "90"))
    BETA_SIGNUP_REQUIRES_LEAD = os.environ.get("BETA_SIGNUP_REQUIRES_LEAD", "true").lower() == "true"
    BETA_ENROLLMENT_DAYS      = int(os.environ.get("BETA_ENROLLMENT_DAYS", "7"))
    BETA_MAX_STAFF            = int(os.environ.get("BETA_MAX_STAFF", "10"))
    BETA_SUBSCRIPTION_LOCKED  = os.environ.get("BETA_SUBSCRIPTION_LOCKED", "true").lower() == "true"
    EMAIL_ENABLED             = os.environ.get("EMAIL_ENABLED", "false").lower() == "true"
    ONBOARDING_NOTIFY_EMAIL   = os.environ.get("ONBOARDING_NOTIFY_EMAIL", "sales.dgcollection@gmail.com")

    # Google OAuth (Sign in with Google)
    GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

    # Hospitality module
    HOSPITALITY_ENABLED = os.environ.get("HOSPITALITY_ENABLED", "false").lower() == "true"
    GMAIL_IMPORT_ENABLED = os.environ.get("GMAIL_IMPORT_ENABLED", "false").lower() == "true"
    CRON_SECRET = os.environ.get("CRON_SECRET", "")

    # Gmail OAuth for hospitality OTA import (separate from login GOOGLE_CLIENT_ID)
    GOOGLE_GMAIL_CLIENT_ID = os.environ.get("GOOGLE_GMAIL_CLIENT_ID", "")
    GOOGLE_GMAIL_CLIENT_SECRET = os.environ.get("GOOGLE_GMAIL_CLIENT_SECRET", "")
    GOOGLE_GMAIL_REDIRECT_URI = os.environ.get("GOOGLE_GMAIL_REDIRECT_URI", "")
    GOOGLE_GMAIL_CREDENTIALS_JSON = os.environ.get("GOOGLE_GMAIL_CREDENTIALS_JSON", "")

class DevelopmentConfig(Config):
    DEBUG = True
    SESSION_COOKIE_SECURE   = False
    SESSION_COOKIE_SAMESITE = "Lax"

class ProductionConfig(Config):
    DEBUG = False
