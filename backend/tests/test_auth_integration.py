"""Integration-level auth tests (BE-13): full HTTP round trips through
TestClient against a real (temporary, per-test) SQLite database.
"""


def auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


class TestSignup:
    def test_signup_succeeds(self, client):
        resp = client.post(
            "/api/auth/signup", json={"email": "new@example.com", "password": "testpass123"}
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "access_token" in body
        assert body["expires_in"] == 900

    def test_signup_sets_httponly_refresh_cookie(self, client):
        resp = client.post(
            "/api/auth/signup", json={"email": "cookie@example.com", "password": "testpass123"}
        )
        assert "refresh_token" in resp.cookies
        set_cookie_header = resp.headers.get("set-cookie", "")
        assert "HttpOnly" in set_cookie_header
        # The refresh token must never appear in the JSON body -- only in
        # the Set-Cookie header.
        assert "refresh_token" not in resp.json()

    def test_duplicate_email_returns_409(self, client):
        client.post(
            "/api/auth/signup", json={"email": "dup@example.com", "password": "testpass123"}
        )
        resp = client.post(
            "/api/auth/signup", json={"email": "dup@example.com", "password": "testpass123"}
        )
        assert resp.status_code == 409

    def test_short_password_rejected(self, client):
        resp = client.post(
            "/api/auth/signup", json={"email": "short@example.com", "password": "abc"}
        )
        assert resp.status_code == 400


class TestLogin:
    def test_login_with_correct_credentials_succeeds(self, client):
        client.post(
            "/api/auth/signup", json={"email": "login@example.com", "password": "testpass123"}
        )
        resp = client.post(
            "/api/auth/login", json={"email": "login@example.com", "password": "testpass123"}
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_with_wrong_password_returns_401(self, client):
        client.post(
            "/api/auth/signup", json={"email": "login2@example.com", "password": "testpass123"}
        )
        resp = client.post(
            "/api/auth/login", json={"email": "login2@example.com", "password": "wrongpassword"}
        )
        assert resp.status_code == 401

    def test_login_with_nonexistent_email_returns_401(self, client):
        resp = client.post(
            "/api/auth/login", json={"email": "nobody@example.com", "password": "whatever123"}
        )
        assert resp.status_code == 401

    def test_wrong_password_and_nonexistent_email_give_identical_error(self, client):
        # The core "don't reveal whether an email is registered" guarantee.
        client.post(
            "/api/auth/signup", json={"email": "exists@example.com", "password": "testpass123"}
        )
        wrong_password_resp = client.post(
            "/api/auth/login", json={"email": "exists@example.com", "password": "wrongpassword"}
        )
        no_such_user_resp = client.post(
            "/api/auth/login", json={"email": "doesnotexist@example.com", "password": "whatever"}
        )
        assert wrong_password_resp.status_code == no_such_user_resp.status_code == 401
        assert wrong_password_resp.json()["detail"] == no_such_user_resp.json()["detail"]


class TestProtectedEndpoints:
    def test_no_token_returns_401(self, client):
        resp = client.get("/api/resume")
        assert resp.status_code == 401

    def test_malformed_auth_header_returns_401(self, client):
        resp = client.get("/api/resume", headers={"Authorization": "NotBearer sometoken"})
        assert resp.status_code == 401

    def test_valid_token_is_accepted(self, signed_up_user):
        client, access_token, _, _ = signed_up_user
        resp = client.get("/api/resume", headers=auth_headers(access_token))
        # 404 (no resume uploaded yet) proves auth passed -- a 401 would
        # mean the token was rejected before reaching the route body.
        assert resp.status_code == 404

    def test_refresh_token_cannot_be_used_as_access_token(self, client):
        signup_resp = client.post(
            "/api/auth/signup", json={"email": "typetest@example.com", "password": "testpass123"}
        )
        refresh_token = signup_resp.cookies["refresh_token"]
        resp = client.get("/api/resume", headers=auth_headers(refresh_token))
        assert resp.status_code == 401


class TestRefreshFlow:
    def test_refresh_with_valid_cookie_returns_new_access_token(self, client):
        client.post(
            "/api/auth/signup", json={"email": "refresh@example.com", "password": "testpass123"}
        )
        # TestClient persists cookies across requests on the same client
        # instance, same as a real browser would.
        resp = client.post("/api/auth/refresh")
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_refresh_with_no_cookie_returns_401(self, client):
        resp = client.post("/api/auth/refresh")
        assert resp.status_code == 401

    def test_access_token_cannot_be_used_as_refresh_cookie(self, signed_up_user):
        client, access_token, _, _ = signed_up_user
        client.cookies.clear()
        client.cookies.set("refresh_token", access_token)
        resp = client.post("/api/auth/refresh")
        assert resp.status_code == 401

    def test_logout_clears_refresh_cookie(self, client):
        client.post(
            "/api/auth/signup", json={"email": "logout@example.com", "password": "testpass123"}
        )
        client.post("/api/auth/logout")
        resp = client.post("/api/auth/refresh")
        assert resp.status_code == 401


class TestMeEndpoint:
    def test_me_returns_correct_identity(self, signed_up_user):
        client, access_token, email, _ = signed_up_user
        resp = client.get("/api/auth/me", headers=auth_headers(access_token))
        assert resp.status_code == 200
        assert resp.json()["email"] == email

    def test_me_without_token_returns_401(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401
