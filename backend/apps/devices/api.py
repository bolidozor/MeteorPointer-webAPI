from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from ninja import Router

from apps.auth_api.jwt import device_auth
from apps.legal.documents import verify_consent

from .crypto import (
    generate_recovery_phrase,
    hash_recovery_phrase,
    public_key_is_valid,
)
from .models import ConsentRecord, Device, RecoveryPhrase
from .schemas import (
    DeviceLabelIn,
    DeviceRecoverIn,
    DeviceRecoverOut,
    DeviceRegisterIn,
    DeviceRegisterOut,
    SimpleOk,
)

router = Router()


def _record_consent(device: Device, consent) -> None:
    accepted_at = parse_datetime(consent.accepted_at) or timezone.now()
    ConsentRecord.objects.create(
        device=device,
        consent_version=consent.version,
        license=consent.license,
        document_sha256=consent.document_sha256,
        locale=consent.locale,
        app_version=consent.app_version,
        accepted_at=accepted_at,
    )
    device.current_consent_version = consent.version
    device.current_consent_at = timezone.now()
    device.save(update_fields=["current_consent_version", "current_consent_at"])


@router.post("", response={201: DeviceRegisterOut, 400: dict, 409: dict})
def register_device(request, payload: DeviceRegisterIn):
    """Register a new anonymous device. Requires a valid consent block."""
    if not public_key_is_valid(payload.public_key):
        return 400, {"detail": "Invalid public key"}
    if not verify_consent(
        payload.consent.version, payload.consent.document_sha256, payload.consent.locale
    ):
        return 409, {"detail": "Consent document out of date; fetch the current version"}

    phrase = generate_recovery_phrase()
    with transaction.atomic():
        device = Device.objects.create(public_key=payload.public_key, label=payload.label)
        RecoveryPhrase.objects.create(device=device, phrase_hash=hash_recovery_phrase(phrase))
        _record_consent(device, payload.consent)

    return 201, {"device_id": str(device.id), "recovery_phrase": phrase}


@router.post("/recover", response={200: DeviceRecoverOut, 400: dict, 404: dict, 409: dict})
def recover_device(request, payload: DeviceRecoverIn):
    """Re-bind a device identity to a new key using the recovery phrase."""
    if not public_key_is_valid(payload.public_key):
        return 400, {"detail": "Invalid public key"}
    if not verify_consent(
        payload.consent.version, payload.consent.document_sha256, payload.consent.locale
    ):
        return 409, {"detail": "Consent document out of date; fetch the current version"}

    rec = (
        RecoveryPhrase.objects.select_related("device")
        .filter(phrase_hash=hash_recovery_phrase(payload.recovery_phrase))
        .first()
    )
    if rec is None:
        return 404, {"detail": "Unknown recovery phrase"}

    device = rec.device
    with transaction.atomic():
        device.public_key = payload.public_key
        device.revoked_at = None  # recovery re-activates the identity
        if payload.label:
            device.label = payload.label
        device.save(update_fields=["public_key", "revoked_at", "label"])
        rec.used_at = timezone.now()
        rec.save(update_fields=["used_at"])
        _record_consent(device, payload.consent)

    return 200, {"device_id": str(device.id)}


@router.patch("/{device_id}/label", auth=device_auth, response={200: SimpleOk, 403: dict})
def update_label(request, device_id: str, payload: DeviceLabelIn):
    """Update the display name (label) of the calling device.

    The label is shown publicly on the web as the observer name. It can be set
    on registration/recovery and changed at any time via this endpoint.
    """
    if str(request.device.id) != device_id:
        return 403, {"detail": "Can only update your own label"}
    request.device.label = payload.label.strip()[:120]
    request.device.save(update_fields=["label"])
    return 200, SimpleOk()


@router.post("/{device_id}/revoke", auth=device_auth, response={200: SimpleOk, 403: dict})
def revoke_device(request, device_id: str):
    """Revoke the calling device (must authenticate as itself)."""
    if str(request.device.id) != device_id:
        return 403, {"detail": "Can only revoke your own device"}
    request.device.revoked_at = timezone.now()
    request.device.save(update_fields=["revoked_at"])
    return 200, SimpleOk()


@router.delete("/{device_id}/data", auth=device_auth, response={200: dict, 403: dict})
def delete_device_data(request, device_id: str):
    """Delete all measurement data of the calling device (Play data-deletion)."""
    if str(request.device.id) != device_id:
        return 403, {"detail": "Can only delete your own data"}
    deleted, _ = request.device.raw_ingests.all().delete()
    return 200, {"deleted": deleted}


@router.delete("/{device_id}", auth=device_auth, response={200: SimpleOk, 403: dict})
def delete_device(request, device_id: str):
    """Delete the device identity and all associated data (account deletion)."""
    if str(request.device.id) != device_id:
        return 403, {"detail": "Can only delete your own device"}
    request.device.delete()  # cascades to consents, recovery phrases, ingests
    return 200, SimpleOk()
