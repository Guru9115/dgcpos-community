"""Public beta, business onboarding, and feedback."""
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Account, BetaLead, BusinessFeedback, Product, User, Sale
from audit import log_audit
from beta_enrollment import issue_enrollment_token, find_lead_by_enrollment_token
from access_policy import get_access_policy, evaluate_signup

onboarding_bp = Blueprint("onboarding", __name__)


@onboarding_bp.route("/beta-info", methods=["GET"])
def beta_info():
    public_beta = current_app.config.get("PUBLIC_BETA_ENABLED", True)
    access = get_access_policy()
    return jsonify({
        "public_beta": public_beta,
        "signup_requires_enrollment": public_beta and current_app.config.get("BETA_SIGNUP_REQUIRES_LEAD", True),
        "signup_open": access["signup_open"],
        "access_policy": access["access_policy"],
        "google_auth_enabled": bool(current_app.config.get("GOOGLE_CLIENT_ID")),
        "google_client_id": current_app.config.get("GOOGLE_CLIENT_ID") or None,
        "trial_days": current_app.config.get("BETA_TRIAL_DAYS", 90),
        "tagline": "RetailOS Public Beta — built for real retail businesses",
        "features": [
            "Point of Sale with barcode scanning",
            "Inventory & stock management",
            "Customer loyalty & CRM",
            "Daily sales register (DSR)",
            "Reports, finance & AI assistant",
        ],
        "cta": "Complete signup with name, email, country and mobile to open your guest workspace",
        "guest_mode": True,
        "max_staff": current_app.config.get("BETA_MAX_STAFF", 10),
        "subscription_locked": True,
    })


@onboarding_bp.route("/beta-interest", methods=["POST"])
def beta_interest():
    """Capture businesses joining the public beta and issue a secure enrollment link."""
    raw = request.get_json(silent=True) or {}
    email = (raw.get("email") or "").strip().lower()
    first_name = (raw.get("first_name") or "").strip()
    surname = (raw.get("surname") or "").strip()
    contact_name = (raw.get("contact_name") or "").strip()
    country = (raw.get("country") or raw.get("location") or "").strip()
    phone = (raw.get("phone") or raw.get("mobile") or "").strip()
    business_name = (raw.get("business_name") or "").strip()
    business_type = (raw.get("business_type") or "").strip()

    if not email:
        return jsonify({"error": "Email is required"}), 400
    if not first_name and not contact_name:
        return jsonify({"error": "First name is required"}), 400
    if not surname and not contact_name:
        return jsonify({"error": "Surname is required"}), 400
    if not country:
        return jsonify({"error": "Country is required"}), 400
    if not phone or len(phone) < 8:
        return jsonify({"error": "Valid mobile number is required"}), 400

    if not contact_name:
        contact_name = f"{first_name} {surname}".strip()
    if not business_name:
        business_name = f"{first_name}'s Store" if first_name else f"Guest Beta — {email.split('@')[-1]}"
    if not business_type:
        business_type = "General Retail"

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "This email already has an account. Sign in instead."}), 409

    allowed, requires_manual, block_message = evaluate_signup(country)
    if not allowed:
        return jsonify({"error": block_message}), 403

    lead = BetaLead.query.filter_by(email=email).order_by(BetaLead.created_at.desc()).first()
    if lead and lead.status == "declined":
        return jsonify({"error": "Beta access was declined for this email. Contact support if you believe this is an error."}), 403

    if not lead:
        lead = BetaLead(
            business_name=business_name,
            contact_name=contact_name,
            email=email,
        )
        db.session.add(lead)

    lead.business_name = business_name
    lead.contact_name = contact_name
    lead.phone = phone or None
    lead.business_type = business_type
    lead.location = country or None
    lead.message = (raw.get("message") or "").strip() or None

    if requires_manual:
        lead.status = "new"
        lead.enrollment_token_hash = None
        lead.enrollment_expires_at = None
        db.session.commit()
        log_audit(
            "onboarding.beta_interest_pending",
            detail={"email": email, "business": business_name, "country": country},
        )
        _send_beta_lead_emails(lead, enrollment_token=None)
        return jsonify({
            "message": (
                "Thanks for registering! Your request is pending review. "
                "We'll email you at {email} when approved."
            ).format(email=email),
            "pending_review": True,
            "lead": lead.to_dict(),
        }), 202

    enrollment_token = issue_enrollment_token(lead)
    db.session.commit()
    log_audit("onboarding.beta_interest", detail={"email": email, "business": business_name})

    _send_beta_lead_emails(lead, enrollment_token)

    return jsonify({
        "message": "You're approved for the beta! Create your workspace below.",
        "lead": lead.to_dict(),
        "enrollment_token": enrollment_token,
    }), 201


@onboarding_bp.route("/beta-enrollment", methods=["GET"])
def validate_beta_enrollment():
    """Validate an enrollment token (used when opening /beta?token=...)."""
    token = (request.args.get("token") or "").strip()
    lead = find_lead_by_enrollment_token(token)
    if not lead:
        return jsonify({"valid": False, "error": "Invalid or expired enrollment link"}), 404

    return jsonify({
        "valid": True,
        "lead": {
            "business_name": lead.business_name,
            "contact_name": lead.contact_name,
            "email": lead.email,
            "business_type": lead.business_type,
            "location": lead.location,
            "phone": lead.phone,
            "country": lead.location,
        },
    })


@onboarding_bp.route("/checklist", methods=["GET"])
@token_required
@login_required
def get_checklist():
    account = current_user.account
    if not account:
        return jsonify({"steps": [], "progress": 100, "completed": True})
    _sync_checklist_progress(account)
    db.session.commit()
    return jsonify({
        "steps": account.get_onboarding_steps(),
        "progress": account.to_dict()["onboarding_progress"],
        "completed": account.onboarding_completed,
    })


@onboarding_bp.route("/checklist/<step_id>", methods=["POST"])
@token_required
@login_required
def complete_step(step_id):
    account = current_user.account
    if not account:
        return jsonify({"error": "No account"}), 400
    changed = account.mark_onboarding_step(step_id)
    if changed:
        log_audit("onboarding.step_complete", resource="account", resource_id=str(account.id), detail={"step": step_id})
    db.session.commit()
    return jsonify({
        "steps": account.get_onboarding_steps(),
        "progress": account.to_dict()["onboarding_progress"],
        "completed": account.onboarding_completed,
    })


@onboarding_bp.route("/profile", methods=["PUT"])
@token_required
@login_required
def update_business_profile():
    if current_user.role not in ("owner", "superadmin"):
        return jsonify({"error": "Forbidden"}), 403
    account = current_user.account
    if not account:
        return jsonify({"error": "No account"}), 400

    data = request.get_json(silent=True) or {}
    for field in ("name", "business_type", "business_phone", "business_location"):
        key = "name" if field == "name" else field
        if key in data and data[key] is not None:
            setattr(account, field if field != "name" else "name", str(data[key]).strip())

    _sync_checklist_progress(account)
    db.session.commit()
    return jsonify({"account": account.to_dict()})


@onboarding_bp.route("/feedback", methods=["POST"])
@token_required
@login_required
def submit_feedback():
    raw = request.get_json(silent=True) or {}
    message = (raw.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Feedback message is required"}), 400

    feedback = BusinessFeedback(
        account_id=current_user.account_id,
        user_id=current_user.id,
        category=(raw.get("category") or "general").strip(),
        rating=raw.get("rating"),
        message=message,
        page=(raw.get("page") or "").strip() or None,
    )
    db.session.add(feedback)
    if current_user.account:
        current_user.account.mark_onboarding_step("feedback")
    db.session.commit()
    log_audit("onboarding.feedback", resource="feedback", resource_id=str(feedback.id))
    return jsonify({"message": "Thank you for your feedback!", "feedback": feedback.to_dict()}), 201


@onboarding_bp.route("/feedback", methods=["GET"])
@token_required
@login_required
def list_feedback():
    if current_user.role != "superadmin":
        return jsonify({"error": "Forbidden"}), 403
    items = BusinessFeedback.query.order_by(BusinessFeedback.created_at.desc()).limit(100).all()
    return jsonify([f.to_dict() for f in items])


@onboarding_bp.route("/beta-leads", methods=["GET"])
@token_required
@login_required
def list_beta_leads():
    if current_user.role != "superadmin":
        return jsonify({"error": "Forbidden"}), 403
    leads = BetaLead.query.order_by(BetaLead.created_at.desc()).limit(200).all()
    return jsonify([l.to_dict() for l in leads])


@onboarding_bp.route("/beta-leads/<int:lead_id>", methods=["PUT"])
@token_required
@login_required
def update_beta_lead(lead_id):
    if current_user.role != "superadmin":
        return jsonify({"error": "Forbidden"}), 403
    lead = BetaLead.query.get_or_404(lead_id)
    data = request.get_json(silent=True) or {}
    enrollment_token = None
    if "status" in data:
        status = (data["status"] or "").strip().lower()
        if status not in ("new", "contacted", "onboarded", "declined"):
            return jsonify({"error": "Invalid status"}), 400
        lead.status = status
        if status == "onboarded":
            enrollment_token = issue_enrollment_token(lead)
        elif status == "declined":
            lead.enrollment_token_hash = None
            lead.enrollment_expires_at = None
    db.session.commit()
    if enrollment_token and current_app.config.get("EMAIL_ENABLED"):
        _send_beta_approval_email(lead, enrollment_token)
    log_audit("onboarding.beta_lead_updated", resource="beta_lead", resource_id=str(lead.id), detail={"status": lead.status})
    return jsonify({"lead": lead.to_dict()})


def _beta_enrollment_url(enrollment_token):
    frontend = current_app.config.get("FRONTEND_URL", "https://app.dgcpos.com").rstrip("/")
    return f"{frontend}/beta?token={enrollment_token}"


def _send_beta_lead_emails(lead, enrollment_token):
    if not current_app.config.get("EMAIL_ENABLED"):
        return
    from email_service import send_email
    notify_to = current_app.config.get("ONBOARDING_NOTIFY_EMAIL", "sales.dgcollection@gmail.com")

    team_html = f"""
    <div style="font-family:Arial,sans-serif;max-width:560px">
      <h2 style="color:#1B2F5E">New beta onboarding request</h2>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0"><strong>Business</strong></td><td>{lead.business_name}</td></tr>
        <tr><td style="padding:6px 0"><strong>Contact</strong></td><td>{lead.contact_name}</td></tr>
        <tr><td style="padding:6px 0"><strong>Email</strong></td><td>{lead.email}</td></tr>
        <tr><td style="padding:6px 0"><strong>Phone</strong></td><td>{lead.phone or '—'}</td></tr>
        <tr><td style="padding:6px 0"><strong>Type</strong></td><td>{lead.business_type or '—'}</td></tr>
        <tr><td style="padding:6px 0"><strong>Location</strong></td><td>{lead.location or '—'}</td></tr>
      </table>
      <p style="margin-top:16px"><strong>Message:</strong><br>{lead.message or '—'}</p>
      <p style="font-size:12px;color:#666">Manage leads in RetailOS → Beta Leads (superadmin).</p>
    </div>
    """
    send_email(to_email=notify_to, subject=f"Beta lead: {lead.business_name}", html=team_html)

    if not enrollment_token:
        pending_html = f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;color:#1a1a2e">
          <h2 style="color:#1B2F5E">RetailOS Beta — request received</h2>
          <p>Hi {lead.contact_name},</p>
          <p>Thanks for registering <strong>{lead.business_name}</strong>. Your request is under review.</p>
          <p>We'll email you at <strong>{lead.email}</strong> when your workspace is approved.</p>
        </div>
        """
        send_email(to_email=lead.email, subject="RetailOS beta request received", html=pending_html)
        return

    enroll_url = _beta_enrollment_url(enrollment_token)
    welcome_html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;color:#1a1a2e">
      <h2 style="color:#1B2F5E">Welcome to RetailOS Public Beta</h2>
      <p>Hi {lead.contact_name},</p>
      <p>Thanks for registering <strong>{lead.business_name}</strong> ({lead.business_type}).</p>
      <p>Use your private link below to create your workspace with Google or email:</p>
      <p><a href="{enroll_url}"
        style="background:#1B2F5E;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
        Create Your Workspace</a></p>
      <p style="font-size:12px;color:#666">This link expires in {current_app.config.get('BETA_ENROLLMENT_DAYS', 7)} days and is tied to {lead.email}.</p>
    </div>
    """
    send_email(to_email=lead.email, subject="Your RetailOS beta access link", html=welcome_html)


def _send_beta_approval_email(lead, enrollment_token):
    from email_service import send_email
    enroll_url = _beta_enrollment_url(enrollment_token)
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;color:#1a1a2e">
      <h2 style="color:#1B2F5E">You're approved for RetailOS Beta</h2>
      <p>Hi {lead.contact_name},</p>
      <p>Your business <strong>{lead.business_name}</strong> has been approved.</p>
      <p><a href="{enroll_url}"
        style="background:#1B2F5E;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
        Create Your Workspace</a></p>
    </div>
    """
    send_email(to_email=lead.email, subject="RetailOS beta approved — create your workspace", html=html)


def _sync_checklist_progress(account):
    """Auto-detect completed onboarding steps from real usage."""
    steps = {s["id"]: s for s in account.get_onboarding_steps()}

    if account.name and account.name != "My Retail OS" and account.business_type:
        steps.get("profile", {})["done"] = True

    product_count = Product.query.filter_by(account_id=account.id).count()
    if product_count > 0:
        steps.get("products", {})["done"] = True

    sale_count = Sale.query.filter_by(account_id=account.id).count()
    if sale_count > 0:
        steps.get("pos_sale", {})["done"] = True

    team_count = User.query.filter_by(account_id=account.id).filter(User.role != "owner").count()
    if team_count > 0:
        steps.get("team", {})["done"] = True

    feedback_count = BusinessFeedback.query.filter_by(account_id=account.id).count()
    if feedback_count > 0:
        steps.get("feedback", {})["done"] = True

    account.set_onboarding_steps(list(steps.values()))
    account.onboarding_completed = all(s.get("done") for s in steps.values())