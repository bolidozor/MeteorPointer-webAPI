import io
from datetime import timedelta

import segno
from django.conf import settings
from django.core.exceptions import ValidationError
from django.http import HttpResponse
from django.utils import timezone
from ninja import Router, Schema

from apps.auth_api.jwt import device_auth
from apps.ingest.models import RawIngest

from .auth import web_auth
from .models import WebLogin, WebSession
from .util import generate_secret, generate_user_code, hash_token

router = Router()


# ---- schemas ----

class DeviceCodeOut(Schema):
    user_code: str
    device_code: str
    expires_in: int
    interval: int


class ApproveIn(Schema):
    user_code: str


class PollIn(Schema):
    device_code: str


class PollOut(Schema):
    status: str  # pending | authenticated | expired


class MeOut(Schema):
    device_id: str
    label: str
    language: str


class SettingsIn(Schema):
    language: str


class LabelIn(Schema):
    label: str


class StatsOut(Schema):
    total_reports: int
    total_observers: int


class ReportRow(Schema):
    id: str          # raw UUID — used by the FE to link to the event detail page
    client_key: str
    received_at: str
    status: str
    event_timestamp: float | None = None
    start_alt: float | None = None
    start_az: float | None = None
    end_alt: float | None = None
    end_az: float | None = None
    quality: float | None = None
    lat: float | None = None
    lon: float | None = None
    accuracy: float | None = None


class PublicReportRow(Schema):
    """One row of the public home grid — every observer's latest measurements."""
    id: str
    received_at: str
    observer: str
    status: str
    start_alt: float | None = None
    start_az: float | None = None
    end_alt: float | None = None
    end_az: float | None = None
    quality: float | None = None
    start_constellation: str | None = None
    end_constellation: str | None = None
    lat: float | None = None   # GPS location of the observing site (for the home map)
    lon: float | None = None


class TrailPoint(Schema):
    alt: float | None = None
    az: float | None = None
    ra: float | None = None   # equatorial, degrees (for the star map)
    dec: float | None = None
    constellation: str | None = None  # IAU 3-letter abbreviation (e.g. "Ori")


class ReportDetail(Schema):
    client_key: str
    status: str
    received_at: str
    event_utc: str | None = None     # absolute instant
    event_local: str | None = None   # civil time at the observing site
    event_tz: str | None = None      # IANA zone resolved from the GPS site
    quality: float | None = None
    lat: float | None = None
    lon: float | None = None
    accuracy: float | None = None
    start: TrailPoint = TrailPoint()
    end: TrailPoint = TrailPoint()


# ---- device flow ----

@router.post("/device-code", response=DeviceCodeOut)
def device_code(request):
    """Frontend starts a sign-in: returns a user_code to show + a device_code to poll."""
    expires_at = timezone.now() + timedelta(seconds=settings.WEB_LOGIN_TTL_SECONDS)
    while True:
        code = generate_user_code()
        if not WebLogin.objects.filter(user_code=code).exists():
            break
    login = WebLogin.objects.create(
        user_code=code, device_code=generate_secret(), expires_at=expires_at
    )
    return {
        "user_code": login.user_code,
        "device_code": login.device_code,
        "expires_in": settings.WEB_LOGIN_TTL_SECONDS,
        "interval": 2,
    }


@router.get("/qr")
def qr(request, data: str):
    """SVG QR code for a sign-in user_code, so the mobile app can scan it."""
    buf = io.BytesIO()
    # High error correction + a full 4-module quiet zone make the code far
    # easier to decode off a glowing screen (tolerates blur, glare, slight
    # defocus). The user_code is short, so 'h' adds negligible density.
    segno.make(data, error="h").save(buf, kind="svg", scale=8, border=4)
    return HttpResponse(buf.getvalue(), content_type="image/svg+xml")


@router.post("/approve", auth=device_auth, response={200: dict, 404: dict, 409: dict})
def approve(request, payload: ApproveIn):
    """Mobile app (authenticated) approves a user_code shown on the web."""
    code = payload.user_code.strip().upper()
    login = WebLogin.objects.filter(user_code=code, status=WebLogin.STATUS_PENDING).first()
    if login is None:
        return 404, {"detail": "Unknown or already used code"}
    if login.expires_at < timezone.now():
        return 409, {"detail": "Code expired"}
    login.device = request.device
    login.status = WebLogin.STATUS_APPROVED
    login.approved_at = timezone.now()
    login.save(update_fields=["device", "status", "approved_at"])
    return 200, {"ok": True}


@router.post("/poll", response={200: PollOut})
def poll(request, payload: PollIn, response: HttpResponse):
    """Frontend polls; on approval the server sets the session cookie."""
    login = (
        WebLogin.objects.select_related("device").filter(device_code=payload.device_code).first()
    )
    if login is None or login.expires_at < timezone.now():
        return 200, {"status": "expired"}
    if login.status == WebLogin.STATUS_PENDING:
        return 200, {"status": "pending"}
    if login.status == WebLogin.STATUS_APPROVED and login.device_id:
        token = generate_secret()
        WebSession.objects.create(
            device=login.device,
            token_hash=hash_token(token),
            expires_at=timezone.now() + timedelta(seconds=settings.WEB_SESSION_TTL_SECONDS),
        )
        login.status = WebLogin.STATUS_CONSUMED
        login.save(update_fields=["status"])
        response.set_cookie(
            settings.WEB_COOKIE_NAME,
            token,
            max_age=settings.WEB_SESSION_TTL_SECONDS,
            httponly=True,
            secure=settings.WEB_COOKIE_SECURE,
            samesite=settings.WEB_COOKIE_SAMESITE,
        )
        return 200, {"status": "authenticated"}
    return 200, {"status": "expired"}


# ---- authenticated web session ----

def _me_payload(device):
    return {
        "device_id": str(device.id),
        "label": device.label,
        "language": device.fe_language or "cs",
    }


@router.get("/me", auth=web_auth, response=MeOut)
def me(request):
    return _me_payload(request.web_device)


# Supported web-frontend languages; anything else falls back to Czech.
WEB_LANGUAGES = {"cs", "en"}


@router.post("/settings", auth=web_auth, response=MeOut)
def update_settings(request, payload: SettingsIn):
    """Persist this device's web-frontend language preference."""
    device = request.web_device
    lang = payload.language if payload.language in WEB_LANGUAGES else "cs"
    if lang != device.fe_language:
        device.fe_language = lang
        device.save(update_fields=["fe_language"])
    return _me_payload(device)


@router.post("/label", auth=web_auth, response=MeOut)
def update_label(request, payload: LabelIn):
    """Update the observer's display name (label) shown on the public home page."""
    device = request.web_device
    device.label = payload.label.strip()[:120]
    device.save(update_fields=["label"])
    return _me_payload(device)


@router.get("/reports", auth=web_auth, response=list[ReportRow])
def reports(request):
    """The signed-in device's measurements — data for the frontend grid."""
    rows = request.web_device.raw_ingests.all()[:200]
    out = []
    for r in rows:
        p = r.payload or {}
        start = p.get("startPoint") or {}
        end = p.get("endPoint") or {}
        site = p.get("site") or {}
        out.append(
            {
                "id": str(r.id),
                "client_key": r.client_key,
                "received_at": r.received_at.isoformat(),
                "status": r.status,
                "event_timestamp": p.get("eventTimestamp"),
                "start_alt": start.get("alt"),
                "start_az": start.get("az"),
                "end_alt": end.get("alt"),
                "end_az": end.get("az"),
                "quality": p.get("quality"),
                "lat": site.get("lat"),
                "lon": site.get("lon"),
                "accuracy": site.get("accuracy"),
            }
        )
    return out


def _detail_body(raw):
    """Parse a raw measurement into the render-ready ReportDetail body.

    Parses lazily on first view (parse-later) so it works without a worker; the
    result is cached in ParsedMeasurement and reused thereafter. Shared by the
    per-device and the public detail endpoints.
    """
    from apps.ingest.parser import ensure_parsed

    parsed = ensure_parsed(raw)
    base = {
        "client_key": raw.client_key,
        "status": raw.status,
        "received_at": raw.received_at.isoformat(),
    }
    if parsed is None:
        return base  # unparseable payload: status only, no render body

    event_local = None
    if parsed.event_time and parsed.event_tz:
        try:
            from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

            event_local = parsed.event_time.astimezone(ZoneInfo(parsed.event_tz)).isoformat()
        except (ZoneInfoNotFoundError, ValueError):
            event_local = None

    return {
        **base,
        "event_utc": parsed.event_time.isoformat() if parsed.event_time else None,
        "event_local": event_local,
        "event_tz": parsed.event_tz or None,
        "quality": parsed.quality,
        "lat": parsed.lat,
        "lon": parsed.lon,
        "accuracy": parsed.accuracy,
        "start": {
            "alt": parsed.start_alt, "az": parsed.start_az,
            "ra": parsed.start_ra, "dec": parsed.start_dec,
            "constellation": parsed.start_constellation or None,
        },
        "end": {
            "alt": parsed.end_alt, "az": parsed.end_az,
            "ra": parsed.end_ra, "dec": parsed.end_dec,
            "constellation": parsed.end_constellation or None,
        },
    }


@router.get("/reports/{client_key}", auth=web_auth, response={200: ReportDetail, 404: dict})
def report_detail(request, client_key: str):
    """A single measurement of the signed-in device, for the sky view."""
    raw = request.web_device.raw_ingests.filter(client_key=client_key).first()
    if raw is None:
        return 404, {"detail": "Measurement not found"}
    return 200, _detail_body(raw)


# ---- public home (no auth) ----

def _observer_label(device):
    """Public, non-identifying name for an observer device."""
    return device.label or f"#{str(device.id)[:8]}"


@router.get("/public-reports", response=list[PublicReportRow])
def public_reports(request):
    """Latest measurements across all observers — the public home grid.

    Reads alt/az from the raw payload (cheap, no parse) and the constellation
    from an already-parsed record when present; the per-row sky detail is parsed
    lazily on click via /public-reports/{id}.
    """
    rows = RawIngest.objects.select_related("device", "parsed").all()[:100]
    out = []
    for r in rows:
        p = r.payload or {}
        start = p.get("startPoint") or {}
        end = p.get("endPoint") or {}
        parsed = getattr(r, "parsed", None)
        out.append(
            {
                "id": str(r.id),
                "received_at": r.received_at.isoformat(),
                "observer": _observer_label(r.device),
                "status": r.status,
                "start_alt": start.get("alt"),
                "start_az": start.get("az"),
                "end_alt": end.get("alt"),
                "end_az": end.get("az"),
                "quality": p.get("quality"),
                "start_constellation": getattr(parsed, "start_constellation", "") or None,
                "end_constellation": getattr(parsed, "end_constellation", "") or None,
                "lat": (p.get("site") or {}).get("lat"),
                "lon": (p.get("site") or {}).get("lon"),
            }
        )
    return out


@router.get("/stats", response=StatsOut)
def public_stats(request):
    """Aggregate counts for the public home page statistics block."""
    return {
        "total_reports": RawIngest.objects.count(),
        "total_observers": RawIngest.objects.values("device_id").distinct().count(),
    }


@router.get("/public-reports/{report_id}", response={200: ReportDetail, 404: dict})
def public_report_detail(request, report_id: str):
    """Render-ready detail of any measurement (public), keyed by its raw id."""
    try:
        raw = RawIngest.objects.select_related("device").filter(id=report_id).first()
    except (ValueError, ValidationError):
        raw = None  # malformed UUID -> treat as not found
    if raw is None:
        return 404, {"detail": "Measurement not found"}
    return 200, _detail_body(raw)


@router.post("/logout", auth=web_auth, response={200: dict})
def logout(request, response: HttpResponse):
    request.web_session.revoked_at = timezone.now()
    request.web_session.save(update_fields=["revoked_at"])
    response.delete_cookie(settings.WEB_COOKIE_NAME)
    return 200, {"ok": True}
