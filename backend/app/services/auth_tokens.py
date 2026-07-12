"""backend/app/services/auth_tokens.py

Owned by tasks-backend.md (BE-10/BE-11). JWT encode/decode helpers shared by
the auth router (issuing tokens) and the auth dependency (verifying them).
Two token types exist -- "access" (short-lived, sent in the Authorization
header) and "refresh" (long-lived, sent only via the httpOnly cookie) -- and
the `type` claim is what stops one being used in place of the other.
"""
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt

from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_SECRET, REFRESH_TOKEN_EXPIRE_DAYS

ALGORITHM = "HS256"

TokenType = Literal["access", "refresh"]


class InvalidTokenError(Exception):
    """Raised for any token that fails signature/expiry/type verification."""


def _create_token(user_id: int, token_type: TokenType, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def create_access_token(user_id: int) -> str:
    return _create_token(user_id, "access", timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(user_id: int) -> str:
    return _create_token(user_id, "refresh", timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))


def decode_token(token: str, expected_type: TokenType) -> int:
    """Verify a token's signature, expiry, and type. Returns the user_id (as int).

    Raises InvalidTokenError for any failure -- bad signature, expired,
    malformed, or a token of the wrong type presented (e.g. a refresh token
    passed where an access token is expected). Callers should treat this
    uniformly as "not authenticated," not branch on the specific cause.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc

    if payload.get("type") != expected_type:
        raise InvalidTokenError(f"Expected a {expected_type} token, got {payload.get('type')!r}")

    try:
        return int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise InvalidTokenError("Token missing a valid subject claim") from exc
