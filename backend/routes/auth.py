from flask import Blueprint, request, jsonify, current_app, g
from flask_login import login_user, logout_user, login_required, current_user
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from models import db, User, Account, AuthToken, DEFAULT_ONBOARDING_STEPS
from schemas import LoginSchema, CreateUserSchema
from audit import log_audit
from auth_utils import make_access_token, make_refresh_token_record, token_required, bump_security_epoch
from beta_enrollment import validate_enrollment, consume_enrollment
from guest_demo import seed_guest_demo_for_account
from google_auth import verify_google_id_token
from datetime import datetime, timedelta
import secrets

auth_bp = Blueprint("auth", __name__)

from user_access_control import PLATFORM_ROLES, normalize_role, enrich_user_dict, merchant_service_enabled

STORE_ASSIGNABLE_ROLES = frozenset({"owner", "manager", "sales_staff", "staff", "operations_staff", "engineer"})
ALL_ROLES = PLATFORM_ROLES


def _normalize_role(role):
    return normalize_role(role)


def _validate_assignable_role(role):
    """Superadmin role is DB-only — never assignable via API."""
    role = _normalize_role(role)
    if role == "superadmin":
        return jsonify({"error": "Superadmin role can only be assigned via database"}), 403
    if current_user.role == "superadmin":
        if role not in ALL_ROLES:
            return jsonify({"error": "Invalid role"}), 400
        return None, role
    if role not in STORE_ASSIGNABLE_ROLES:
        return jsonify({"error": "Invalid role for store user"}), 400
    return None, role


def _assert_can_manage_user(user):
    """Block store admins from modifying platform superadmin accounts."""
    if user.role == "superadmin" and current_user.role != "superadmin":
        return jsonify({"error": "Forbidden"}), 403
    if current_user.role != "superadmin" and user.account_id != current_user.account_id:
        return jsonify({"error": "Forbidden"}), 403
    return None


def _validation_fields_message(errors):
    if not errors:
        return "Validation failed"
    parts = []
    for field, msgs in errors.items():
        text = msgs[0] if isinstance(msgs, list) and msgs else str(msgs)
        parts.append(f"{field}: {text}")
    return "; ".join(parts) if parts else "Validation failed"


def _staff_email_for_create(email, username, account_id):
    """Staff can log in with username only — synthesize unique internal email when omitted."""
    cleaned = (email or "").strip().lower()
    if cleaned:
        existing = User.query.filter_by(email=cleaned).first()
        if existing:
            return None, jsonify({
                "error": "That email is already registered. Leave email blank — staff can sign in with username only.",
                "code": "email_taken",
            }), 400
        return cleaned, None

    base = f"{username}+{account_id or 0}@staff.dgcpos.internal"
    candidate = base
    n = 0
    while User.query.filter_by(email=candidate).first():
        n += 1
        candidate = f"{username}+{account_id or 0}+{n}@staff.dgcpos.internal"
    return candidate, None


def _commit_user_or_error(action_label):
    try:
        db.session.commit()
        return None
    except Exception as e:
        db.session.rollback()
        raw = str(getattr(e, "orig", e)).lower()
        if "users_email_key" in raw or ("duplicate key" in raw and "email" in raw):
            return jsonify({
                "error": "That email is already registered. Leave email blank — staff can sign in with username only.",
                "code": "email_taken",
            }), 400
        if "users_username_key" in raw or ("duplicate key" in raw and "username" in raw):
            return jsonify({"error": "Username already exists — choose a different login name."}), 400
        if "duplicate key" in raw and "users_pkey" in raw:
            return jsonify({"error": f"Failed to {action_label} — try again."}), 500
        print(f"[AUTH] {action_label} failed: {e}", flush=True)
        return jsonify({"error": f"Failed to {action_label}"}), 500

def make_token(user):
    return make_access_token(user)


# ── Routes ───────────────────────────────────────────────────────────────────

@auth_bp.route("/login", methods=["POST"])
def login():
    from platform_modules import module_enabled, get_maintenance_message
    from maintenance_gate import _request_from_admin_host, login_allowed_when_app_off

    raw = request.get_json(silent=True) or {}
    errors = LoginSchema().validate(raw)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422
    data = LoginSchema().load(raw)
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    remember = bool(data.get("remember"))

    if not module_enabled("site_app"):
        if not _request_from_admin_host():
            return jsonify({
                "error": get_maintenance_message(),
                "maintenance": True,
                "code": "platform_maintenance",
            }), 503
        if not login_allowed_when_app_off(username):
            return jsonify({
                "error": get_maintenance_message(),
                "maintenance": True,
                "code": "platform_maintenance",
            }), 503
    # Support login with email or username
    user = User.query.filter(
        (User.username == username) | (User.email == username),
        User.is_active == True
    ).first()

    # Check account lockout before anything else
    if user and user.is_locked():
        remaining = int((user.locked_until - datetime.utcnow()).total_seconds() / 60) + 1
        log_audit("auth.login_blocked", detail={"username": username, "reason": "account_locked"})
        db.session.commit()
        return jsonify({"error": f"Account locked due to too many failed attempts. Try again in {remaining} minute(s)."}), 429

    if not user or not user.check_password(password):
        if user:
            user.record_failed_login()
            db.session.commit()
            attempts_left = max(0, 5 - (user.failed_login_count or 0))
            if attempts_left == 0:
                log_audit("auth.login_locked", detail={"username": username})
                return jsonify({"error": "Account locked for 30 minutes after too many failed attempts."}), 429
        log_audit("auth.login_failed", detail={"username": username})
        attempts_msg = f" ({attempts_left} attempt(s) remaining before lockout)" if user and attempts_left > 0 else ""
        return jsonify({"error": f"Invalid credentials{attempts_msg}"}), 401

    user.record_successful_login()
    login_user(user, remember=remember)
    user.last_login = datetime.utcnow()
    log_audit("auth.login", resource="user", resource_id=str(user.id),
              detail={"username": user.username})
    db.session.commit()
    token = make_token(user)
    refresh = make_refresh_token_record(user)
    db.session.commit()
    user_dict = enrich_user_dict(user)
    user_dict["must_change_password"] = user.must_change_password
    if user.account_id and not merchant_service_enabled(user.account_id) and user.role != "superadmin":
        return jsonify({
            "error": "Merchant service is disabled. Contact DGC support.",
            "code": "merchant_service_disabled",
        }), 403
    return jsonify({
        "user": user_dict,
        "token": token,
        "refresh_token": refresh,
        "message": "Login successful",
    })


def _create_beta_account_user(email, full_name, shop_name, business_type, password=None, google_id=None, email_verified=False, guest_mode=False):
    """Shared account creation for password and Google beta signup."""
    trial_days = current_app.config.get("BETA_TRIAL_DAYS", 90)
    beta_enabled = current_app.config.get("PUBLIC_BETA_ENABLED", True)

    plan = "beta_guest" if guest_mode else ("beta" if beta_enabled else "starter")
    status = "beta_locked" if (beta_enabled or guest_mode) else "trialing"

    account = Account(
        name=shop_name,
        business_type=business_type,
        subscription_plan=plan,
        subscription_status=status,
        trial_ends_at=datetime.utcnow() + timedelta(days=trial_days),
        beta_enrolled_at=datetime.utcnow() if (beta_enabled or guest_mode) else None,
    )
    account.set_onboarding_steps([dict(s) for s in DEFAULT_ONBOARDING_STEPS])
    db.session.add(account)
    db.session.flush()
    from merchant_customer_id import ensure_merchant_customer_id
    ensure_merchant_customer_id(account.id)

    user = User(
        account_id=account.id,
        username=email,
        email=email,
        full_name=full_name,
        role="owner",
        must_change_password=False,
        email_verified=email_verified or bool(google_id),
        google_id=google_id,
    )
    user.set_password(password or secrets.token_urlsafe(32))
    db.session.add(user)
    db.session.flush()
    return user, account


def _auth_success_response(user, account=None, message="Login successful"):
    login_user(user, remember=True)
    user.last_login = datetime.utcnow()
    token = make_token(user)
    refresh = make_refresh_token_record(user)
    db.session.commit()
    user_dict = user.to_dict()
    if account:
        user_dict["account"] = account.to_dict()
    user_dict["must_change_password"] = user.must_change_password
    return jsonify({
        "user": user_dict,
        "token": token,
        "refresh_token": refresh,
        "message": message,
        "account": account.to_dict() if account else user_dict.get("account"),
    })


@auth_bp.route("/signup", methods=["POST"])
def signup():
    """Public signup — gated behind beta enrollment when public beta is enabled."""
    raw = request.get_json(silent=True) or {}
    email = raw.get("email", "").strip().lower()
    password = raw.get("password", "")
    full_name = raw.get("full_name", "").strip() or email.split("@")[0].title()
    shop_name = (raw.get("shop_name") or raw.get("business_name") or "").strip()
    business_type = (raw.get("business_type") or "").strip()
    enrollment_token = (raw.get("enrollment_token") or "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if not shop_name:
        return jsonify({"error": "Business name is required"}), 400
    if not business_type:
        return jsonify({"error": "Business type is required"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered. Sign in instead."}), 409

    lead, enroll_err = validate_enrollment(enrollment_token, email=email)
    if enroll_err:
        return jsonify({"error": enroll_err}), 403

    if lead:
        shop_name = shop_name or lead.business_name
        business_type = business_type or lead.business_type or business_type
        full_name = full_name or lead.contact_name

    beta_enabled = current_app.config.get("PUBLIC_BETA_ENABLED", True)
    user, account = _create_beta_account_user(
        email=email,
        full_name=full_name,
        shop_name=shop_name,
        business_type=business_type,
        password=password,
        guest_mode=True,
    )
    seed_guest_demo_for_account(account.id, shop_name=shop_name, business_type=business_type)
    if lead and lead.phone:
        account.business_phone = lead.phone
    if lead and lead.location:
        account.business_location = lead.location

    if lead:
        consume_enrollment(lead)

    verify_token, _ = AuthToken.create_for_user(user, "verify_email", hours=72)
    db.session.commit()

    log_audit("auth.signup", resource="user", resource_id=str(user.id), detail={"email": email, "account": shop_name})

    response = _auth_success_response(
        user,
        account,
        message="Account created — welcome to the public beta!" if beta_enabled else "Account created successfully",
    )
    data = response.get_json()
    if not current_app.config.get("EMAIL_ENABLED"):
        data["email_verification_token"] = verify_token
    return jsonify(data), 201


@auth_bp.route("/google", methods=["POST"])
def google_auth():
    """Sign in or sign up with Google. New accounts require beta enrollment."""
    raw = request.get_json(silent=True) or {}
    credential = (raw.get("credential") or raw.get("id_token") or "").strip()
    enrollment_token = (raw.get("enrollment_token") or "").strip()

    profile, err = verify_google_id_token(credential)
    if err:
        return jsonify({"error": err}), 400

    email = profile["email"]
    google_id = profile["google_id"]

    user = User.query.filter(
        (User.google_id == google_id) | (User.email == email),
        User.is_active == True,
    ).first()

    if user:
        if user.is_locked():
            remaining = int((user.locked_until - datetime.utcnow()).total_seconds() / 60) + 1
            return jsonify({"error": f"Account locked. Try again in {remaining} minute(s)."}), 429
        if not user.google_id:
            user.google_id = google_id
        user.record_successful_login()
        user.email_verified = True
        log_audit("auth.google_login", resource="user", resource_id=str(user.id))
        return _auth_success_response(user, message="Signed in with Google")

    lead, enroll_err = validate_enrollment(enrollment_token, email=email)
    if enroll_err:
        return jsonify({"error": enroll_err}), 403

    shop_name = (raw.get("shop_name") or raw.get("business_name") or (lead.business_name if lead else "")).strip()
    business_type = (raw.get("business_type") or (lead.business_type if lead else "")).strip()
    full_name = profile["full_name"] or (lead.contact_name if lead else email.split("@")[0].title())

    if not shop_name:
        return jsonify({"error": "Business name is required"}), 400
    if not business_type:
        return jsonify({"error": "Business type is required"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered with a different sign-in method."}), 409

    user, account = _create_beta_account_user(
        email=email,
        full_name=full_name,
        shop_name=shop_name,
        business_type=business_type,
        google_id=google_id,
        email_verified=True,
    )

    if lead:
        consume_enrollment(lead)

    log_audit("auth.google_signup", resource="user", resource_id=str(user.id), detail={"email": email})
    return _auth_success_response(user, account, message="Welcome to the public beta!"), 201


@auth_bp.route("/beta-guest", methods=["POST"])
def beta_guest_enter():
    """Email-verified guest beta — isolated sandbox, no superadmin production data."""
    raw = request.get_json(silent=True) or {}
    email = (raw.get("email") or "").strip().lower()
    enrollment_token = (raw.get("enrollment_token") or "").strip()

    if not email:
        return jsonify({"error": "Email is required"}), 400

    lead, enroll_err = validate_enrollment(enrollment_token, email=email)
    if enroll_err:
        return jsonify({"error": enroll_err}), 403

    existing = User.query.filter_by(email=email, is_active=True).first()
    if existing:
        if existing.role == "superadmin":
            return jsonify({"error": "Use the admin login for this account."}), 403
        existing.record_successful_login()
        log_audit("auth.beta_guest_login", resource="user", resource_id=str(existing.id))
        account = existing.account
        if account and account.subscription_plan != "beta_guest":
            account.subscription_plan = "beta_guest"
        if account:
            seed_guest_demo_for_account(account.id, shop_name=account.name)
        if lead:
            consume_enrollment(lead)
        db.session.commit()
        return _auth_success_response(existing, account, message="Welcome back to the guest beta!")

    local = email.split("@")[0].replace(".", " ").replace("_", " ").title() or "Guest"
    shop_name = (lead.business_name if lead else None) or f"Guest — {local}"
    business_type = (lead.business_type if lead else None) or "General Retail"

    user, account = _create_beta_account_user(
        email=email,
        full_name=lead.contact_name if lead else local,
        shop_name=shop_name,
        business_type=business_type,
        password=secrets.token_urlsafe(24),
        email_verified=True,
        guest_mode=True,
    )
    seed_guest_demo_for_account(account.id, shop_name=shop_name, business_type=business_type)

    if lead:
        consume_enrollment(lead)

    log_audit("auth.beta_guest_signup", resource="user", resource_id=str(user.id), detail={"email": email})
    return _auth_success_response(user, account, message="Guest beta workspace ready — explore with sample data only!"), 201


@auth_bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    return jsonify({"message": "Logged out"})

@auth_bp.route("/me", methods=["GET"])
@token_required
@login_required
def me():
    return jsonify({"user": enrich_user_dict(current_user)})

@auth_bp.route("/change-password", methods=["PUT"])
@token_required
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    current_password = (data.get("current_password") or data.get("currentPassword") or "").strip()
    new_password = (data.get("new_password") or data.get("newPassword") or "").strip()

    if not current_password:
        return jsonify({"error": "Current password is required"}), 400
    if not current_user.check_password(current_password):
        return jsonify({"error": "Current password incorrect"}), 400
    if not new_password:
        return jsonify({"error": "New password is required"}), 400
    if len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    current_user.set_password(new_password)
    bump_security_epoch(current_user)
    db.session.commit()
    return jsonify({"message": "Password changed"})

@auth_bp.route("/force-change-password", methods=["PUT"])
@token_required
@login_required
def force_change_password():
    data = request.get_json(silent=True) or {}
    new_password = (data.get("new_password") or data.get("newPassword") or "").strip()
    if not new_password:
        return jsonify({"error": "New password is required"}), 400
    if len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    current_user.set_password(new_password)
    current_user.must_change_password = False
    bump_security_epoch(current_user)
    db.session.commit()
    return jsonify({"message": "Password updated successfully"})


@auth_bp.route("/refresh", methods=["POST"])
def refresh_token():
    raw = request.get_json(silent=True) or {}
    plaintext = (raw.get("refresh_token") or "").strip()
    if not plaintext:
        return jsonify({"error": "refresh_token is required"}), 400

    record = AuthToken.query.filter_by(
        token_hash=AuthToken.hash_token(plaintext),
        purpose="refresh",
    ).first()
    if not record or not record.is_valid():
        return jsonify({"error": "Invalid or expired refresh token"}), 401

    user = User.query.get(record.user_id)
    if not user or not user.is_active:
        return jsonify({"error": "User not found"}), 401
    if user.is_locked():
        return jsonify({"error": "Account locked"}), 429
    if user.account_id and not merchant_service_enabled(user.account_id) and user.role != "superadmin":
        return jsonify({
            "error": "Merchant service is disabled. Contact DGC support.",
            "code": "merchant_service_disabled",
        }), 403

    record.used_at = datetime.utcnow()
    access = make_token(user)
    new_refresh = make_refresh_token_record(user)
    db.session.commit()
    return jsonify({"token": access, "refresh_token": new_refresh})


@auth_bp.route("/verify-email", methods=["POST"])
def verify_email():
    raw = request.get_json(silent=True) or {}
    plaintext = (raw.get("token") or "").strip()
    if not plaintext:
        return jsonify({"error": "Verification token is required"}), 400

    record = AuthToken.query.filter_by(
        token_hash=AuthToken.hash_token(plaintext),
        purpose="verify_email",
    ).first()
    if not record or not record.is_valid():
        return jsonify({"error": "Invalid or expired verification token"}), 400

    user = User.query.get(record.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.email_verified = True
    record.used_at = datetime.utcnow()
    db.session.commit()
    log_audit("auth.email_verified", resource="user", resource_id=str(user.id))
    return jsonify({"message": "Email verified successfully"})


@auth_bp.route("/reset-password-request", methods=["POST"])
def reset_password_request():
    """Issue a secure password-reset token (email delivery optional)."""
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or data.get("email") or "").strip().lower()
    if not identifier:
        return jsonify({"error": "Username or email is required"}), 400

    user = User.query.filter(
        (User.username == identifier) | (User.email == identifier),
        User.is_active == True
    ).first()

    generic_msg = "If an account exists, a reset link has been generated. Contact support if email delivery is unavailable."
    if not user:
        log_audit("auth.reset_password_requested", detail={"identifier": identifier, "user_found": False})
        return jsonify({"message": generic_msg})

    user.failed_login_count = 0
    user.locked_until = None
    plaintext, _ = AuthToken.create_for_user(user, "reset_password", hours=2)
    db.session.commit()
    log_audit("auth.reset_password_requested", resource="user", resource_id=str(user.id))

    resp = {"message": "If an account exists, a password reset email has been sent."}
    if current_app.config.get("EMAIL_ENABLED") and user.email:
        from email_service import send_email
        frontend = current_app.config.get("FRONTEND_URL", "https://app.dgcpos.net").rstrip("/")
        reset_url = f"{frontend}/login?mode=reset&token={plaintext}"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
          <h2 style="color:#1B2F5E">Reset your RetailOS password</h2>
          <p>Hi {user.full_name or user.username},</p>
          <p>We received a request to reset your password. Click below — link expires in 2 hours.</p>
          <p style="margin:24px 0"><a href="{reset_url}"
            style="background:#1B2F5E;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
            Reset Password</a></p>
          <p style="font-size:12px;color:#666">Or paste this token on the reset page:<br><code>{plaintext}</code></p>
        </div>
        """
        ok, method = send_email(to_email=user.email, subject="Reset your RetailOS password", html=html)
        if not ok:
            resp["message"] = generic_msg
            log_audit("auth.reset_email_failed", resource="user", resource_id=str(user.id), detail={"error": method})
        else:
            log_audit("auth.reset_email_sent", resource="user", resource_id=str(user.id), detail={"method": method})
    elif not current_app.config.get("EMAIL_ENABLED"):
        resp = {"message": generic_msg, "reset_token": plaintext}
    return jsonify(resp)


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    raw = request.get_json(silent=True) or {}
    plaintext = (raw.get("token") or "").strip()
    new_password = (raw.get("new_password") or raw.get("newPassword") or "").strip()

    if not plaintext or not new_password:
        return jsonify({"error": "Token and new password are required"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    record = AuthToken.query.filter_by(
        token_hash=AuthToken.hash_token(plaintext),
        purpose="reset_password",
    ).first()
    if not record or not record.is_valid():
        return jsonify({"error": "Invalid or expired reset token"}), 400

    user = User.query.get(record.user_id)
    if not user or not user.is_active:
        return jsonify({"error": "User not found"}), 404

    user.set_password(new_password)
    user.must_change_password = False
    user.failed_login_count = 0
    user.locked_until = None
    record.used_at = datetime.utcnow()
    db.session.commit()
    log_audit("auth.password_reset", resource="user", resource_id=str(user.id))
    return jsonify({"message": "Password reset successfully. You can now sign in."})


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """Alias for reset-password-request (backwards compatible)."""
    return reset_password_request()


@auth_bp.route("/reset-superadmin", methods=["POST"])
def reset_superadmin():
    log_audit("auth.superadmin_reset_disabled", detail={"source": "public_api"})
    return jsonify({"error": "Disabled. Use local reset script only."}), 403

@auth_bp.route("/users", methods=["GET"])
@token_required
@login_required
def get_users():
    if current_user.role not in ["owner", "manager", "superadmin"]:
        return jsonify({"error": "Forbidden"}), 403
    if current_user.role == "superadmin":
        users = User.query.all()
    else:
        users = User.query.filter_by(account_id=current_user.account_id).all()
    return jsonify([u.to_dict() for u in users])

@auth_bp.route("/users", methods=["POST"])
@token_required
@login_required
def create_user():
    if current_user.role not in ["owner", "manager", "superadmin"]:
        return jsonify({"error": "Forbidden"}), 403
    raw = request.get_json(silent=True) or {}
    errors = CreateUserSchema().validate(raw)
    if errors:
        return jsonify({
            "error": _validation_fields_message(errors),
            "fields": errors,
        }), 422
    data = CreateUserSchema().load(raw)
    err, role = _validate_assignable_role(data.get("role", "sales_staff"))
    if err:
        return err
    data["role"] = role
    username = (data["username"] or "").strip()
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists — choose a different login name."}), 400
    account_id = data.get("account_id") if current_user.role == "superadmin" else None
    if current_user.role != "superadmin":
        account_id = current_user.account_id
        max_staff = current_app.config.get("BETA_MAX_STAFF", 10)
        staff_count = User.query.filter(
            User.account_id == account_id,
            User.role != "owner",
            User.is_active == True,
        ).count()
        if staff_count >= max_staff:
            return jsonify({
                "error": f"Staff limit reached ({max_staff} seats). Contact support to add more users.",
                "code": "staff_limit_reached",
                "max_staff": max_staff,
            }), 403
    elif not account_id and data.get("role") != "superadmin":
        return jsonify({"error": "account_id is required for merchant users"}), 400
    staff_email, email_err = _staff_email_for_create(data.get("email"), username, account_id)
    if email_err:
        return email_err
    user = User(
        username=username,
        email=staff_email,
        full_name=data.get("full_name", ""),
        role=data.get("role", "sales_staff"),
        account_id=account_id,
    )
    user.set_password(data["password"])
    db.session.add(user)
    db.session.flush()
    log_audit("user.create", resource="user", resource_id=str(user.id),
              detail={"username": user.username, "role": user.role, "account_id": account_id})
    commit_err = _commit_user_or_error("create staff user")
    if commit_err:
        return commit_err
    return jsonify({"user": user.to_dict()}), 201

@auth_bp.route("/users/<int:uid>", methods=["PUT"])
@token_required
@login_required
def update_user(uid):
    if current_user.role not in ["owner", "manager", "superadmin"] and current_user.id != uid:
        return jsonify({"error": "Forbidden"}), 403
    user = User.query.get_or_404(uid)
    denied = _assert_can_manage_user(user)
    if denied:
        return denied
    from user_access_control import owner_can_manage_actor
    if current_user.role == "manager" and not owner_can_manage_actor(current_user, user):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    privileged_fields = {"role", "is_active"}
    if current_user.role == "manager":
        if "role" in data and normalize_role(data["role"]) in ("owner", "manager"):
            return jsonify({"error": "Managers cannot assign owner/manager roles"}), 403
    if current_user.role not in ("owner", "superadmin", "manager"):
        for pf in privileged_fields:
            data.pop(pf, None)
    if "role" in data:
        err, role = _validate_assignable_role(data["role"])
        if err:
            return err
        data["role"] = role
    if "email" in data:
        cleaned = (data.get("email") or "").strip().lower()
        if cleaned:
            clash = User.query.filter(User.email == cleaned, User.id != user.id).first()
            if clash:
                return jsonify({
                    "error": "That email is already registered. Leave email blank for username-only staff login.",
                    "code": "email_taken",
                }), 400
            user.email = cleaned
        elif user.role != "owner":
            user.email, _ = _staff_email_for_create(None, user.username, user.account_id)
    for f in ["full_name", "role", "is_active"]:
        if f in data:
            setattr(user, f, data[f])
    if "password" in data and data["password"]:
        if len(data["password"]) < 8:
            return jsonify({"error": "Password must be at least 8 characters"}), 400
        user.set_password(data["password"])
        bump_security_epoch(user)
    if "is_active" in data and not data["is_active"]:
        bump_security_epoch(user)
    commit_err = _commit_user_or_error("update user")
    if commit_err:
        return commit_err
    return jsonify({"user": user.to_dict()})

@auth_bp.route("/users/<int:uid>", methods=["DELETE"])
@token_required
@login_required
def delete_user(uid):
    if current_user.role not in ["owner", "manager", "superadmin"]:
        return jsonify({"error": "Forbidden"}), 403
    if uid == current_user.id:
        return jsonify({"error": "Cannot delete yourself"}), 400
    user = User.query.get_or_404(uid)
    denied = _assert_can_manage_user(user)
    if denied:
        return denied
    from user_access_control import owner_can_manage_actor
    if current_user.role == "manager" and not owner_can_manage_actor(current_user, user):
        return jsonify({"error": "Forbidden"}), 403
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "User deleted"})
