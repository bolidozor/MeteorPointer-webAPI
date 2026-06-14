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


class ParsedMeasurement(models.Model):
    """Render-ready record derived from a RawIngest (the parse-later output).

    One row per raw measurement. Holds the validated horizontal coordinates of
    the trail's two aim points, the derived equatorial coordinates (RA/Dec) for
    plotting on a star map, the absolute UTC event time, the observing site, and
    the site's IANA time zone. ``parse_version`` lets stored rows be re-derived
    when the parsing logic changes.
    """

    raw = models.OneToOneField(
        RawIngest, on_delete=models.CASCADE, related_name="parsed"
    )
    parse_version = models.PositiveIntegerField(default=0)

    event_time = models.DateTimeField(null=True, blank=True)  # absolute UTC
    event_tz = models.CharField(max_length=64, blank=True, default="")  # IANA name

    start_alt = models.FloatField(null=True, blank=True)
    start_az = models.FloatField(null=True, blank=True)
    end_alt = models.FloatField(null=True, blank=True)
    end_az = models.FloatField(null=True, blank=True)

    start_ra = models.FloatField(null=True, blank=True)
    start_dec = models.FloatField(null=True, blank=True)
    end_ra = models.FloatField(null=True, blank=True)
    end_dec = models.FloatField(null=True, blank=True)

    lat = models.FloatField(null=True, blank=True)
    lon = models.FloatField(null=True, blank=True)
    accuracy = models.FloatField(null=True, blank=True)
    quality = models.FloatField(null=True, blank=True)

    parsed_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"ParsedMeasurement(raw={self.raw_id}, v{self.parse_version})"
