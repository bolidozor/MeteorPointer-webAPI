import uuid

from django.db import models

from apps.devices.models import Device


class WebLogin(models.Model):
    """A web sign-in request (OAuth 2.0 device-flow style).

    The frontend creates one and shows the short ``user_code`` to the user, who
    confirms it in the mobile app (which authenticates with its device JWT). The
    frontend polls with the secret ``device_code`` until it is approved.
    """

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_CONSUMED = "consumed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_code = models.CharField(max_length=20, unique=True)     # shown to the user
    device_code = models.CharField(max_length=128, unique=True)  # secret, polled by the FE
    device = models.ForeignKey(
        Device, null=True, blank=True, on_delete=models.CASCADE, related_name="web_logins"
    )
    status = models.CharField(max_length=12, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["expires_at"])]


class WebSession(models.Model):
    """A logged-in web session, bound to the mobile device that approved it.

    The browser holds only an httpOnly cookie carrying the token; the session
    lives server-side (BFF pattern). Only the token hash is stored.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="web_sessions")
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
