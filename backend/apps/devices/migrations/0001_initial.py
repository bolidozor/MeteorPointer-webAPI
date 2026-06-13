import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Device",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("public_key", models.TextField()),
                ("label", models.CharField(blank=True, default="", max_length=120)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_seen_at", models.DateTimeField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("current_consent_version", models.CharField(blank=True, default="", max_length=20)),
                ("current_consent_at", models.DateTimeField(blank=True, null=True)),
            ],
        ),
        migrations.AddIndex(
            model_name="device",
            index=models.Index(fields=["revoked_at"], name="devices_dev_revoked_47e6f0_idx"),
        ),
        migrations.CreateModel(
            name="ConsentRecord",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("consent_version", models.CharField(max_length=20)),
                ("license", models.CharField(max_length=40)),
                ("document_sha256", models.CharField(max_length=64)),
                ("locale", models.CharField(max_length=8)),
                ("app_version", models.CharField(blank=True, default="", max_length=40)),
                ("accepted_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="consents", to="devices.device")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="RecoveryPhrase",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("phrase_hash", models.CharField(max_length=64, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="recovery_phrases", to="devices.device")),
            ],
        ),
    ]
