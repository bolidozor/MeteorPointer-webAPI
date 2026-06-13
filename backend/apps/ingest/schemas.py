from typing import Any

from ninja import Schema


class ReportIn(Schema):
    client_key: str               # the mobile's own report id (idempotency key)
    payload: dict[str, Any]       # the raw measurement object, stored verbatim


class BatchIn(Schema):
    """A batch of queued measurements flushed in one request.

    The mobile keeps an offline queue and uploads all of it at once; the whole
    call is safe to retry because each item dedupes on client_key.
    """

    reports: list[ReportIn]


class ItemResult(Schema):
    client_key: str
    status: str   # "accepted" | "duplicate"


class BatchOut(Schema):
    accepted: int
    duplicates: int
    results: list[ItemResult]


class IngestRow(Schema):
    client_key: str
    status: str
    received_at: str
