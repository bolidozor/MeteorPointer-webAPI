"""Issue and verify short-lived device access tokens (JWT), and the Ninja
auth class used to protect endpoints."""
from datetime import UTC, datetime, timedelta

import jwt as pyjwt
from django.conf import settings
from ninja.security import HttpBearer

from apps.devices.models import Device


def issue_token(device: Device) -> dict:
    now = datetime.now(UTC)
    exp = now + timedelta(seconds=settings.JWT_TTL_SECONDS)
    payload = {
        "sub": str(device.id),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = pyjwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return {"access_token": token, "token_type": "Bearer", "expires_in": settings.JWT_TTL_SECONDS}


def decode_token(token: str) -> dict | None:
    try:
        return pyjwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except pyjwt.PyJWTError:
        return None


class DeviceAuth(HttpBearer):
    """Resolves a Bearer JWT to an active Device and attaches it to the request."""

    def authenticate(self, request, token):
        payload = decode_token(token)
        if not payload:
            return None
        device = Device.objects.filter(id=payload.get("sub"), revoked_at__isnull=True).first()
        if device is None:
            return None
        request.device = device
        return device


device_auth = DeviceAuth()
