"""Beta enrollment token helpers — gate public signup behind verified business leads."""
from datetime import datetime, timedelta
import secrets

from models import BetaLead, AuthToken, db


def issue_enrollment_token(lead, days=None):
    """Create a fresh enrollment token for a beta lead. Returns plaintext token."""
    from flask import current_app

    if days is None:
        days = current_app.config.get("BETA_ENROLLMENT_DAYS", 7)

    plaintext = AuthToken.generate_plaintext()
    lead.enrollment_token_hash = AuthToken.hash_token(plaintext)
    lead.enrollment_expires_at = datetime.utcnow() + timedelta(days=days)
    lead.enrollment_used_at = None
    return plaintext


def find_lead_by_enrollment_token(plaintext):
    if not plaintext:
        return None
    token_hash = AuthToken.hash_token(plaintext.strip())
    lead = BetaLead.query.filter_by(enrollment_token_hash=token_hash).first()
    if not lead:
        return None
    if lead.enrollment_used_at:
        return None
    if lead.enrollment_expires_at and datetime.utcnow() > lead.enrollment_expires_at:
        return None
    if lead.status == "declined":
        return None
    return lead


def enrollment_required():
    from flask import current_app

    if not current_app.config.get("PUBLIC_BETA_ENABLED", True):
        return False
    return current_app.config.get("BETA_SIGNUP_REQUIRES_LEAD", True)


def validate_enrollment(plaintext, email=None):
    """Return (lead, error_message). error_message is None when valid."""
    if not enrollment_required():
        return None, None

    lead = find_lead_by_enrollment_token(plaintext)
    if not lead:
        return None, "Invalid or expired beta enrollment link. Request access at /beta first."

    if email:
        normalized = email.strip().lower()
        if lead.email != normalized:
            return None, "Email must match the address used for beta enrollment."

    return lead, None


def consume_enrollment(lead):
    lead.enrollment_used_at = datetime.utcnow()
    if lead.status == "new":
        lead.status = "onboarded"


def ensure_lead_enrollment(lead):
    """Return existing valid token or issue a new one."""
    if (
        lead.enrollment_token_hash
        and not lead.enrollment_used_at
        and lead.enrollment_expires_at
        and datetime.utcnow() <= lead.enrollment_expires_at
        and lead.status != "declined"
    ):
        return None  # caller should not expose hash; issue fresh on demand only
    return issue_enrollment_token(lead)