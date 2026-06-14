import io
from datetime import timedelta

import segno
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from ninja import Router, Schema

from apps.auth_api.jwt import device_auth

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


class ReportRow(Schema):
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


class TrailPoint(Schema):
    alt: float | None = None
    az: float | None = None
    ra: float | None = None   # equatorial, degrees (for the star map)
    dec: float | None = None


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


@router.get("/reports/{client_key}", auth=web_auth, response={200: ReportDetail, 404: dict})
def report_detail(request, client_key: str):
    """A single measurement, parsed into render-ready fields for the sky view.

    Parses lazily on first view (parse-later) so it works without a worker; the
    result is cached in ParsedMeasurement and reused thereafter.
    """
    from apps.ingest.parser import ensure_parsed

    raw = request.web_device.raw_ingests.filter(client_key=client_key).first()
    if raw is None:
        return 404, {"detail": "Measurement not found"}

    parsed = ensure_parsed(raw)
    base = {
        "client_key": raw.client_key,
        "status": raw.status,
        "received_at": raw.received_at.isoformat(),
    }
    if parsed is None:
        return 200, base  # unparseable payload: status only, no render body

    event_local = None
    if parsed.event_time and parsed.event_tz:
        try:
            from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

            event_local = parsed.event_time.astimezone(ZoneInfo(parsed.event_tz)).isoformat()
        except (ZoneInfoNotFoundError, ValueError):
            event_local = None

    return 200, {
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
        },
        "end": {
            "alt": parsed.end_alt, "az": parsed.end_az,
            "ra": parsed.end_ra, "dec": parsed.end_dec,
        },
    }


@router.post("/logout", auth=web_auth, response={200: dict})
def logout(request, response: HttpResponse):
    request.web_session.revoked_at = timezone.now()
    request.web_session.save(update_fields=["revoked_at"])
    response.delete_cookie(settings.WEB_COOKIE_NAME)
    return 200, {"ok": True}
