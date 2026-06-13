from django.db import IntegrityError, transaction
from ninja import Router

from apps.auth_api.jwt import device_auth

from .models import RawIngest
from .schemas import BatchIn, BatchOut, IngestRow

router = Router(auth=device_auth)


@router.post("", response={202: BatchOut})
def upload_reports(request, payload: BatchIn):
    """Accept a batch of measurements and persist them durably.

    Does only two things: authenticate (router auth) and store each raw payload.
    No parsing/validation of the measurement content happens here, so a parser
    bug can never break the upload. Returns 202 (received, not yet processed).
    Idempotent per item on (device, client_key).
    """
    device = request.device
    results = []
    accepted = duplicates = 0

    for item in payload.reports:
        try:
            with transaction.atomic():
                RawIngest.objects.create(
                    device=device,
                    client_key=item.client_key,
                    payload=item.payload,
                )
            accepted += 1
            results.append({"client_key": item.client_key, "status": "accepted"})
        except IntegrityError:
            # Already received this client_key for this device — safe duplicate.
            duplicates += 1
            results.append({"client_key": item.client_key, "status": "duplicate"})

    return 202, {"accepted": accepted, "duplicates": duplicates, "results": results}


@router.get("", response=list[IngestRow])
def list_reports(request):
    """List the calling device's uploaded measurements (as received)."""
    rows = request.device.raw_ingests.all()
    return [
        {
            "client_key": r.client_key,
            "status": r.status,
            "received_at": r.received_at.isoformat(),
        }
        for r in rows
    ]


@router.delete("/{client_key}", response={200: dict})
def delete_report(request, client_key: str):
    """Delete one of the calling device's measurements by client_key."""
    deleted, _ = request.device.raw_ingests.filter(client_key=client_key).delete()
    return 200, {"deleted": deleted}
