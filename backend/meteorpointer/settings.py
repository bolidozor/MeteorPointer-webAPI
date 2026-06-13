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
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,api")

# --- JWT (device access tokens) ---
JWT_SECRET = os.environ.get("JWT_SECRET", SECRET_KEY)
JWT_ALGORITHM = "HS256"
JWT_TTL_SECONDS = int(os.environ.get("JWT_TTL_SECONDS", "900"))      # 15 min
CHALLENGE_TTL_SECONDS = int(os.environ.get("CHALLENGE_TTL_SECONDS", "300"))  # 5 min

# --- Legal documents (consent / data license) ---
LEGAL_DIR = Path(os.environ.get("LEGAL_DIR", REPO_DIR / "docs" / "legal"))

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "apps.core",
    "apps.devices",
    "apps.auth_api",
    "apps.ingest",
    "apps.legal",
]

MIDDLEWARE = [
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
