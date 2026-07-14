"""Environment/config loading.

Loads OPENAI_API_KEY from the environment (via python-dotenv if a .env file is
present, falling back to plain os.environ). Never log or print the key value
anywhere in this module or elsewhere in the app.
"""
import os

from dotenv import load_dotenv

# Load a .env file if present (no-op if it doesn't exist). This must happen
# before we read OPENAI_API_KEY below.
load_dotenv()

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise RuntimeError(
        "OPENAI_API_KEY environment variable is not set. "
        "Set it in your shell or in a .env file before starting the app."
    )

JWT_SECRET = os.environ.get("JWT_SECRET")

if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET environment variable is not set. "
        "Set it in your shell or in a .env file before starting the app. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY")

if not ENCRYPTION_KEY:
    raise RuntimeError(
        "ENCRYPTION_KEY environment variable is not set. "
        "Set it in your shell or in a .env file before starting the app. "
        "Generate one with: python -c \"from cryptography.fernet import Fernet; "
        "print(Fernet.generate_key().decode())\""
    )

# Upload size limit in bytes (~5MB) per BE-09.
MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024

# LLM model used for match analysis.
LLM_MODEL = "gpt-4o-mini"

# "development" (default, e.g. local `npm run dev` / bare `uvicorn --reload`)
# or "production" (EC2, behind real HTTPS via nginx + Certbot). Controls
# whether the refresh cookie is marked Secure -- Secure cookies are only
# ever sent over HTTPS, which would silently break local dev testing over
# plain http://localhost if this were hardcoded to True everywhere.
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"
