"""Parse raw ingests into ParsedMeasurement rows (parse-later worker).

Run on a schedule or after a deploy. Picks up rows that have never been parsed
or whose parse_version is stale, so bumping PARSE_VERSION re-derives everything.

    python manage.py parse_pending            # parse new / stale rows
    python manage.py parse_pending --all      # re-parse every row
    python manage.py parse_pending --limit 500
"""
from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.ingest.models import RawIngest
from apps.ingest.parser import PARSE_VERSION, ParseError, parse_and_store


class Command(BaseCommand):
    help = "Parse raw ingests into render-ready ParsedMeasurement rows."

    def add_arguments(self, parser):
        parser.add_argument("--all", action="store_true", help="Re-parse every row.")
        parser.add_argument("--limit", type=int, default=1000, help="Max rows per run.")

    def handle(self, *args, **options):
        qs = RawIngest.objects.all().order_by("received_at")
        if not options["all"]:
            # Never parsed, or parsed by an older version.
            qs = qs.filter(
                Q(parsed__isnull=True) | ~Q(parsed__parse_version=PARSE_VERSION)
            )
        rows = list(qs[: options["limit"]])

        ok = failed = 0
        for raw in rows:
            try:
                parse_and_store(raw)
                ok += 1
            except ParseError as exc:
                failed += 1
                self.stderr.write(f"  failed {raw.id}: {exc}")

        self.stdout.write(
            self.style.SUCCESS(f"Parsed {ok} row(s), {failed} failed, {len(rows)} seen.")
        )
