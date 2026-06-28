"""Identify the IAU constellation that contains an equatorial position.

Uses the classic Roman (1987) point-in-constellation method: the official IAU
boundaries are rectangular in RA/Dec *referred to equinox B1875.0*, so a given
position is precessed back to B1875 and then matched against an ordered table of
boundary segments (the first segment whose Dec floor and RA span contain the
point wins). Boundary table: VI/42 "Identification of a Constellation from
Position" (Roman 1987), bundled as ``data/constellation_boundaries.dat``.

Kept dependency-free and closed-form, matching the parser's philosophy: the
phone's degree-level orientation accuracy is far coarser than the arc-minute
error of this precession, so no heavy astrometry library is warranted. The only
ambiguity this cannot resolve is a trail that straddles a boundary — we report
the constellation of each endpoint independently, which is exactly what the UI
shows ("started in X, ended in Y").
"""
from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path

_DATA = Path(__file__).with_name("data") / "constellation_boundaries.dat"


@lru_cache(maxsize=1)
def _boundaries():
    """Parsed boundary table as a list of (ra_low_h, ra_high_h, dec_low, abbr).

    Rows are kept in file order; the lookup relies on that ordering (the table
    is sorted by descending Dec floor, so the first containing row is correct).
    """
    rows = []
    for line in _DATA.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        ra_low, ra_high, dec_low, abbr = line.split()
        rows.append((float(ra_low), float(ra_high), float(dec_low), abbr))
    return rows


def _precess_j2000_to_b1875(ra_deg, dec_deg):
    """Precess a mean equatorial position from J2000.0 to B1875.0.

    IAU 1976 precession angles; T is the (negative) Julian-century interval from
    J2000.0 to the B1875.0 epoch. Accurate to well under an arc-minute over this
    125-year span — comfortably finer than the boundary granularity.
    """
    # B1875.0 = JD 2405889.25 -> centuries from J2000.0 (JD 2451545.0).
    t = (2405889.25 - 2451545.0) / 36525.0
    arcsec = math.pi / (180.0 * 3600.0)
    zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t**3) * arcsec
    z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t**3) * arcsec
    theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t**3) * arcsec

    ra = math.radians(ra_deg)
    dec = math.radians(dec_deg)
    a = math.cos(dec) * math.sin(ra + zeta)
    b = math.cos(theta) * math.cos(dec) * math.cos(ra + zeta) - math.sin(theta) * math.sin(dec)
    c = math.sin(theta) * math.cos(dec) * math.cos(ra + zeta) + math.cos(theta) * math.sin(dec)
    ra_out = math.degrees(math.atan2(a, b) + z) % 360.0
    dec_out = math.degrees(math.asin(max(-1.0, min(1.0, c))))
    return ra_out, dec_out


def constellation_abbr(ra_deg, dec_deg):
    """IAU 3-letter abbreviation (e.g. ``"Ori"``) for a J2000 RA/Dec, or None.

    Returns None when coordinates are missing or no boundary row matches (which
    should not happen for a valid position — the table tiles the whole sphere).
    """
    if ra_deg is None or dec_deg is None:
        return None
    ra1875, dec1875 = _precess_j2000_to_b1875(ra_deg, dec_deg)
    ra_h = ra1875 / 15.0  # boundary table RA is in hours
    for ra_low, ra_high, dec_low, abbr in _boundaries():
        if dec1875 < dec_low:
            continue
        if ra_low <= ra_h < ra_high:
            return abbr
    return None
