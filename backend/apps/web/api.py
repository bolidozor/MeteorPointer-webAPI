from datetime import timedelta

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

@router.get("/me", auth=web_auth, response=MeOut)
def me(request):
    device = request.web_device
    return {"device_id": str(device.id), "label": device.label}


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


@router.post("/logout", auth=web_auth, response={200: dict})
def logout(request, response: HttpResponse):
    request.web_session.revoked_at = timezone.now()
    request.web_session.save(update_fields=["revoked_at"])
    response.delete_cookie(settings.WEB_COOKIE_NAME)
    return 200, {"ok": True}
