"""Auth endpoints: signup, login, logout, refresh, me (BE-10, BE-11).

Token design: a short-lived access token (15 min) is returned in the JSON
body only -- the frontend keeps it in memory, never localStorage/cookies.
A long-lived refresh token (7 days) is set as an httpOnly, SameSite=Lax
cookie scoped to /api/auth -- the frontend never reads it directly; the
browser sends it automatically on requests to that path.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from app.config import IS_PRODUCTION
from app.dependencies import get_current_user_id
from app.services.auth_tokens import (
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.storage import user_store

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"
REFRESH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60  # 7 days, matches REFRESH_TOKEN_EXPIRE_DAYS


class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SetApiKeyRequest(BaseModel):
    openai_api_key: str


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=IS_PRODUCTION,  # Secure cookies only ever send over HTTPS -- True on EC2 (behind real TLS), False in local dev
        path=REFRESH_COOKIE_PATH,
        max_age=REFRESH_COOKIE_MAX_AGE_SECONDS,
    )


@router.post("/signup", status_code=201)
async def signup(body: SignupRequest, response: Response):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    password_hash = user_store.hash_password(body.password)
    try:
        user = user_store.create_user(email=body.email, password_hash=password_hash)
    except user_store.EmailAlreadyExistsError as exc:
        raise HTTPException(status_code=409, detail="Email already registered.") from exc

    access_token = create_access_token(user["id"])
    refresh_token = create_refresh_token(user["id"])
    _set_refresh_cookie(response, refresh_token)
    return {"access_token": access_token, "expires_in": 900}


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    user = user_store.get_user_by_email(body.email)
    # Deliberately generic error for both "no such user" and "wrong password" --
    # never reveal whether an email is registered (prevents enumeration).
    invalid_credentials = HTTPException(status_code=401, detail="Invalid email or password.")

    if user is None:
        raise invalid_credentials
    if not user_store.verify_password(body.password, user["password_hash"]):
        raise invalid_credentials

    access_token = create_access_token(user["id"])
    refresh_token = create_refresh_token(user["id"])
    _set_refresh_cookie(response, refresh_token)
    return {"access_token": access_token, "expires_in": 900}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return {"status": "ok"}


@router.post("/refresh")
async def refresh(request: Request):
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if refresh_token is None:
        raise HTTPException(status_code=401, detail="No refresh token provided.")

    try:
        user_id = decode_token(refresh_token, expected_type="refresh")
    except InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.") from exc

    access_token = create_access_token(user_id)
    return {"access_token": access_token, "expires_in": 900}


@router.get("/me")
async def me(user_id: int = Depends(get_current_user_id)):
    user = user_store.get_user_by_id(user_id)
    if user is None:
        # Token was valid but the user row is gone (shouldn't normally
        # happen) -- treat as unauthenticated rather than a 500.
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return {
        "id": user["id"],
        "email": user["email"],
        "openai_api_key_masked": user_store.masked_openai_api_key(user_id),
    }


@router.patch("/me")
async def update_settings(body: SetApiKeyRequest, user_id: int = Depends(get_current_user_id)):
    key = body.openai_api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="openai_api_key cannot be empty.")
    # Cheap sanity check, not full validation -- OpenAI keys are opaque
    # strings; the only real validation is trying to use it, which happens
    # lazily on the next job analysis, not here.
    if not key.startswith("sk-"):
        raise HTTPException(status_code=400, detail="That doesn't look like a valid OpenAI API key.")

    user_store.set_openai_api_key(user_id, key)
    return {"openai_api_key_masked": user_store.masked_openai_api_key(user_id)}
