"""backend/app/dependencies.py

Owned by tasks-backend.md (BE-11). FastAPI dependency that verifies the
access token on every protected route and yields the authenticated user_id.
"""
from fastapi import Header, HTTPException

from app.services.auth_tokens import InvalidTokenError, decode_token


async def get_current_user_id(authorization: str = Header(default=None)) -> int:
    """Extract and verify the access token from the Authorization header.

    Expects `Authorization: Bearer <token>`. Raises 401 uniformly for a
    missing header, wrong scheme, or any token verification failure
    (expired/tampered/wrong-type) -- callers never learn which.
    """
    unauthorized = HTTPException(status_code=401, detail="Not authenticated.")

    if authorization is None:
        raise unauthorized

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise unauthorized

    try:
        return decode_token(token, expected_type="access")
    except InvalidTokenError:
        raise unauthorized
