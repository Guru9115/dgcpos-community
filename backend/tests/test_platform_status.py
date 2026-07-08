"""Platform status + maintenance gate tests."""
import json


class TestPlatformStatus:
    def test_public_platform_status(self, client):
        res = client.get("/api/platform-status")
        assert res.status_code == 200
        data = res.get_json()
        assert "sites" in data
        assert "app" in data["sites"]
        assert "marketing" in data["sites"]
        assert "bazaar" in data["sites"]
        assert "maintenance_message" in data

    def test_admin_platform_status_requires_superadmin(self, client, auth_headers):
        res = client.get("/api/admin/platform-status", headers=auth_headers)
        assert res.status_code == 403

    def test_admin_platform_status_superadmin(self, client, app):
        from models import User, db

        with app.app_context():
            sa = User(username="sa_status", email="sa_status@test.local", role="superadmin", is_active=True)
            sa.set_password("sapass")
            db.session.add(sa)
            db.session.commit()

        login = client.post("/api/auth/login", json={"username": "sa_status", "password": "sapass"})
        token = login.get_json()["token"]
        res = client.get("/api/admin/platform-status", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.get_json()
        assert "services" in data
        assert "modules" in data
        assert "summary" in data
        assert "site_app" in data["modules"]