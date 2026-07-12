"""Unit-level auth tests (BE-13): password hashing and JWT encode/decode in
isolation, no HTTP layer, no database.
"""
import pytest

from app.services.auth_tokens import InvalidTokenError, create_access_token, create_refresh_token, decode_token
from app.storage.user_store import hash_password, verify_password


class TestPasswordHashing:
    def test_hash_is_not_the_plaintext(self):
        hashed = hash_password("correct horse battery staple")
        assert hashed != "correct horse battery staple"

    def test_verify_succeeds_with_correct_password(self):
        hashed = hash_password("correct horse battery staple")
        assert verify_password("correct horse battery staple", hashed) is True

    def test_verify_fails_with_wrong_password(self):
        hashed = hash_password("correct horse battery staple")
        assert verify_password("wrong password", hashed) is False

    def test_same_password_hashed_twice_produces_different_hashes(self):
        # bcrypt salts each hash randomly -- two users with the same
        # password must not have identical hashes (defeats rainbow tables).
        h1 = hash_password("identical-password")
        h2 = hash_password("identical-password")
        assert h1 != h2
        assert verify_password("identical-password", h1) is True
        assert verify_password("identical-password", h2) is True


class TestJwtTokens:
    def test_access_token_decodes_to_correct_user_id(self):
        token = create_access_token(user_id=42)
        assert decode_token(token, expected_type="access") == 42

    def test_refresh_token_decodes_to_correct_user_id(self):
        token = create_refresh_token(user_id=42)
        assert decode_token(token, expected_type="refresh") == 42

    def test_access_token_rejected_when_refresh_expected(self):
        # This is the core type-confusion guard: an access token must never
        # be usable where a refresh token is expected, or vice versa.
        token = create_access_token(user_id=42)
        with pytest.raises(InvalidTokenError):
            decode_token(token, expected_type="refresh")

    def test_refresh_token_rejected_when_access_expected(self):
        token = create_refresh_token(user_id=42)
        with pytest.raises(InvalidTokenError):
            decode_token(token, expected_type="access")

    def test_tampered_token_is_rejected(self):
        token = create_access_token(user_id=42)
        tampered = token[:-4] + ("0000" if token[-4:] != "0000" else "1111")
        with pytest.raises(InvalidTokenError):
            decode_token(tampered, expected_type="access")

    def test_malformed_token_is_rejected(self):
        with pytest.raises(InvalidTokenError):
            decode_token("not-a-real-jwt-at-all", expected_type="access")
