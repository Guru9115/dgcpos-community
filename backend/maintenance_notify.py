"""One-shot maintenance notice email blast to platform users."""
import html
import re
from datetime import datetime

from flask import current_app

from email_service import send_email
from models import User
from platform_modules import get_maintenance_message, get_maintenance_draft, module_enabled

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def maintenance_recipients():
    """Active store users with a valid email (excludes superadmin)."""
    seen = set()
    out = []
    users = (
        User.query.filter(
            User.is_active == True,
            User.role != "superadmin",
            User.email.isnot(None),
        )
        .order_by(User.id.asc())
        .all()
    )
    for user in users:
        email = (user.email or "").strip().lower()
        if not email or email in seen or not _EMAIL_RE.match(email):
            continue
        seen.add(email)
        out.append(user)
    return out


def maintenance_recipient_count():
    return len(maintenance_recipients())


def _offline_sites():
    sites = []
    if not module_enabled("site_app"):
        sites.append("RetailOS App (app.dgcpos.net)")
    if not module_enabled("site_marketing"):
        sites.append("Marketing website (dgcpos.net)")
    if not module_enabled("site_bazaar"):
        sites.append("DGC Bazaar marketplace")
    return sites


def _format_draft_time(iso_value: str) -> str:
    if not iso_value:
        return datetime.utcnow().strftime("%d %b %Y, %H:%M UTC")
    try:
        raw = iso_value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
        return dt.strftime("%d %b %Y, %H:%M UTC")
    except Exception:
        return iso_value


def _build_html(*, user, message: str, offline_sites: list, draft_meta: dict = None) -> str:
    name = html.escape(user.full_name or user.username or "there")
    body = html.escape(message or get_maintenance_message()).replace("\n", "<br>")
    sites_html = "".join(f"<li>{html.escape(s)}</li>" for s in offline_sites) or "<li>Platform services</li>"
    draft_meta = draft_meta or get_maintenance_draft()
    when = _format_draft_time(draft_meta.get("drafted_at"))
    by = html.escape(draft_meta.get("drafted_by_name") or "DGC POS Platform")

    return f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1a1a2e;line-height:1.55">
      <div style="background:linear-gradient(135deg,#0B5FFF 0%,#1B2F5E 100%);padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:18px;color:#ffffff;font-weight:700">DGC POS — Maintenance Notice</h1>
      </div>
      <div style="border:1px solid #e8ecf0;border-top:none;padding:24px;border-radius:0 0 12px 12px;background:#ffffff">
        <p style="margin:0 0 12px">Hi <strong>{name}</strong>,</p>
        <p style="margin:0 0 16px">{body}</p>
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1B2F5E">Affected services</p>
        <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:#475569">{sites_html}</ul>
        <p style="margin:0 0 16px;font-size:13px;color:#64748b">
          You may not be able to sign in or use the app until maintenance is complete.
          We will restore service as soon as possible.
        </p>
        <p style="margin:0;font-size:12px;color:#94a3b8">Notice drafted {when} by {by} · DGC POS Platform</p>
      </div>
    </div>
    """


def send_maintenance_notifications(*, message: str = None, subject: str = None):
    """
    Email all active platform users in one shot.
    Returns summary dict for admin UI.
    """
    draft = get_maintenance_draft()
    msg = (message or draft.get("message") or get_maintenance_message()).strip()
    offline = _offline_sites()
    if not offline:
        offline = ["DGC POS platform"]

    subj = (subject or "").strip() or "DGC POS — maintenance notice (service temporarily unavailable)"

    recipients = maintenance_recipients()
    email_enabled = current_app.config.get("EMAIL_ENABLED", False)

    sent = 0
    failed = 0
    simulated = 0
    errors = []

    for user in recipients:
        html_body = _build_html(user=user, message=msg, offline_sites=offline, draft_meta=draft)
        ok, method = send_email(
            to_email=user.email,
            subject=subj,
            html=html_body,
            from_name="DGC POS",
        )
        if ok:
            sent += 1
            if method == "simulated_console":
                simulated += 1
        else:
            failed += 1
            if len(errors) < 5:
                errors.append({"email": user.email, "error": method})

    return {
        "ok": failed == 0 or sent > 0,
        "subject": subj,
        "message": msg,
        "drafted_at": draft.get("drafted_at"),
        "drafted_by_name": draft.get("drafted_by_name"),
        "offline_sites": offline,
        "total_recipients": len(recipients),
        "sent": sent,
        "failed": failed,
        "simulated": simulated,
        "email_configured": email_enabled or simulated == 0,
        "errors": errors,
    }