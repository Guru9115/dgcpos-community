from flask import Blueprint, request, jsonify, redirect, session, send_file
from flask_login import login_required, current_user
from auth_utils import token_required
from models import db, Setting
import os, shutil, json, base64, subprocess, sys, threading, io
from datetime import datetime

from backup_utils import create_backup_file, save_backup_local, ICLOUD_BACKUP_DIR, _is_sqlite
from backup_oauth import (
    authorization_url,
    exchange_code,
    credentials_configured,
    save_client_config,
    is_connected,
    connected_email,
    clear_token,
    upload_backup_to_drive,
    redirect_uri,
)
from email_service import send_email

ENABLE_SELF_UPDATE = os.environ.get("ENABLE_SELF_UPDATE", "false").lower() == "true"

settings_bp = Blueprint("settings", __name__)

@settings_bp.route("/", methods=["GET"])
@token_required
@login_required
def get_settings():
    account_id = getattr(current_user, "account_id", None)
    settings = {}
    global_settings = Setting.query.filter_by(account_id=None).all()
    for s in global_settings:
        settings[s.key] = s.value
    if account_id is not None:
        account_settings = Setting.query.filter_by(account_id=account_id).all()
        for s in account_settings:
            settings[s.key] = s.value
    if current_user.account:
        settings["shop_name"] = current_user.account.name
    return jsonify(settings)

@settings_bp.route("/", methods=["PUT"])
@token_required
@login_required
def update_settings():
    if current_user.role not in ["owner", "superadmin"]:
        return jsonify({"error":"Forbidden"}),403
    data = request.get_json() or {}
    account_id = None if current_user.role == "superadmin" else getattr(current_user, "account_id", None)
    for key, value in data.items():
        s = Setting.query.filter_by(key=key, account_id=account_id).first()
        if s:
            s.value = str(value)
        else:
            db.session.add(Setting(key=key, value=str(value), account_id=account_id))
        # For multi-tenant: sync shop_name to account name
        if key == "shop_name" and current_user.account:
            current_user.account.name = str(value)
    db.session.commit()
    # Return refreshed settings so clients can update UI without re-login
    settings = {}
    global_settings = Setting.query.filter_by(account_id=None).all()
    for s in global_settings:
        settings[s.key] = s.value
    if account_id is not None:
        for s in Setting.query.filter_by(account_id=account_id).all():
            settings[s.key] = s.value
    if current_user.account:
        settings["shop_name"] = current_user.account.name
    payload = {"message": "Settings saved", "settings": settings}
    if current_user.account:
        payload["account"] = current_user.account.to_dict()
    return jsonify(payload)

@settings_bp.route("/logo", methods=["POST"])
@token_required
@login_required
def upload_logo():
    if current_user.role not in ["owner", "superadmin"]:
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    logo_data = data.get("logo")  # base64 data URL
    if not logo_data:
        return jsonify({"error": "No logo data"}), 400
    account_id = None if current_user.role == "superadmin" else getattr(current_user, "account_id", None)
    s = Setting.query.filter_by(key="shop_logo", account_id=account_id).first()
    if s:
        s.value = logo_data
    else:
        db.session.add(Setting(key="shop_logo", value=logo_data, account_id=account_id))
    db.session.commit()
    return jsonify({"message": "Logo saved", "logo": logo_data})

@settings_bp.route("/version", methods=["GET"])
@token_required
@login_required
def get_version():
    # Primary: version_info.py is always bundled with the backend (auto-updated by bump-version.sh)
    try:
        from version_info import VERSION_INFO
        data = dict(VERSION_INFO)
    except ImportError:
        # Fallback: try version.json in various locations
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        candidates = [
            "/app/version.json",
            os.path.join(base, "version.json"),
            os.path.join(base, "..", "version.json"),
        ]
        version_file = next((c for c in candidates if os.path.isfile(c)), None)
        try:
            with open(version_file) as f:
                data = json.load(f)
        except Exception:
            data = {
                "version":    "1.0.10",
                "build":      "2026.06.10",
                "codename":   "Sapphire",
                "created_by": "GuruShah",
                "released":   "2026-06-10"
            }
    # Add git info if available
    try:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        git_log = subprocess.check_output(
            ["git", "log", "-1", "--format=%h|%s|%ci"],
            cwd=base, stderr=subprocess.DEVNULL
        ).decode().strip()
        parts = git_log.split("|")
        data["last_commit"] = {"hash": parts[0], "message": parts[1], "date": parts[2]}
        data["git_available"] = True
    except Exception:
        data["git_available"] = False
    return jsonify(data)

@settings_bp.route("/update/check", methods=["GET"])
@token_required
@login_required
def check_update():
    if current_user.role not in ["owner", "superadmin"]:
        return jsonify({"error": "Forbidden"}), 403
    if not ENABLE_SELF_UPDATE:
        return jsonify({"error": "Self-update disabled"}), 403
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    project_root = os.path.join(base, "..")
    result = {"can_update": False, "method": None, "message": ""}
    # Check git
    try:
        subprocess.check_output(["git", "fetch"], cwd=project_root, stderr=subprocess.DEVNULL)
        status = subprocess.check_output(
            ["git", "status", "-uno"], cwd=project_root, stderr=subprocess.DEVNULL
        ).decode()
        if "Your branch is behind" in status or "can be fast-forwarded" in status:
            log = subprocess.check_output(
                ["git", "log", "HEAD..origin/HEAD", "--oneline"],
                cwd=project_root, stderr=subprocess.DEVNULL
            ).decode().strip()
            result = {"can_update": True, "method": "git", "pending_commits": log}
        else:
            result = {"can_update": False, "method": "git", "message": "Already up to date"}
    except Exception:
        result = {"can_update": False, "method": "none", "message": "No git remote configured. Upload update package to apply."}
    return jsonify(result)

_update_log = []

@settings_bp.route("/update/apply", methods=["POST"])
@token_required
@login_required
def apply_update():
    if current_user.role not in ["owner", "superadmin"]:
        return jsonify({"error": "Forbidden"}), 403
    if not ENABLE_SELF_UPDATE:
        return jsonify({"error": "Self-update disabled"}), 403
    global _update_log
    _update_log = []
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    project_root = os.path.abspath(os.path.join(base, ".."))
    data = request.get_json() or {}
    method = data.get("method", "git")

    def run_update():
        global _update_log
        try:
            if method == "git":
                _update_log.append("📦 Pulling latest changes from server...")
                result = subprocess.run(
                    ["git", "pull"], cwd=project_root,
                    capture_output=True, text=True
                )
                _update_log.append(result.stdout or result.stderr)

                _update_log.append("🐍 Installing backend dependencies...")
                pip = os.path.join(base, "venv", "bin", "pip")
                if not os.path.exists(pip): pip = "pip3"
                subprocess.run([pip, "install", "-r", os.path.join(base, "requirements.txt")],
                               capture_output=True)
                _update_log.append("✅ Backend dependencies updated")

                _update_log.append("📦 Installing frontend dependencies...")
                frontend = os.path.join(project_root, "frontend")
                subprocess.run(["npm", "install", "--legacy-peer-deps"],
                               cwd=frontend, capture_output=True)
                _update_log.append("✅ Update complete! Restarting backend...")

                def restart():
                    import time; time.sleep(2)
                    os.execv(sys.executable, [sys.executable] + sys.argv)
                threading.Thread(target=restart, daemon=True).start()
            else:
                _update_log.append("❌ Unknown update method")
        except Exception as e:
            _update_log.append(f"❌ Error: {str(e)}")

    threading.Thread(target=run_update, daemon=True).start()
    return jsonify({"message": "Update started", "status": "running"})

@settings_bp.route("/update/log", methods=["GET"])
@token_required
@login_required
def update_log():
    return jsonify({"log": _update_log})

def _backup_role_ok() -> bool:
    return current_user.role in ("owner", "superadmin")


def _backup_account_id():
    aid = getattr(current_user, "account_id", None)
    if aid is None and current_user.role == "superadmin" and current_user.account:
        aid = current_user.account.id
    return aid


def _display_email(email: str | None) -> str:
    if not email or email.endswith("@staff.dgcpos.internal"):
        return ""
    return email


# ══════════════════════════════════════════════════
# DATA BACKUP — Google Drive, Gmail, iCloud / download
# ══════════════════════════════════════════════════

@settings_bp.route("/backup/status", methods=["GET"])
@token_required
@login_required
def backup_status():
    if not _backup_role_ok():
        return jsonify({"error": "Forbidden"}), 403
    account_id = _backup_account_id()
    gdrive_connected = False
    gdrive_email = None
    if account_id is not None:
        gdrive_connected = is_connected(account_id)
        if gdrive_connected:
            gdrive_email = connected_email(account_id)
    return jsonify({
        "format": "sqlite_db" if _is_sqlite() else "account_export",
        "icloud_available": os.path.isdir(ICLOUD_BACKUP_DIR),
        "credentials_configured": credentials_configured(),
        "redirect_uri": redirect_uri(),
        "owner_email": _display_email(getattr(current_user, "email", None)),
        "gdrive": {
            "connected": gdrive_connected,
            "email": gdrive_email,
        },
    })


@settings_bp.route("/backup", methods=["GET"])
@token_required
@login_required
def backup():
    if not _backup_role_ok():
        return jsonify({"error": "Forbidden"}), 403
    account_id = _backup_account_id()
    if account_id is None:
        return jsonify({"error": "no_account", "message": "No store account linked"}), 400
    try:
        result = save_backup_local(account_id)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    locs = " & ".join(result["locations"])
    return jsonify({
        "message": f"Backup saved to: {locs} ✅",
        "file": result["file"],
        "size": result["size"],
        "icloud": result["icloud_available"],
        "locations": result["locations"],
        "path": result["path"],
    })


@settings_bp.route("/backup/download", methods=["GET"])
@token_required
@login_required
def backup_download():
    if not _backup_role_ok():
        return jsonify({"error": "Forbidden"}), 403
    account_id = _backup_account_id()
    if account_id is None:
        return jsonify({"error": "no_account", "message": "No store account linked"}), 400
    try:
        name, mime, data = create_backup_file(account_id)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return send_file(
        io.BytesIO(data),
        mimetype=mime,
        as_attachment=True,
        download_name=name,
    )


@settings_bp.route("/backup/email", methods=["POST"])
@token_required
@login_required
def backup_email():
    if not _backup_role_ok():
        return jsonify({"error": "Forbidden"}), 403
    account_id = _backup_account_id()
    if account_id is None:
        return jsonify({"error": "no_account", "message": "No store account linked"}), 400
    body = request.get_json() or {}
    to_email = (body.get("email") or _display_email(current_user.email) or "").strip()
    if not to_email:
        return jsonify({"error": "missing_email", "message": "Enter a Gmail or email address"}), 400
    try:
        name, mime, data = create_backup_file(account_id)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    shop = current_user.account.name if current_user.account else "RetailOS"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#D4AF37;margin:0 0 12px">DG RetailOS Backup</h2>
      <p style="color:#444;line-height:1.5">
        Your store backup for <strong>{shop}</strong> is attached.
        Save it to Google Drive or iCloud Drive for safekeeping.
      </p>
      <p style="color:#888;font-size:13px">File: {name} ({len(data) // 1024} KB)</p>
    </div>
    """
    ok, method = send_email(
        to_email=to_email,
        subject=f"DG RetailOS backup — {shop}",
        html=html,
        attachment={"filename": name, "content": data, "mime": mime},
    )
    if not ok:
        return jsonify({"error": "send_failed", "message": method}), 500
    return jsonify({
        "message": f"Backup emailed to {to_email} ✅",
        "email": to_email,
        "file": name,
        "size": len(data),
        "method": method,
    })


@settings_bp.route("/gdrive/status", methods=["GET"])
@token_required
@login_required
def gdrive_status():
    account_id = _backup_account_id()
    if account_id is None:
        return jsonify({"connected": False, "email": None, "credentials_configured": credentials_configured()})
    connected = is_connected(account_id)
    email = connected_email(account_id) if connected else None
    return jsonify({
        "connected": connected,
        "email": email,
        "credentials_configured": credentials_configured(),
    })


@settings_bp.route("/gdrive/auth", methods=["GET"])
@token_required
@login_required
def gdrive_auth():
    if not _backup_role_ok():
        return jsonify({"error": "Forbidden"}), 403
    account_id = _backup_account_id()
    if account_id is None:
        return jsonify({"error": "no_account", "message": "No store account linked"}), 400
    if not credentials_configured():
        return jsonify({
            "error": "credentials_missing",
            "message": "Google OAuth credentials are not configured on the server",
        }), 400
    result = authorization_url()
    if not result:
        return jsonify({"error": "credentials_missing"}), 400
    auth_url, state = result
    session["gdrive_state"] = state
    session["gdrive_account_id"] = account_id
    return jsonify({"auth_url": auth_url})


@settings_bp.route("/gdrive/callback", methods=["GET"])
def gdrive_callback():
    from backup_oauth import save_token

    account_id = session.get("gdrive_account_id")
    if not account_id:
        return "<p>Session expired. Close this window and try Connect again from Settings.</p>", 400
    if not credentials_configured():
        return "<p>Missing Google OAuth credentials.</p>", 400
    try:
        creds = exchange_code(request.url, session.get("gdrive_state"))
        save_token(account_id, creds.to_json())
        db.session.commit()
    except Exception as e:
        return f"<p>Google sign-in failed: {e}</p>", 400
    return """
    <html><body style="font-family:sans-serif;background:#050608;color:#D4AF37;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center">
      <div style="font-size:48px">✅</div>
      <h2>Google Drive Connected!</h2>
      <p style="color:#888">You can close this window and go back to RetailOS Settings → Backup.</p>
      <script>setTimeout(()=>window.close(),2000)</script>
    </div></body></html>
    """


@settings_bp.route("/gdrive/disconnect", methods=["POST"])
@token_required
@login_required
def gdrive_disconnect():
    if not _backup_role_ok():
        return jsonify({"error": "Forbidden"}), 403
    account_id = _backup_account_id()
    if account_id is None:
        return jsonify({"error": "no_account"}), 400
    clear_token(account_id)
    db.session.commit()
    return jsonify({"message": "Disconnected from Google Drive"})


@settings_bp.route("/gdrive/upload-credentials", methods=["POST"])
@token_required
@login_required
def upload_credentials():
    if not _backup_role_ok():
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json()
    creds_json = data.get("credentials")
    if not creds_json:
        return jsonify({"error": "No credentials provided"}), 400
    try:
        parsed = json.loads(creds_json) if isinstance(creds_json, str) else creds_json
        if "installed" not in parsed and "web" not in parsed:
            return jsonify({"error": "Invalid credentials format"}), 400
        save_client_config(parsed)
        return jsonify({"message": "Credentials saved"})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@settings_bp.route("/gdrive/backup", methods=["POST"])
@token_required
@login_required
def gdrive_backup():
    if not _backup_role_ok():
        return jsonify({"error": "Forbidden"}), 403
    account_id = _backup_account_id()
    if account_id is None:
        return jsonify({"error": "no_account"}), 400
    if not is_connected(account_id):
        return jsonify({"error": "not_connected", "message": "Google Drive not connected"}), 400
    try:
        name, _mime, data = create_backup_file(account_id)
        uploaded = upload_backup_to_drive(account_id, name, data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({
        "message": "Backup uploaded to Google Drive ✅",
        **uploaded,
    })
