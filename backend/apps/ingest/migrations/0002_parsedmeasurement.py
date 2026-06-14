import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ingest", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ParsedMeasurement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("parse_version", models.PositiveIntegerField(default=0)),
                ("event_time", models.DateTimeField(blank=True, null=True)),
                ("event_tz", models.CharField(blank=True, default="", max_length=64)),
                ("start_alt", models.FloatField(blank=True, null=True)),
                ("start_az", models.FloatField(blank=True, null=True)),
                ("end_alt", models.FloatField(blank=True, null=True)),
                ("end_az", models.FloatField(blank=True, null=True)),
                ("start_ra", models.FloatField(blank=True, null=True)),
                ("start_dec", models.FloatField(blank=True, null=True)),
                ("end_ra", models.FloatField(blank=True, null=True)),
                ("end_dec", models.FloatField(blank=True, null=True)),
                ("lat", models.FloatField(blank=True, null=True)),
                ("lon", models.FloatField(blank=True, null=True)),
                ("accuracy", models.FloatField(blank=True, null=True)),
                ("quality", models.FloatField(blank=True, null=True)),
                ("parsed_at", models.DateTimeField(auto_now=True)),
                ("raw", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="parsed", to="ingest.rawingest")),
            ],
        ),
    ]
