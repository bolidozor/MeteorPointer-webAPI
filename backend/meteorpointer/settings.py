"""Django settings for the MeteorPointer API.

12-factor: everything configurable is read from the environment.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # .../backend
REPO_DIR = BASE_DIR.parent                          # repo root (holds docs/)


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [x.strip() for x in os.environ.get(name, default).split(",") if x.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-secret-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)

# Public domain — set in the stack env when deployed behind the HTTPS proxy.
# It drives ALLOWED_HOSTS and CSRF automatically, so it's configured once.
# Empty (the default) = plain HTTP mode (e.g. local LAN testing).
DOMAIN = os.environ.get("DOMAIN", "").strip()

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,api")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "")
if DOMAIN:
    https_origin = f"https://{DOMAIN}"
    if https_origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(https_origin)
    # localhost is already in the default ALLOWED_HOSTS.
    if DOMAIN != "localhost" and DOMAIN not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(DOMAIN)

# Behind a TLS-terminating reverse proxy (Caddy): trust its X-Forwarded-Proto
# so Django treats forwarded requests as secure and builds https:// URLs.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# --- JWT (device access tokens) ---
JWT_SECRET = os.environ.get("JWT_SECRET", SECRET_KEY)
JWT_ALGORITHM = "HS256"
JWT_TTL_SECONDS = int(os.environ.get("JWT_TTL_SECONDS", "900"))      # 15 min
CHALLENGE_TTL_SECONDS = int(os.environ.get("CHALLENGE_TTL_SECONDS", "300"))  # 5 min

# --- Legal documents (consent / data license) ---
LEGAL_DIR = Path(os.environ.get("LEGAL_DIR", REPO_DIR / "docs" / "legal"))

# --- Web login (device flow) + session cookie (the API is its own BFF) ---
WEB_LOGIN_TTL_SECONDS = int(os.environ.get("WEB_LOGIN_TTL_SECONDS", "600"))           # 10 min
WEB_SESSION_TTL_SECONDS = int(os.environ.get("WEB_SESSION_TTL_SECONDS", str(7 * 24 * 3600)))
WEB_COOKIE_NAME = "mp_web_session"
WEB_COOKIE_SECURE = env_bool("WEB_COOKIE_SECURE", not DEBUG)
WEB_COOKIE_SAMESITE = os.environ.get("WEB_COOKIE_SAMESITE", "Lax")

# CORS — the web frontend calls the API from its own origin, with credentials.
CORS_ALLOWED_ORIGINS = env_list("DJANGO_CORS_ORIGINS", "")
CORS_ALLOW_CREDENTIALS = True
# Convenience for local/LAN testing of the frontend container (served on :8080).
CORS_ALLOWED_ORIGIN_REGEXES = env_list(
    "DJANGO_CORS_ORIGIN_REGEXES",
    r"^http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+):8080$",
)

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "corsheaders",
    "apps.core",
    "apps.devices",
    "apps.auth_api",
    "apps.ingest",
    "apps.legal",
    "apps.web",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "meteorpointer.urls"
ASGI_APPLICATION = "meteorpointer.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "meteorpointer"),
        "USER": os.environ.get("POSTGRES_USER", "meteorpointer"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "meteorpointer"),
        "HOST": os.environ.get("POSTGRES_HOST", "db"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

USE_TZ = True
TIME_ZONE = "UTC"
USE_I18N = False

LANGUAGE_CODE = "en-us"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
}
