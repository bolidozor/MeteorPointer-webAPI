from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("devices", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="device",
            name="fe_language",
            field=models.CharField(blank=True, default="cs", max_length=5),
        ),
    ]
