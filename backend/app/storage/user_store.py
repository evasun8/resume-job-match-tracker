"""backend/app/storage/user_store.py

Owned by tasks-database.md (DB-06). User account persistence: signup,
lookup by email, password hashing. Routes (tasks-backend.md BE-10/BE-11)
call only the functions below -- never touch the `users` table directly.
"""
import sqlite3
from datetime import datetime, timezone
from typing import Optional

import bcrypt
from cryptography.fernet import Fernet, InvalidToken

from app.config import ENCRYPTION_KEY
from app.storage.db import get_connection

_fernet = Fernet(ENCRYPTION_KEY.encode("utf-8"))


class EmailAlreadyExistsError(Exception):
    """Raised when signup is attempted with an email already in the users table."""


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password for storage. Never store/log the plaintext itself."""
    # bcrypt works on bytes and returns bytes; decode to store as TEXT in SQLite.
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Check a plaintext password attempt against a stored hash."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def create_user(email: str, password_hash: str) -> dict:
    """Insert a new user row. Raises EmailAlreadyExistsError on duplicate email."""
    conn = get_connection()
    try:
        now = datetime.now(timezone.utc).isoformat()
        try:
            cursor = conn.execute(
                "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
                (email, password_hash, now),
            )
            conn.commit()
        except sqlite3.IntegrityError as exc:
            raise EmailAlreadyExistsError(f"Email already registered: {email}") from exc

        return {
            "id": cursor.lastrowid,
            "email": email,
            "created_at": now,
        }
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[dict]:
    """Look up a user by email. Returns None if not found (never raises for a missing user)."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, email, password_hash, openai_api_key_encrypted, created_at "
            "FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Look up a user by id. Returns None if not found."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, email, password_hash, openai_api_key_encrypted, created_at "
            "FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def set_openai_api_key(user_id: int, plain_api_key: str) -> None:
    """Encrypt and store a user's personal OpenAI API key, replacing any prior one."""
    encrypted = _fernet.encrypt(plain_api_key.encode("utf-8")).decode("utf-8")
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE users SET openai_api_key_encrypted = ? WHERE id = ?",
            (encrypted, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_openai_api_key(user_id: int) -> Optional[str]:
    """Return a user's decrypted OpenAI API key, or None if they haven't set one."""
    user = get_user_by_id(user_id)
    if user is None or not user["openai_api_key_encrypted"]:
        return None
    try:
        return _fernet.decrypt(user["openai_api_key_encrypted"].encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # Encrypted with a different ENCRYPTION_KEY than the one currently
        # configured (e.g. key rotated without re-encrypting existing rows).
        # Treat as "no key set" rather than crashing the caller.
        return None


def masked_openai_api_key(user_id: int) -> Optional[str]:
    """Return a display-safe masked form (e.g. "sk-...abcd") of a user's key, or None."""
    key = get_openai_api_key(user_id)
    if key is None:
        return None
    return f"{key[:3]}...{key[-4:]}" if len(key) > 7 else "***"
