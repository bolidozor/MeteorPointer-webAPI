import uuid

from django.db import models

from apps.devices.models import Device


class Challenge(models.Model):
    """A one-time nonce the device must sign to obtain an access token.

    Short-lived (settings.CHALLENGE_TTL_SECONDS) and single-use.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="challenges")
    nonce = models.CharField(max_length=64, unique=True)  # base64 random
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["expires_at"])]
