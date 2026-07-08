"""Signup access policy enforcement tests."""
from models import Setting


def _set_policy(app, **kwargs):
    with app.app_context():
        from access_policy import update_access_policy
        from models import db
        update_access_policy(kwargs)
        db.session.commit()


def _beta_payload(country="Nepal", email="lead@test.local"):
    return {
        "email": email,
        "first_name": "Test",
        "surname": "User",
        "country": country,
        "phone": "+9779812345678",
        "business_name": "Test Store",
        "business_type": "General Retail",
    }


class TestAccessPolicyEnforcement:
    def test_nepal_only_blocks_international(self, client, app):
        _set_policy(app, access_policy="nepal_only", signup_open=True)
        resp = client.post("/api/onboarding/beta-interest", json=_beta_payload(country="United States", email="us@test.local"))
        assert resp.status_code == 403
        assert "Nepal" in resp.get_json()["error"]

    def test_nepal_only_allows_nepal(self, client, app):
        _set_policy(app, access_policy="nepal_only", signup_open=True)
        resp = client.post("/api/onboarding/beta-interest", json=_beta_payload(country="Nepal", email="np@test.local"))
        assert resp.status_code == 201
        assert resp.get_json().get("enrollment_token")

    def test_manual_only_pending_review(self, client, app):
        _set_policy(app, access_policy="manual_only", signup_open=True)
        resp = client.post("/api/onboarding/beta-interest", json=_beta_payload(country="Germany", email="de@test.local"))
        assert resp.status_code == 202
        data = resp.get_json()
        assert data.get("pending_review") is True
        assert "enrollment_token" not in data

    def test_signup_closed(self, client, app):
        _set_policy(app, access_policy="worldwide", signup_open=False)
        resp = client.post("/api/onboarding/beta-interest", json=_beta_payload(country="Nepal", email="closed@test.local"))
        assert resp.status_code == 403
        assert "closed" in resp.get_json()["error"].lower()


class TestAdminAccessPolicy:
    def _superadmin_token(self, client, app, username="sa_policy"):
        from models import db, User
        with app.app_context():
            sa = User(username=username, email=f"{username}@test.local", role="superadmin", is_active=True)
            sa.set_password("sapass")
            db.session.add(sa)
            db.session.commit()
        login = client.post("/api/auth/login", json={"username": username, "password": "sapass"})
        return login.get_json()["token"]

    def test_get_access_policy(self, client, app):
        token = self._superadmin_token(client, app, "sa_get_policy")
        resp = client.get("/api/admin/access-policy", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "access_policy" in data
        assert "signup_open" in data

    def test_update_access_policy(self, client, app):
        token = self._superadmin_token(client, app, "sa_put_policy")
        resp = client.put(
            "/api/admin/access-policy",
            headers={"Authorization": f"Bearer {token}"},
            json={"access_policy": "manual_only", "signup_open": True, "signup_daily_limit": 5},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["access_policy"] == "manual_only"
        assert data["signup_daily_limit"] == 5

        with app.app_context():
            s = Setting.query.filter_by(key="access_policy", account_id=None).first()
            assert s.value == "manual_only"

    def test_non_superadmin_denied(self, client, auth_headers):
        resp = client.get("/api/admin/access-policy", headers=auth_headers)
        assert resp.status_code == 403