from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ingest", "0002_parsedmeasurement"),
    ]

    operations = [
        migrations.AddField(
            model_name="parsedmeasurement",
            name="start_constellation",
            field=models.CharField(blank=True, default="", max_length=3),
        ),
        migrations.AddField(
            model_name="parsedmeasurement",
            name="end_constellation",
            field=models.CharField(blank=True, default="", max_length=3),
        ),
    ]
