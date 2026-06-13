import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ("devices", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="RawIngest",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("client_key", models.CharField(max_length=128)),
                ("payload", models.JSONField()),
                ("status", models.CharField(default="pending", max_length=12)),
                ("attempts", models.PositiveIntegerField(default=0)),
                ("error", models.TextField(blank=True, default="")),
                ("received_at", models.DateTimeField(auto_now_add=True)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="raw_ingests", to="devices.device")),
            ],
            options={"ordering": ["-received_at"]},
        ),
        migrations.AddConstraint(
            model_name="rawingest",
            constraint=models.UniqueConstraint(fields=["device", "client_key"], name="uniq_device_client_key"),
        ),
        migrations.AddIndex(
            model_name="rawingest",
            index=models.Index(fields=["status", "received_at"], name="ingest_rawi_status_5d2a1b_idx"),
        ),
    ]
