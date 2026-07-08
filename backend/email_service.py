"""Transactional email via Brevo API with SMTP fallback."""
import base64
import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _from_email():
    return (
        os.environ.get("BREVO_FROM_EMAIL")
        or os.environ.get("SMTP_FROM_EMAIL")
        or os.environ.get("SENDER_EMAIL")
        or "sales.dgcollection@gmail.com"
    )


def send_email(*, to_email, subject, html, from_name="D&G Collection RetailOS", attachment=None):
    """Send HTML email. Optional attachment: {filename, content (bytes), mime?}."""
    to_email = (to_email or "").strip()
    if not to_email:
        return False, "missing recipient"

    brevo_key = os.environ.get("BREVO_API_KEY", "")
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS") or os.environ.get("SMTP_PASSWORD", "")
    from_email = _from_email()

    if not brevo_key and not smtp_pass:
        size = len(attachment["content"]) if attachment else 0
        print(
            f"[EMAIL SIMULATED] To: {to_email}\nSubject: {subject}\n"
            f"Attachment: {attachment['filename'] if attachment else 'none'} ({size} bytes)\n"
            f"{html[:1200]}"
        )
        return True, "simulated_console"

    payload_dict = {
        "sender": {"name": from_name, "email": from_email},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html,
    }
    if attachment:
        payload_dict["attachment"] = [{
            "content": base64.b64encode(attachment["content"]).decode("ascii"),
            "name": attachment["filename"],
        }]
    payload = json.dumps(payload_dict).encode("utf-8")

    if brevo_key:
        try:
            req = urllib.request.Request(
                "https://api.brevo.com/v3/smtp/email",
                data=payload,
                headers={
                    "api-key": brevo_key,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                resp.read()
            return True, "brevo_api"
        except urllib.error.HTTPError as e:
            try:
                body = e.read().decode("utf-8")[:300]
            except Exception:
                body = str(e)
            last_error = f"API:{e.code} {body}"
        except Exception as e:
            last_error = f"API:{str(e)}"
    else:
        last_error = "no brevo key"

    msg = MIMEMultipart("mixed" if attachment else "alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html"))
    if attachment:
        part = MIMEBase(*(attachment.get("mime", "application/octet-stream").split("/", 1)))
        part.set_payload(attachment["content"])
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition",
            "attachment",
            filename=attachment["filename"],
        )
        msg.attach(part)

    if smtp_pass:
        for port, use_ssl in [(465, True), (587, False), (2525, False)]:
            try:
                if use_ssl:
                    ctx = ssl.create_default_context()
                    with smtplib.SMTP_SSL("smtp-relay.brevo.com", port, timeout=10, context=ctx) as s:
                        s.login(smtp_user, smtp_pass)
                        s.sendmail(from_email, to_email, msg.as_string())
                else:
                    with smtplib.SMTP("smtp-relay.brevo.com", port, timeout=10) as s:
                        s.starttls()
                        s.login(smtp_user, smtp_pass)
                        s.sendmail(from_email, to_email, msg.as_string())
                return True, f"smtp_{port}"
            except Exception as e:
                last_error = f"SMTP{port}:{e}"

    return False, last_error


def send_stay_booking_confirmation(*, to_email, guest_name, booking, order, post):
    """Send guest a tentative/confirmed bazaar stay reservation receipt."""
    prop_name = booking.hotel_property.name if booking.hotel_property else (post.title or "Your stay")
    status_label = "Confirmed" if booking.status == "confirmed" else "Pending confirmation"
    total = float(booking.total_amount or order.total_amount or 0)
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <h2 style="margin:0 0 8px;">Your DGC Bazaar stay reservation</h2>
      <p style="color:#555;">Hi {guest_name or 'Guest'},</p>
      <p>We received your booking request for <strong>{prop_name}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px 0;color:#666;">Room</td><td style="padding:8px 0;"><strong>{post.title}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666;">Check-in</td><td style="padding:8px 0;"><strong>{booking.check_in_date}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666;">Check-out</td><td style="padding:8px 0;"><strong>{booking.check_out_date}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666;">Nights</td><td style="padding:8px 0;">{booking.nights}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">Guests</td><td style="padding:8px 0;">{booking.adults}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">Total</td><td style="padding:8px 0;"><strong>Rs {total:,.2f}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666;">Booking ref</td><td style="padding:8px 0;">{booking.booking_number}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">Order</td><td style="padding:8px 0;">{order.order_number}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">Status</td><td style="padding:8px 0;">{status_label}</td></tr>
      </table>
      <p style="color:#555;font-size:14px;">
        The property will contact you at <strong>{booking.guest_phone or order.delivery_phone}</strong> to confirm your stay.
      </p>
      <p style="color:#888;font-size:12px;">DGC Bazaar · D&G Collection RetailOS</p>
    </div>
    """
    return send_email(
        to_email=to_email,
        subject=f"Stay reservation {booking.booking_number} — {prop_name}",
        html=html,
        from_name="DGC Bazaar",
    )