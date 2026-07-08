"""Security policy and session revocation tests."""
import pytest
from models import db, User, Account, Setting
from auth_utils import make_access_token, bump_security_epoch, user_security_epoch, authenticate_bearer_token
from security_policy import (
    is_public_api,
    menu_keys_for_api_path,
    menu_key_allowed_for_user,
    enforce_authenticated_policy,
)
from user_access_control import set_account_menu_permissions, set_merchant_service_enabled


@pytest.fixture
def tenant_user(app):
    with app.app_context():
        acc = Account(name="Sec Test Shop", business_type="retail")
        db.session.add(acc)
        db.session.flush()
        user = User(
            username="secstaff",
            email="secstaff@test.internal",
            full_name="Sec Staff",
            role="sales_staff",
            account_id=acc.id,
            is_active=True,
        )
        user.set_password("testpass123")
        db.session.add(user)
        db.session.commit()
        yield user, acc
        db.session.delete(user)
        db.session.delete(acc)
        db.session.commit()


def test_public_api_paths():
    assert is_public_api("/api/auth/login", "POST")
    assert is_public_api("/api/health", "GET")
    assert not is_public_api("/api/products", "GET")


def test_menu_key_mapping():
    assert menu_keys_for_api_path("/api/payables/summary") == ("payables",)
    assert menu_keys_for_api_path("/api/hospitality/rooms") == ("hotel_rooms",)
    assert "pos" in menu_keys_for_api_path("/api/sales")


def test_menu_restriction_blocks_api(app, tenant_user):
    user, acc = tenant_user
    with app.app_context():
        set_account_menu_permissions(acc.id, ["dashboard"])
        assert menu_key_allowed_for_user(user, "payables") is False
        assert menu_key_allowed_for_user(user, "dashboard") is True


def test_merchant_service_disabled_blocks(app, tenant_user):
    user, acc = tenant_user
    with app.app_context():
        set_merchant_service_enabled(acc.id, False)
        with app.test_request_context("/api/products"):
            resp = enforce_authenticated_policy(user, "/api/products")
        assert resp is not None
        assert resp[1] == 403


def test_security_epoch_revokes_jwt(app, tenant_user):
    user, acc = tenant_user
    with app.app_context():
        token = make_access_token(user)
        bump_security_epoch(user)
        db.session.commit()
        with app.test_request_context(headers={"Authorization": f"Bearer {token}"}):
            err = authenticate_bearer_token(required=True)
        assert err is not None
        assert err[1] == 401
        body = err[0].get_json()
        assert body.get("code") == "session_revoked"


def test_superadmin_not_assignable_via_validate(app, tenant_user):
    from routes.auth import _validate_assignable_role
    from flask_login import login_user

    user, _ = tenant_user
    with app.app_context():
        sa = User.query.filter_by(role="superadmin").first()
        if not sa:
            pytest.skip("no superadmin in test db")
        login_user(sa)
        result = _validate_assignable_role("superadmin")
        assert result[1] == 403