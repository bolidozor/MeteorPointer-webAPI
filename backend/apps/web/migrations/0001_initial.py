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
            name="WebLogin",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("user_code", models.CharField(max_length=20, unique=True)),
                ("device_code", models.CharField(max_length=128, unique=True)),
                ("status", models.CharField(default="pending", max_length=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("device", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="web_logins", to="devices.device")),
            ],
        ),
        migrations.AddIndex(
            model_name="weblogin",
            index=models.Index(fields=["expires_at"], name="web_weblogi_expires_4d6b1e_idx"),
        ),
        migrations.CreateModel(
            name="WebSession",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="web_sessions", to="devices.device")),
            ],
        ),
    ]
