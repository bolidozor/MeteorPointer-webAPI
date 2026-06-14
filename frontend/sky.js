// MeteorSky — a self-contained, navigable local-sky view of a single meteor.
//
// No external service or API: the star catalogue and constellation data are
// static JSON we host (vendor/celestial/data/, Hipparcos + IAU). Everything is
// computed and drawn (SVG) in the browser.
//
// The sky is shown as it looked from the observing site at the event instant.
// It is a real planetarium-style view: a gnomonic (rectilinear) camera looks
// toward a (azimuth, altitude) direction with a field of view. Dragging rotates
// the look direction (the sky and the cardinal marks scroll; the panel stays
// put); the wheel / buttons change the field of view (zoom out reveals more
// sky). An alt-azimuth grid (meridians + almucantars) and the horizon with
// cardinal directions are drawn; the meteor trail is green (start) -> red (end).
(function (global) {
  'use strict';
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  var dataPromise = null, dataCache = null;
  var model = null;   // per-measurement alt/az geometry
  var view = null;    // { az, alt, fov } look direction + field of view (deg)

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
  function vec(alt, az) {
    var a = alt * D2R, z = az * D2R;
    return [Math.sin(z) * Math.cos(a), Math.cos(z) * Math.cos(a), Math.sin(a)]; // ENU
  }

  var CARDINALS = [
    { key: 'N', az: 0 }, { key: 'NE', az: 45 }, { key: 'E', az: 90 }, { key: 'SE', az: 135 },
    { key: 'S', az: 180 }, { key: 'SW', az: 225 }, { key: 'W', az: 270 }, { key: 'NW', az: 315 },
  ];
  function dirLabel(k) { return global.MPI18n ? global.MPI18n.t('dir.' + k) : k; }
  function constName(p) { var k = (global.MPI18n && global.MPI18n.lang === 'en') ? 'en' : 'cz'; return p[k] || p.en || p.name || ''; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Build the alt/az geometry for a measurement (independent of the view).
  function build(detail, data) {
    var lst = lstDeg(new Date(detail.event_utc), detail.lon), lat = detail.lat;
    var aa = function (ra, dec) { return radecToAltaz(ra, dec, lat, lst); };

    var stars = data.stars.map(function (s) { var p = aa(s.ra, s.dec); return { alt: p.alt, az: p.az, mag: s.mag }; });
    var lines = data.lines.map(function (ls) { return ls.map(function (pt) { var p = aa(pt[0], pt[1]); return [p.alt, p.az]; }); });
    var names = data.names.map(function (n) { var p = aa(n.ra, n.dec); return { alt: p.alt, az: p.az, props: n.props }; });

    // alt-az grid
    var meridians = [], almucantars = [];
    for (var mz = 0; mz < 360; mz += 30) { var m = []; for (var ma = 0; ma <= 88; ma += 4) m.push([ma, mz]); meridians.push(m); }
    [30, 60].forEach(function (al) { var c = []; for (var az = 0; az <= 360; az += 4) c.push([al, az]); almucantars.push(c); });
    var horizon = []; for (var hz = 0; hz <= 360; hz += 2) horizon.push([0, hz]);

    model = {
      stars: stars, lines: lines, names: names,
      meridians: meridians, almucantars: almucantars, horizon: horizon,
      start: { alt: detail.start.alt, az: detail.start.az },
      end: { alt: detail.end.alt, az: detail.end.az },
      centerAz: meanAz(detail.start.az, detail.end.az),
      centerAlt: Math.max(22, Math.min(55, (detail.start.alt + detail.end.alt) / 2)),
    };
  }

  function camera(W, H) {
    var f = vec(view.alt, view.az);
    var r = [f[1], -f[0], 0]; var rn = Math.hypot(r[0], r[1]) || 1e-6; r = [r[0] / rn, r[1] / rn, 0];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    var foc = (H / 2) / Math.tan(view.fov / 2 * D2R);
    return { f: f, r: r, u: u, foc: foc, cx: W / 2, cy: H / 2 };
  }
  function proj(alt, az, C) {
    var p = vec(alt, az);
    var zc = p[0] * C.f[0] + p[1] * C.f[1] + p[2] * C.f[2];
    if (zc <= 0.05) return null;
    var xc = p[0] * C.r[0] + p[1] * C.r[1] + p[2] * C.r[2];
    var yc = p[0] * C.u[0] + p[1] * C.u[1] + p[2] * C.u[2];
    return [C.cx + C.foc * xc / zc, C.cy - C.foc * yc / zc];
  }
  function polylines(coords, C) {
    // project a list of [alt,az], splitting into screen polylines at culled pts
    var segs = [], cur = [];
    for (var i = 0; i < coords.length; i++) {
      var s = proj(coords[i][0], coords[i][1], C);
      if (s) cur.push(s.map(function (n) { return n.toFixed(1); }).join(',')); else { if (cur.length > 1) segs.push(cur); cur = []; }
    }
    if (cur.length > 1) segs.push(cur);
    return segs;
  }

  function paint() {
    var host = document.getElementById('skymap');
    if (!host || !model) return;
    var W = host.clientWidth || 600, H = host.clientHeight || 400;
    var C = camera(W, H);
    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#070710"/>';

    // ground (below the horizon great circle, which is a straight line in gnomonic)
    var hpts = [];
    model.horizon.forEach(function (c) { var s = proj(c[0], c[1], C); if (s) hpts.push(s); });
    hpts.sort(function (a, b) { return a[0] - b[0]; });
    if (hpts.length > 1) {
      var poly = hpts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
      svg += '<polygon points="' + poly + ' ' + W + ',' + H + ' 0,' + H + '" fill="#0c0608"/>';
    }

    // alt-az grid: meridians + almucantars
    model.meridians.forEach(function (m) { polylines(m, C).forEach(function (sg) { svg += '<polyline points="' + sg.join(' ') + '" fill="none" stroke="#23233a" stroke-width="1" opacity="0.6"/>'; }); });
    model.almucantars.forEach(function (m) { polylines(m, C).forEach(function (sg) { svg += '<polyline points="' + sg.join(' ') + '" fill="none" stroke="#23233a" stroke-width="1" opacity="0.5"/>'; }); });

    // constellation lines
    model.lines.forEach(function (ls) { polylines(ls, C).forEach(function (sg) { svg += '<polyline points="' + sg.join(' ') + '" fill="none" stroke="#3b6ea5" stroke-width="1" opacity="0.6"/>'; }); });

    // stars (sky only: above horizon)
    model.stars.forEach(function (st) {
      if (st.alt < 0) return;
      var s = proj(st.alt, st.az, C); if (!s) return;
      var r = Math.max(0.5, (6.2 - st.mag) * 0.42);
      svg += '<circle cx="' + s[0].toFixed(1) + '" cy="' + s[1].toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#eef0ff" opacity="' + Math.min(1, 0.35 + (6 - st.mag) * 0.13).toFixed(2) + '"/>';
    });

    // constellation names
    model.names.forEach(function (nm) {
      if (nm.alt < -2) return;
      var s = proj(nm.alt, nm.az, C); if (!s) return;
      svg += '<text x="' + s[0].toFixed(1) + '" y="' + s[1].toFixed(1) + '" fill="#9fb6d6" font-size="11" text-anchor="middle" font-family="system-ui,sans-serif" opacity="0.85">' + esc(constName(nm.props)) + '</text>';
    });

    // horizon line
    if (hpts.length > 1) {
      svg += '<polyline points="' + hpts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="none" stroke="#ff5a5a" stroke-width="1.8"/>';
    }
    // cardinal direction marks (just above the horizon, scroll with the view)
    CARDINALS.forEach(function (c) {
      var s = proj(1.2, c.az, C); if (!s) return;
      if (s[0] < 0 || s[0] > W || s[1] < 0 || s[1] > H) return;
      svg += '<text x="' + s[0].toFixed(1) + '" y="' + s[1].toFixed(1) + '" fill="#ffb0b0" font-size="14" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif">' + esc(dirLabel(c.key)) + '</text>';
    });

    // meteor trail
    var a = proj(model.start.alt, model.start.az, C), b = proj(model.end.alt, model.end.az, C);
    if (a && b) {
      svg += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="#ff3b3b" stroke-width="2.5" stroke-linecap="round"/>';
      svg += '<circle cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="5" fill="#5dff5d"/>';
      svg += '<circle cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="5" fill="#ff3b3b"/>';
    }
    svg += '</svg>';
    host.innerHTML = svg;
  }

  var raf = false;
  function schedule() { if (raf) return; raf = true; requestAnimationFrame(function () { raf = false; paint(); }); }

  function resetView() {
    view = { az: model.centerAz, alt: model.centerAlt, fov: 100 };
  }

  function bind(host) {
    if (host._mpBound) return; host._mpBound = true;
    host.style.cursor = 'grab';
    host.addEventListener('wheel', function (e) {
      e.preventDefault();
      view.fov = Math.max(12, Math.min(150, view.fov * (e.deltaY < 0 ? 1 / 1.12 : 1.12)));
      schedule();
    }, { passive: false });
    var drag = false, lx = 0, ly = 0;
    host.addEventListener('mousedown', function (e) { drag = true; lx = e.clientX; ly = e.clientY; host.style.cursor = 'grabbing'; });
    global.addEventListener('mousemove', function (e) {
      if (!drag || !view) return;
      var H = host.clientHeight || 400, perPx = view.fov / H;
      view.az -= (e.clientX - lx) * perPx / Math.max(0.4, Math.cos(view.alt * D2R));
      view.alt = Math.max(-25, Math.min(85, view.alt + (e.clientY - ly) * perPx));
      view.az = ((view.az % 360) + 360) % 360;
      lx = e.clientX; ly = e.clientY; schedule();
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
  global.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(redraw, 150); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-zoom]'); if (!b || !view) return;
    var act = b.getAttribute('data-zoom');
    if (act === 'reset') { refit(); return; }
    view.fov = Math.max(12, Math.min(150, view.fov * (act === 'in' ? 0.8 : 1.25)));
    paint();
  });

  global.MeteorSky = { render: render, redraw: redraw, refit: refit, _detail: null };
})(window);
