"""Measurement parser: payload validation, alt/az -> RA/Dec, lazy detail endpoint."""
import json
from datetime import UTC, datetime

import pytest
from django.test import Client

from apps.devices.models import Device
from apps.ingest import parser
from apps.ingest.constellation import constellation_abbr
from apps.ingest.models import RawIngest
from tests.test_auth_sync import _register, _token

pytestmark = pytest.mark.django_db

try:
    import timezonefinder  # noqa: F401

    _HAS_TZF = True
except ImportError:
    _HAS_TZF = False


# eventTimestamp is Date.now() epoch ms (absolute UTC); a Czech site.
PAYLOAD = {
    "eventTimestamp": 1781455673730,
    "startPoint": {"alt": 40.0, "az": 90.0},
    "endPoint": {"alt": 45.0, "az": 95.0},
    "site": {"lat": 48.8128, "lon": 14.6458, "accuracy": 100},
    "quality": 0.8,
}


# ---- pure functions ----

def test_parse_payload_extracts_and_validates():
    out = parser.parse_payload(PAYLOAD)
    assert out["start_alt"] == 40.0 and out["end_az"] == 95.0
    assert out["lat"] == pytest.approx(48.8128)
    # epoch ms decodes to an absolute UTC instant (not a local wall-clock time)
    assert out["event_time"] == datetime.fromtimestamp(1781455673.730, tz=UTC)


def test_parse_payload_rejects_bad_data():
    with pytest.raises(parser.ParseError):
        parser.parse_payload({"startPoint": {"alt": 40, "az": 90}})  # no endPoint
    with pytest.raises(parser.ParseError):
        parser.parse_payload({**PAYLOAD, "startPoint": {"alt": 40, "az": 999}})  # az range


def test_altaz_to_radec_zenith_equals_latitude():
    when = datetime(2026, 6, 14, 22, 0, tzinfo=UTC)
    ra, dec = parser.altaz_to_radec(90.0, 0.0, 48.0, 14.0, when)
    assert dec == pytest.approx(48.0, abs=0.3)  # the zenith's dec is the observer latitude
    assert 0.0 <= ra < 360.0


def test_altaz_to_radec_without_location_is_none():
    when = datetime(2026, 6, 14, 22, 0, tzinfo=UTC)
    assert parser.altaz_to_radec(40, 90, None, None, when) is None


@pytest.mark.parametrize(
    "ra,dec,abbr",
    [
        (88.79, 7.41, "Ori"),    # Betelgeuse
        (37.95, 89.26, "UMi"),   # Polaris
        (279.23, 38.78, "Lyr"),  # Vega
        (101.29, -16.72, "CMa"), # Sirius
        (247.35, -26.43, "Sco"), # Antares
    ],
)
def test_constellation_for_known_stars(ra, dec, abbr):
    assert constellation_abbr(ra, dec) == abbr


def test_constellation_missing_coords_is_none():
    assert constellation_abbr(None, None) is None


# ---- persistence + endpoint ----

def _device(client):
    device_id, priv = _register(client)
    return Device.objects.get(id=device_id), device_id, priv


def _login_fe(fe, mobile, device_id, priv):
    token = _token(mobile, device_id, priv)
    auth = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
    data = fe.post("/v1/web/device-code").json()
    mobile.post(
        "/v1/web/approve",
        data=json.dumps({"user_code": data["user_code"]}),
        content_type="application/json",
        **auth,
    )
    fe.post(
        "/v1/web/poll",
        data=json.dumps({"device_code": data["device_code"]}),
        content_type="application/json",
    )


def test_parse_and_store_creates_record():
    device, _, _ = _device(Client())
    raw = RawIngest.objects.create(device=device, client_key="k1", payload=PAYLOAD)

    parsed = parser.parse_and_store(raw)

    assert parsed.start_ra is not None and parsed.end_dec is not None
    assert parsed.start_constellation and parsed.end_constellation  # 3-letter IAU abbr
    assert parsed.event_time is not None and parsed.parse_version == parser.PARSE_VERSION
    raw.refresh_from_db()
    assert raw.status == RawIngest.STATUS_PROCESSED
    if _HAS_TZF:
        assert parsed.event_tz == "Europe/Prague"


def test_report_detail_endpoint_returns_render_payload():
    fe, mobile = Client(), Client()
    device, device_id, priv = _device(mobile)
    RawIngest.objects.create(device=device, client_key="k1", payload=PAYLOAD)
    _login_fe(fe, mobile, device_id, priv)

    res = fe.get("/v1/web/reports/k1")
    assert res.status_code == 200, res.content
    body = res.json()
    assert body["status"] == "processed"
    assert body["start"]["alt"] == 40.0 and body["start"]["ra"] is not None
    assert body["start"]["constellation"] and body["end"]["constellation"]
    assert body["end"]["az"] == 95.0
    assert body["event_utc"] is not None
    if _HAS_TZF:
        assert body["event_tz"] == "Europe/Prague" and body["event_local"] is not None


def test_report_detail_unknown_key_is_404():
    fe, mobile = Client(), Client()
    device, device_id, priv = _device(mobile)
    _login_fe(fe, mobile, device_id, priv)

    assert fe.get("/v1/web/reports/does-not-exist").status_code == 404
