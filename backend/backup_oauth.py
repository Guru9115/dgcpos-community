"""Per-account Google OAuth for Drive backup (optional Gmail API)."""
from __future__ import annotations

import json
import os

from models import Setting, db

GDRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
]
TOKEN_SETTING_KEY = "google_backup_token"
CREDS_FILE = os.path.join(os.path.dirname(__file__), "gdrive_credentials.json")


def api_public_url() -> str:
    explicit = (os.environ.get("API_PUBLIC_URL") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    frontend = (os.environ.get("FRONTEND_URL") or "https://api.dgcpos.com").strip()
    if "api." in frontend:
        return frontend.rstrip("/")
    return frontend.replace("app.dgcpos.com", "api.dgcpos.com").rstrip("/")


def redirect_uri() -> str:
    explicit = os.environ.get("GOOGLE_BACKUP_REDIRECT_URI")
    if explicit:
        return explicit.rstrip("/")
    return f"{api_public_url()}/api/settings/gdrive/callback"


def load_client_config() -> dict | None:
    raw = os.environ.get("GOOGLE_BACKUP_CREDENTIALS_JSON", "").strip()
    if raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass
    if os.path.exists(CREDS_FILE):
        with open(CREDS_FILE) as f:
            return json.load(f)
    return None


def credentials_configured() -> bool:
    return load_client_config() is not None


def save_client_config(parsed: dict) -> None:
    with open(CREDS_FILE, "w") as f:
        json.dump(parsed, f)


def create_flow(state: str | None = None):
    from google_auth_oauthlib.flow import Flow

    cfg = load_client_config()
    if not cfg:
        return None
    return Flow.from_client_config(
        cfg,
        scopes=GDRIVE_SCOPES,
        redirect_uri=redirect_uri(),
        state=state,
    )


def authorization_url() -> tuple[str, str] | None:
    flow = create_flow()
    if not flow:
        return None
    url, state = flow.authorization_url(access_type="offline", prompt="consent")
    return url, state


def exchange_code(authorization_response: str, state: str | None):
    flow = create_flow(state=state)
    if not flow:
        raise ValueError("Google OAuth credentials not configured")
    flow.fetch_token(authorization_response=authorization_response)
    return flow.credentials


def is_connected(account_id: int) -> bool:
    return get_token_json(account_id) is not None


def _token_setting(account_id: int):
    return Setting.query.filter_by(key=TOKEN_SETTING_KEY, account_id=account_id).first()


def get_token_json(account_id: int) -> dict | None:
    s = _token_setting(account_id)
    if not s or not s.value:
        return None
    try:
        return json.loads(s.value)
    except (json.JSONDecodeError, TypeError):
        return None


def save_token(account_id: int, creds_json: str):
    s = _token_setting(account_id)
    if s:
        s.value = creds_json
        s.type = "json"
    else:
        db.session.add(Setting(
            key=TOKEN_SETTING_KEY,
            value=creds_json,
            account_id=account_id,
            type="json",
        ))


def clear_token(account_id: int):
    s = _token_setting(account_id)
    if s:
        db.session.delete(s)


def get_drive_service(account_id: int):
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from google.auth.transport.requests import Request

    token = get_token_json(account_id)
    if not token:
        return None
    creds = Credentials.from_authorized_user_info(token, GDRIVE_SCOPES)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            save_token(account_id, creds.to_json())
            db.session.commit()
        else:
            return None
    return build("drive", "v3", credentials=creds)


def connected_email(account_id: int) -> str | None:
    svc = get_drive_service(account_id)
    if not svc:
        return None
    try:
        info = svc.about().get(fields="user").execute()
        return info.get("user", {}).get("emailAddress")
    except Exception:
        return None


def upload_backup_to_drive(account_id: int, filename: str, data: bytes) -> dict:
    from googleapiclient.http import MediaIoBaseUpload
    import io

    svc = get_drive_service(account_id)
    if not svc:
        raise ValueError("Google Drive not connected")

    folder_name = "DG RetailOS Backups"
    res = svc.files().list(
        q=f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields="files(id)",
    ).execute()
    if res.get("files"):
        folder_id = res["files"][0]["id"]
    else:
        folder = svc.files().create(
            body={"name": folder_name, "mimeType": "application/vnd.google-apps.folder"},
            fields="id",
        ).execute()
        folder_id = folder["id"]

    media = MediaIoBaseUpload(io.BytesIO(data), mimetype="application/octet-stream", resumable=True)
    uploaded = svc.files().create(
        body={"name": filename, "parents": [folder_id]},
        media_body=media,
        fields="id,name,size,webViewLink",
    ).execute()
    return {
        "file": uploaded.get("name"),
        "size": int(uploaded.get("size") or len(data)),
        "link": uploaded.get("webViewLink", ""),
        "folder": folder_name,
    }