// MeteorSky — a self-contained panorama view of the sky for one meteor.
//
// No external service or API: the star catalogue and constellation data are
// static JSON we host (vendor/celestial/data/, Hipparcos + IAU). Everything is
// computed and drawn (SVG) in the browser.
//
// The sky is shown as a horizontal PANORAMA from the observing site at the
// event instant: x = azimuth, y = altitude. The horizon is a fixed horizontal
// line (always in the same place), the ground below it is shaded. Dragging (or
// the buttons) only turns you left/right — the azimuth scrolls, the cardinal
// marks slide along the fixed horizon — exactly like turning your head. The
// wheel / +/- zoom the field of view around the horizon. No other transforms.
// Meridians are vertical lines (constant azimuth), almucantars horizontal
// (constant altitude). The meteor trail is green (start) -> red (end).
(function (global) {
  'use strict';
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  var dataPromise = null, dataCache = null;
  var model = null;   // per-measurement alt/az geometry
  var view = null;    // { az: center azimuth (deg), ppd: pixels per degree }
  var baseppd = 1;

  function loadData() {
    if (!dataPromise) {
      var base = 'vendor/celestial/data/';
      dataPromise = Promise.all([
        fetch(base + 'stars.6.json').then(function (r) { return r.json(); }),
        fetch(base + 'constellations.lines.json').then(function (r) { return r.json(); }),
        fetch(base + 'constellations.json').then(function (r) { return r.json(); }),
      ]).then(function (res) {
        dataCache = {
          stars: res[0].features.map(function (f) {
            return { ra: f.geometry.coordinates[0], dec: f.geometry.coordinates[1], mag: f.properties.mag };
          }).filter(function (s) { return s.mag <= 5.2; }),
          lines: res[1].features.reduce(function (a, f) { return a.concat(f.geometry.coordinates); }, []),
          names: res[2].features.map(function (f) {
            return { ra: f.geometry.coordinates[0], dec: f.geometry.coordinates[1], props: f.properties };
          }),
        };
        return dataCache;
      }).catch(function () { dataCache = { stars: [], lines: [], names: [] }; return dataCache; });
    }
    return dataPromise;
  }

  function lstDeg(date, lon) {
    var d = (date.getTime() / 86400000 + 2440587.5) - 2451545.0;
    var gmst = (280.46061837 + 360.98564736629 * d) % 360;
    return ((gmst + lon) % 360 + 360) % 360;
  }
  function radecToAltaz(ra, dec, lat, lst) {
    var H = (lst - ra) * D2R, dr = dec * D2R, lr = lat * D2R;
    var sinAlt = Math.sin(dr) * Math.sin(lr) + Math.cos(dr) * Math.cos(lr) * Math.cos(H);
    var alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    var az = Math.atan2(-Math.cos(dr) * Math.sin(H),
                        Math.sin(dr) * Math.cos(lr) - Math.cos(dr) * Math.sin(lr) * Math.cos(H));
    return { alt: alt * R2D, az: ((az * R2D) % 360 + 360) % 360 };
  }
  function meanAz(a, b) {
    var x = Math.cos(a * D2R) + Math.cos(b * D2R), y = Math.sin(a * D2R) + Math.sin(b * D2R);
    return ((Math.atan2(y, x) * R2D) % 360 + 360) % 360;
  }

  var CARDINALS = [
    { key: 'N', az: 0 }, { key: 'NE', az: 45 }, { key: 'E', az: 90 }, { key: 'SE', az: 135 },
    { key: 'S', az: 180 }, { key: 'SW', az: 225 }, { key: 'W', az: 270 }, { key: 'NW', az: 315 },
  ];
  function dirLabel(k) { return global.MPI18n ? global.MPI18n.t('dir.' + k) : k; }
  function constName(p) { var k = (global.MPI18n && global.MPI18n.lang === 'en') ? 'en' : 'cz'; return p[k] || p.en || p.name || ''; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function build(detail, data) {
    var lst = lstDeg(new Date(detail.event_utc), detail.lon), lat = detail.lat;
    var aa = function (ra, dec) { return radecToAltaz(ra, dec, lat, lst); };
    model = {
      stars: data.stars.map(function (s) { var p = aa(s.ra, s.dec); return { alt: p.alt, az: p.az, mag: s.mag }; }),
      lines: data.lines.map(function (ls) { return ls.map(function (pt) { var p = aa(pt[0], pt[1]); return [p.alt, p.az]; }); }),
      names: data.names.map(function (n) { var p = aa(n.ra, n.dec); return { alt: p.alt, az: p.az, props: n.props }; }),
      start: { alt: detail.start.alt, az: detail.start.az },
      end: { alt: detail.end.alt, az: detail.end.az },
      centerAz: meanAz(detail.start.az, detail.end.az),
    };
  }

  // geometry of the panorama for the current panel size
  function geom() {
    var host = document.getElementById('skymap');
    var W = host.clientWidth || 600, H = host.clientHeight || 400;
    return { W: W, H: H, cx: W / 2, horizonY: Math.round(H * 0.86) };
  }
  function adiff(az, c) { return ((az - c + 540) % 360) - 180; }       // -180..180

  function paint() {
    var host = document.getElementById('skymap');
    if (!host || !model) return;
    var g = geom(), W = g.W, H = g.H, cx = g.cx, hy = g.horizonY, ppd = view.ppd, c = view.az;
    var halfAz = (W / 2) / ppd + 8; // visible azimuth half-width (deg) + margin
    var px = function (alt, az) { return [cx + adiff(az, c) * ppd, hy - alt * ppd]; };
    var vis = function (az) { return Math.abs(adiff(az, c)) <= halfAz; };

    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block">';
    svg += '<rect x="0" y="0" width="' + W + '" height="' + hy + '" fill="#070710"/>';                 // sky
    svg += '<rect x="0" y="' + hy + '" width="' + W + '" height="' + (H - hy) + '" fill="#0c0608"/>';   // ground

    // almucantars (constant altitude -> horizontal lines)
    [30, 60].forEach(function (al) {
      var y = (hy - al * ppd).toFixed(1);
      svg += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="#20202f" stroke-width="1" opacity="0.55"/>';
    });
    // meridians (constant azimuth -> vertical lines), every 15 deg
    for (var mz = 0; mz < 360; mz += 15) {
      if (!vis(mz)) continue;
      var x = (cx + adiff(mz, c) * ppd).toFixed(1);
      var major = (mz % 90 === 0);
      svg += '<line x1="' + x + '" y1="' + (hy - 90 * ppd).toFixed(1) + '" x2="' + x + '" y2="' + hy + '" stroke="' + (major ? '#2c2c42' : '#20202f') + '" stroke-width="1" opacity="0.6"/>';
    }

    // constellation lines (split where the azimuth seam would draw a long jump)
    model.lines.forEach(function (ls) {
      var cur = [], prevX = null;
      for (var i = 0; i < ls.length; i++) {
        var alt = ls[i][0], az = ls[i][1];
        if (alt < -3 || !vis(az)) { if (cur.length > 1) svg += poly(cur); cur = []; prevX = null; continue; }
        var p = px(alt, az);
        if (prevX !== null && Math.abs(p[0] - prevX) > W * 0.5) { if (cur.length > 1) svg += poly(cur); cur = []; }
        cur.push(p[0].toFixed(1) + ',' + p[1].toFixed(1)); prevX = p[0];
      }
      if (cur.length > 1) svg += poly(cur);
    });

    // stars (above horizon)
    model.stars.forEach(function (st) {
      if (st.alt < 0 || !vis(st.az)) return;
      var p = px(st.alt, st.az), r = Math.max(0.5, (6.2 - st.mag) * 0.42);
      svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#eef0ff" opacity="' + Math.min(1, 0.35 + (6 - st.mag) * 0.13).toFixed(2) + '"/>';
    });
    // constellation names
    model.names.forEach(function (nm) {
      if (nm.alt < -2 || !vis(nm.az)) return;
      var p = px(nm.alt, nm.az);
      svg += '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" fill="#9fb6d6" font-size="11" text-anchor="middle" font-family="system-ui,sans-serif" opacity="0.85">' + esc(constName(nm.props)) + '</text>';
    });

    // horizon line (fixed) + cardinal marks sliding along it
    svg += '<line x1="0" y1="' + hy + '" x2="' + W + '" y2="' + hy + '" stroke="#ff5a5a" stroke-width="1.8"/>';
    CARDINALS.forEach(function (cd) {
      if (!vis(cd.az)) return;
      var x = cx + adiff(cd.az, c) * ppd;
      svg += '<line x1="' + x.toFixed(1) + '" y1="' + (hy - 7) + '" x2="' + x.toFixed(1) + '" y2="' + (hy + 7) + '" stroke="#ff7a7a" stroke-width="1.5"/>';
      svg += '<text x="' + x.toFixed(1) + '" y="' + (hy + 24) + '" fill="#ffb0b0" font-size="14" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif">' + esc(dirLabel(cd.key)) + '</text>';
    });

    // meteor trail
    if (vis(model.start.az) || vis(model.end.az)) {
      var a = px(model.start.alt, model.start.az), b = px(model.end.alt, model.end.az);
      svg += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="#ff3b3b" stroke-width="2.5" stroke-linecap="round"/>';
      svg += '<circle cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="5" fill="#5dff5d"/>';
      svg += '<circle cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="5" fill="#ff3b3b"/>';
    }
    svg += '</svg>';
    host.innerHTML = svg;
  }
  function poly(pts) { return '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#3b6ea5" stroke-width="1" opacity="0.6"/>'; }

  var raf = false;
  function schedule() { if (raf) return; raf = true; requestAnimationFrame(function () { raf = false; paint(); }); }

  function resetView() {
    var g = geom();
    baseppd = (g.horizonY * 0.96) / 92;   // default: horizon..zenith fits above the line
    view = { az: model.centerAz, ppd: baseppd };
  }
  function zoom(factor) { view.ppd = Math.max(baseppd * 0.6, Math.min(baseppd * 8, view.ppd * factor)); }

  function bind(host) {
    if (host._mpBound) return; host._mpBound = true;
    host.style.cursor = 'grab';
    host.addEventListener('wheel', function (e) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); schedule(); }, { passive: false });
    var drag = false, lx = 0;
    host.addEventListener('mousedown', function (e) { drag = true; lx = e.clientX; host.style.cursor = 'grabbing'; });
    global.addEventListener('mousemove', function (e) {
      if (!drag || !view) return;
      // horizontal only: turn left/right (azimuth). Horizon stays fixed.
      view.az = ((view.az - (e.clientX - lx) / view.ppd) % 360 + 360) % 360;
      lx = e.clientX; schedule();
    });
    global.addEventListener('mouseup', function () { drag = false; host.style.cursor = 'grab'; });
    host.addEventListener('dblclick', function () { resetView(); paint(); });
  }

  function render(detail) {
    if (!detail || !detail.start || detail.start.alt == null || !detail.end || detail.end.alt == null ||
        detail.lat == null || detail.lon == null || !detail.event_utc) return false;
    MeteorSky._detail = detail;
    loadData().then(function (data) {
      if (MeteorSky._detail !== detail) return;
      var host = document.getElementById('skymap'); if (host) bind(host);
      build(detail, data); resetView(); paint();
    });
    return true;
  }
  function redraw() { if (model) paint(); }
  function refit() { if (model) { resetView(); paint(); } }

  var rt = null;
  global.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(refit, 150); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-zoom]'); if (!b || !view) return;
    var act = b.getAttribute('data-zoom');
    if (act === 'reset') refit();
    else { zoom(act === 'in' ? 1.3 : 1 / 1.3); paint(); }
  });

  global.MeteorSky = { render: render, redraw: redraw, refit: refit, _detail: null };
})(window);
