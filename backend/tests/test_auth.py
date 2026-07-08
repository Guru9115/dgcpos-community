"""Auth endpoint tests — login, token validation, user management."""
import pytest


class TestLogin:
    def test_login_success_returns_token(self, client):
        resp = client.post("/api/auth/login", json={"username": "owner", "password": "ownerpass"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "token" in data
        assert data["user"]["username"] == "owner"
        assert data["user"]["role"] == "owner"

    def test_login_wrong_password(self, client):
        resp = client.post("/api/auth/login", json={"username": "owner", "password": "wrongpass"})
        assert resp.status_code == 401

    def test_login_unknown_user(self, client):
        resp = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
        assert resp.status_code == 401

    def test_login_missing_fields(self, client):
        resp = client.post("/api/auth/login", json={"username": "owner"})
        assert resp.status_code == 422

    def test_login_empty_body(self, client):
        resp = client.post("/api/auth/login", json={})
        assert resp.status_code == 422

    def test_login_inactive_user(self, client, app):
        from models import db, User
        with app.app_context():
            u = User(username="inactive_tst", email="inactive@test.local",
                     full_name="Inactive", role="sales_staff", is_active=False)
            u.set_password("pass")
            db.session.add(u); db.session.commit()
        resp = client.post("/api/auth/login", json={"username": "inactive_tst", "password": "pass"})
        assert resp.status_code == 401


class TestTokenAuth:
    def test_protected_route_without_token(self, anon_client):
        resp = anon_client.get("/api/products/")
        assert resp.status_code == 401

    def test_protected_route_with_valid_token(self, anon_client, owner_token):
        resp = anon_client.get("/api/products/", headers={"Authorization": f"Bearer {owner_token}"})
        assert resp.status_code == 200

    def test_protected_route_with_bad_token(self, anon_client):
        resp = anon_client.get("/api/products/", headers={"Authorization": "Bearer not.a.token"})
        assert resp.status_code == 401

    def test_protected_route_malformed_header(self, anon_client):
        resp = anon_client.get("/api/products/", headers={"Authorization": "Token abc"})
        assert resp.status_code == 401


class TestUserManagement:
    def test_owner_can_create_user(self, client, auth_headers):
        resp = client.post("/api/auth/users", json={
            "username": "newstaff", "password": "Secure1234!", "full_name": "New Staff",
            "email": "newstaff@test.local", "role": "sales_staff"
        }, headers=auth_headers)
        assert resp.status_code in (200, 201)
        assert resp.get_json()["user"]["username"] == "newstaff"

    def test_owner_can_create_staff_without_email(self, client, auth_headers):
        resp = client.post("/api/auth/users", json={
            "username": "staff_no_email",
            "password": "Secure1234!",
            "full_name": "Counter Staff",
            "email": "",
            "role": "sales_staff",
        }, headers=auth_headers)
        assert resp.status_code == 201, resp.get_json()
        assert resp.get_json()["user"]["username"] == "staff_no_email"

    def test_owner_gets_clear_error_for_duplicate_staff_email(self, client, auth_headers, app):
        from models import db, User
        with app.app_context():
            taken = User.query.filter(User.email != "").first()
            if not taken:
                pytest.skip("No seeded user with email")
            dup_email = taken.email
        resp = client.post("/api/auth/users", json={
            "username": "staff_dup_email",
            "password": "Secure1234!",
            "full_name": "Dup Email Staff",
            "email": dup_email,
            "role": "sales_staff",
        }, headers=auth_headers)
        assert resp.status_code == 400
        assert resp.get_json().get("code") == "email_taken"

    def test_owner_cannot_create_superadmin(self, client, auth_headers):
        resp = client.post("/api/auth/users", json={
            "username": "fake_sa", "password": "Secure1234!", "full_name": "Fake SA",
            "email": "fakesa@test.local", "role": "superadmin",
        }, headers=auth_headers)
        assert resp.status_code == 403

    def test_owner_cannot_promote_to_superadmin(self, client, auth_headers):
        create = client.post("/api/auth/users", json={
            "username": "promotest", "password": "Secure1234!", "full_name": "Promo Test",
            "email": "promo@test.local", "role": "sales_staff",
        }, headers=auth_headers)
        uid = create.get_json()["user"]["id"]
        resp = client.put(f"/api/auth/users/{uid}", json={"role": "superadmin"}, headers=auth_headers)
        assert resp.status_code == 403

    def test_cashier_cannot_create_user(self, client, cashier_headers):
        resp = client.post("/api/auth/users", json={
            "username": "anotherstaff", "password": "Secure1234!", "full_name": "Another",
            "email": "another@test.local", "role": "sales_staff"
        }, headers=cashier_headers)
        assert resp.status_code == 403

    def test_create_user_duplicate_username(self, client, auth_headers):
        # Create once
        client.post("/api/auth/users", json={
            "username": "dupuser", "password": "Secure1234!", "full_name": "Dup",
            "email": "dup1@test.local", "role": "sales_staff"
        }, headers=auth_headers)
        # Create again — same username
        resp = client.post("/api/auth/users", json={
            "username": "dupuser", "password": "Secure1234!", "full_name": "Dup2",
            "email": "dup2@test.local", "role": "sales_staff"
        }, headers=auth_headers)
        assert resp.status_code in (400, 409, 422)

    def test_owner_can_list_users(self, client, auth_headers):
        resp = client.get("/api/auth/users", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)

    def test_cashier_cannot_list_users(self, client, cashier_headers):
        resp = client.get("/api/auth/users", headers=cashier_headers)
        assert resp.status_code == 403
