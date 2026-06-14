"""Parse raw measurement payloads into render-ready scientific records.

Follows the ingest-first / parse-later contract: an upload only lands a
``RawIngest`` row, and turning that into a ``ParsedMeasurement`` happens here,
separately. A parse failure is recorded on the raw row (status=failed) and
never touches or discards the raw payload, so it can be re-parsed later.

The mobile app reports a meteor as two horizontal-coordinate aim points
(altitude/azimuth) plus the observing site and the event time. For the sky
view we also derive equatorial coordinates (RA/Dec) so any star map can place
the trail among the stars. The phone's orientation accuracy is degree-level,
so a compact closed-form alt/az -> RA/Dec conversion (arc-minute accuracy) is
already far more precise than the input -- no heavy astrometry dependency is
warranted.

The event time arrives as ``Date.now()`` epoch milliseconds, which is an
absolute UTC instant already (not a local wall-clock time). From the GPS site
we additionally resolve the IANA time zone, so the UI can show the observer's
*local* civil time at the observing site regardless of who is viewing it.
"""
from __future__ import annotations

import math
from datetime import UTC, datetime

# Bump when the parsing logic changes so stored records can be re-derived.
PARSE_VERSION = 1


class ParseError(ValueError):
    """Payload could not be parsed; recorded on the raw row, raw kept intact."""


def _num(value):
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _angle(value, lo, hi, name):
    f = _num(value)
    if f is None:
        return None
    if not (lo <= f <= hi):
        raise ParseError(f"{name} out of range [{lo}, {hi}]: {f}")
    return f


def _parse_time(value):
    if value in (None, ""):
        return None
    if isinstance(value, int | float):
        # epoch seconds, or milliseconds when the value is implausibly large
        secs = value / 1000.0 if value > 1e11 else float(value)
        return datetime.fromtimestamp(secs, tz=UTC)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ParseError(f"unparseable eventTimestamp: {value!r}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def parse_payload(payload: dict) -> dict:
    """Extract and validate the render fields from a raw payload.

    Raises ParseError on malformed data or a missing trail endpoint.
    """
    if not isinstance(payload, dict):
        raise ParseError("payload is not an object")
    start = payload.get("startPoint") or {}
    end = payload.get("endPoint") or {}
    site = payload.get("site") or {}

    out = {
        "event_time": _parse_time(payload.get("eventTimestamp")),
        "start_alt": _angle(start.get("alt"), -90, 90, "start.alt"),
        "start_az": _angle(start.get("az"), 0, 360, "start.az"),
        "end_alt": _angle(end.get("alt"), -90, 90, "end.alt"),
        "end_az": _angle(end.get("az"), 0, 360, "end.az"),
        "lat": _angle(site.get("lat"), -90, 90, "site.lat"),
        "lon": _angle(site.get("lon"), -180, 180, "site.lon"),
        "accuracy": _num(site.get("accuracy")),
        "quality": _num(payload.get("quality")),
    }
    # A trail needs both aim points; without them there is nothing to render.
    for key in ("start_alt", "start_az", "end_alt", "end_az"):
        if out[key] is None:
            raise ParseError(f"missing required field: {key}")
    return out


def _julian_date(dt: datetime) -> float:
    """Julian Date from a (tz-aware) datetime via the civil-calendar formula."""
    dt = dt.astimezone(UTC)
    year, month = dt.year, dt.month
    if month <= 2:
        year -= 1
        month += 12
    a = year // 100
    b = 2 - a + a // 4
    day = dt.day + (dt.hour + (dt.minute + (dt.second + dt.microsecond / 1e6) / 60) / 60) / 24
    return math.floor(365.25 * (year + 4716)) + math.floor(30.6001 * (month + 1)) + day + b - 1524.5


def altaz_to_radec(alt_deg, az_deg, lat_deg, lon_deg, when):
    """Closed-form horizontal -> equatorial conversion, RA/Dec in degrees.

    Azimuth is measured from North, increasing eastward (compass convention).
    Uses mean sidereal time (IAU 1982); arc-minute accurate, which comfortably
    exceeds the phone-orientation accuracy of the inputs. Returns ``(ra, dec)``
    or ``None`` when location or time are unavailable.
    """
    if None in (alt_deg, az_deg, lat_deg, lon_deg) or when is None:
        return None
    alt = math.radians(alt_deg)
    az = math.radians(az_deg)
    lat = math.radians(lat_deg)

    sin_dec = math.sin(alt) * math.sin(lat) + math.cos(alt) * math.cos(lat) * math.cos(az)
    sin_dec = max(-1.0, min(1.0, sin_dec))
    dec = math.asin(sin_dec)

    # Hour angle via atan2 with both terms scaled by (cos dec * cos lat) >= 0,
    # so there is no division and no singularity at the poles.
    num = -math.sin(az) * math.cos(alt) * math.cos(lat)
    den = math.sin(alt) - math.sin(lat) * sin_dec
    hour_angle = math.degrees(math.atan2(num, den))

    d = _julian_date(when) - 2451545.0
    gmst = (280.46061837 + 360.98564736629 * d) % 360.0  # Greenwich mean sidereal time
    lst = (gmst + lon_deg) % 360.0                        # local sidereal time
    ra = (lst - hour_angle) % 360.0
    return ra, math.degrees(dec)


def site_timezone(lat, lon):
    """IANA time-zone name for a GPS location, or None if unavailable.

    Uses timezonefinder (offline polygon lookup); imported lazily so the pure
    parsing/maths above stay dependency-free and unit-testable.
    """
    if lat is None or lon is None:
        return None
    finder = _tz_finder()
    return finder.timezone_at(lat=lat, lng=lon) if finder else None


_TZF = None


def _tz_finder():
    global _TZF
    if _TZF is None:
        try:
            from timezonefinder import TimezoneFinder
        except ImportError:
            return None
        _TZF = TimezoneFinder()  # loads bundled boundary data once
    return _TZF


def parse_and_store(raw):
    """Parse a RawIngest, persist a ParsedMeasurement, and update raw.status.

    On ParseError the raw row is marked failed (with the reason) and the error
    re-raised; the raw payload is left untouched.
    """
    from django.utils import timezone as djtz

    from .models import ParsedMeasurement, RawIngest

    try:
        fields = parse_payload(raw.payload or {})
    except ParseError as exc:
        raw.status = RawIngest.STATUS_FAILED
        raw.error = str(exc)
        raw.attempts = (raw.attempts or 0) + 1
        raw.processed_at = djtz.now()
        raw.save(update_fields=["status", "error", "attempts", "processed_at"])
        raise

    loc = (fields["lat"], fields["lon"], fields["event_time"])
    start = altaz_to_radec(fields["start_alt"], fields["start_az"], *loc)
    end = altaz_to_radec(fields["end_alt"], fields["end_az"], *loc)
    data = dict(fields)
    data["start_ra"], data["start_dec"] = start or (None, None)
    data["end_ra"], data["end_dec"] = end or (None, None)
    # UTC is already absolute (epoch ms); resolve the site's civil time zone so
    # the observer's local time can be shown alongside it.
    data["event_tz"] = site_timezone(fields["lat"], fields["lon"]) or ""

    parsed, _ = ParsedMeasurement.objects.update_or_create(
        raw=raw, defaults={**data, "parse_version": PARSE_VERSION}
    )
    raw.status = RawIngest.STATUS_PROCESSED
    raw.error = ""
    raw.attempts = (raw.attempts or 0) + 1
    raw.processed_at = djtz.now()
    raw.save(update_fields=["status", "error", "attempts", "processed_at"])
    return parsed


def ensure_parsed(raw):
    """Return an up-to-date ParsedMeasurement, parsing lazily if needed.

    Returns None if the payload cannot be parsed (raw is marked failed).
    """
    parsed = getattr(raw, "parsed", None)
    if parsed is not None and parsed.parse_version == PARSE_VERSION:
        return parsed
    try:
        return parse_and_store(raw)
    except ParseError:
        return None
