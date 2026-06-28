import uuid

from django.db import models


class Device(models.Model):
    """An anonymous device identity = an Ed25519 public key.

    No personal data (name/e-mail/phone). The private key lives only on the
    phone; we store the public key and verify challenge signatures against it.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    public_key = models.TextField()  # base64, raw Ed25519 public key (32 bytes)
    label = models.CharField(max_length=120, blank=True, default="")

    # Preferred web-frontend language for this device (a per-device setting,
    # stored server-side so it follows the device across browsers).
    fe_language = models.CharField(max_length=5, blank=True, default="cs")

    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    # Convenience pointer to the latest accepted consent (full history in
    # ConsentRecord). Lets us answer "does this device hold a valid consent?".
    current_consent_version = models.CharField(max_length=20, blank=True, default="")
    current_consent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["revoked_at"])]

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    def __str__(self) -> str:
        return f"Device {self.id}"


class ConsentRecord(models.Model):
    """Immutable audit record of an accepted consent / data-license document.

    One device : N records (re-consent on document version bumps). No IP /
    user-agent is stored (data minimisation).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="consents")
    consent_version = models.CharField(max_length=20)
    license = models.CharField(max_length=40)
    document_sha256 = models.CharField(max_length=64)
    locale = models.CharField(max_length=8)
    app_version = models.CharField(max_length=40, blank=True, default="")
    accepted_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class RecoveryPhrase(models.Model):
    """One-time recovery phrase (R1). Only the hash is stored."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="recovery_phrases")
    phrase_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)
