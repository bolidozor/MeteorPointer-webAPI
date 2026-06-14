import hashlib
import secrets

# No ambiguous characters (no 0/O/1/I) — easy to read and type from a screen.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_user_code() -> str:
    """A short, human-typable code, e.g. ``K7Q2-9FRA``."""
    groups = ["".join(secrets.choice(_ALPHABET) for _ in range(4)) for _ in range(2)]
    return "-".join(groups)


def generate_secret() -> str:
    """A long URL-safe secret (device_code / session token)."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
