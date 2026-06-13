import uuid

from django.db import models

from apps.devices.models import Device


class RawIngest(models.Model):
    """Bulletproof landing zone for measurements uploaded by the mobile app.

    The upload path only authenticates and writes a row here, then returns 202.
    Parsing/validation into scientific records happens later and separately;
    a failure there never affects the upload. Raw payloads are never discarded.

    Idempotency: (device, client_key) is unique, where client_key is the
    mobile's own report id. Re-uploads after a dropped connection dedupe here,
    so the client can safely retry until it sees a 202.
    """

    STATUS_PENDING = "pending"
    STATUS_PROCESSED = "processed"
    STATUS_FAILED = "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="raw_ingests")
    client_key = models.CharField(max_length=128)  # mobile report id (idempotency)
    payload = models.JSONField()                    # raw measurement, stored as-is

    status = models.CharField(max_length=12, default=STATUS_PENDING)
    attempts = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True, default="")

    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["device", "client_key"], name="uniq_device_client_key"
            )
        ]
        indexes = [models.Index(fields=["status", "received_at"])]
        ordering = ["-received_at"]
