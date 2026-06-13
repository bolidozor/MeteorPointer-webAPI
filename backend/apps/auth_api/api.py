import base64
import secrets
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.utils import timezone as djtz
from ninja import Router

from apps.devices.crypto import verify_signature
from apps.devices.models import Device

from .jwt import issue_token
from .models import Challenge
from .schemas import ChallengeIn, ChallengeOut, TokenIn, TokenOut

router = Router()


@router.post("/challenge", response={200: ChallengeOut, 404: dict})
def create_challenge(request, payload: ChallengeIn):
    """Issue a short-lived nonce the device must sign to get a token."""
    device = Device.objects.filter(id=payload.device_id, revoked_at__isnull=True).first()
    if device is None:
        return 404, {"detail": "Unknown or revoked device"}
    nonce = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.CHALLENGE_TTL_SECONDS)
    Challenge.objects.create(device=device, nonce=nonce, expires_at=expires_at)
    return 200, {"nonce": nonce, "expires_at": expires_at.isoformat()}


@router.post("/token", response={200: TokenOut, 401: dict})
def create_token(request, payload: TokenIn):
    """Exchange a signed challenge for a short-lived access token."""
    challenge = (
        Challenge.objects.select_related("device")
        .filter(device_id=payload.device_id, nonce=payload.nonce, used_at__isnull=True)
        .first()
    )
    if challenge is None or challenge.expires_at < djtz.now():
        return 401, {"detail": "Invalid or expired challenge"}

    device = challenge.device
    if not device.is_active:
        return 401, {"detail": "Device revoked"}

    # The device signs the exact nonce string's UTF-8 bytes.
    if not verify_signature(device.public_key, payload.nonce.encode("utf-8"), payload.signature):
        return 401, {"detail": "Bad signature"}

    challenge.used_at = djtz.now()
    challenge.save(update_fields=["used_at"])
    device.last_seen_at = djtz.now()
    device.save(update_fields=["last_seen_at"])

    return 200, issue_token(device)
