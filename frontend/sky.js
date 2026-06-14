// MeteorSky — a self-contained local-sky view of a single meteor.
//
// No external service or API: the star catalogue and constellation data are
// static JSON we host (vendor/celestial/data/, Hipparcos + IAU); everything is
// computed and drawn (SVG) in the browser.
//
// The sky is shown as it looked from the observing site at the event instant,
// facing the meteor: the horizon is a line (with cardinal-direction marks), the
// ground below it is shaded, only above-horizon sky is drawn, and the trail is
// green (start) -> red (end). Constellation lines + names are shown. The view
// can be zoomed (wheel / buttons) and panned (drag); at default zoom it reads
// as a half-dome, when zoomed in it fills the panel.
(function (global) {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  var dataPromise = null, dataCache = null;
  var scene = null;       // precomputed unit-coordinate geometry for a measurement
  var view = null;        // { ox, oy, scale } screen transform (zoom/pan)
  var baseScale = 1;      // default fit scale (for zoom limits / reset)

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
          lines: res[1].features.reduce(function (acc, f) { return acc.concat(f.geometry.coordinates); }, []),
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
  // (alt,az) -> unit dome coords {x:-1..1, y:0..1}, or null if below horizon /
  // behind the viewer (front hemisphere of the facing direction A0 only).
  function project(alt, az, A0) {
    if (alt < 0) return null;
    var a = alt * D2R, z = az * D2R, A = A0 * D2R;
    var e = Math.sin(z) * Math.cos(a), n = Math.cos(z) * Math.cos(a), u = Math.sin(a);
    var xc = e * Math.cos(A) - n * Math.sin(A);
    var zc = e * Math.sin(A) + n * Math.cos(A);
    if (zc < 0) return null;
    var k = 1 / (1 + zc);
    return { x: xc * k, y: u * k };
  }

  var CARDINALS = [
    { key: 'N', az: 0 }, { key: 'NE', az: 45 }, { key: 'E', az: 90 }, { key: 'SE', az: 135 },
    { key: 'S', az: 180 }, { key: 'SW', az: 225 }, { key: 'W', az: 270 }, { key: 'NW', az: 315 },
  ];
  function dirLabel(key) { return global.MPI18n ? global.MPI18n.t('dir.' + key) : key; }
  function constName(props) {
    var key = (global.MPI18n && global.MPI18n.lang === 'en') ? 'en' : 'cz';
    return props[key] || props.en || props.name || '';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function prepare(detail, data) {
    var A0 = meanAz(detail.start.az, detail.end.az);
    var lst = lstDeg(new Date(detail.event_utc), detail.lon), lat = detail.lat;
    var rd = function (ra, dec) { var aa = radecToAltaz(ra, dec, lat, lst); return project(aa.alt, aa.az, A0); };

    var stars = [];
    data.stars.forEach(function (s) {
      var p = rd(s.ra, s.dec);
      if (p) stars.push({ x: p.x, y: p.y, r: Math.max(0.5, (6.2 - s.mag) * 0.42), op: Math.min(1, 0.35 + (6 - s.mag) * 0.13) });
    });

    var segs = [];
    data.lines.forEach(function (ls) {
      var cur = [];
      ls.forEach(function (pt) {
        var p = rd(pt[0], pt[1]);
        if (p) { cur.push(p); } else if (cur.length > 1) { segs.push(cur); cur = []; } else { cur = []; }
      });
      if (cur.length > 1) segs.push(cur);
    });

    var names = [];
    data.names.forEach(function (nm) {
      var p = rd(nm.ra, nm.dec);
      if (p) names.push({ x: p.x, y: p.y, props: nm.props });
    });

    var arcs = [];
    [30, 60].forEach(function (altLine) {
      var pts = [];
      for (var d = -90; d <= 90; d += 3) { var p = project(altLine, (A0 + d + 360) % 360, A0); if (p) pts.push(p); }
      if (pts.length > 1) arcs.push(pts);
    });

    var cards = [];
    CARDINALS.forEach(function (c) { var p = project(0, c.az, A0); if (p) cards.push({ x: p.x, key: c.key }); });

    scene = {
      stars: stars, segs: segs, names: names, arcs: arcs, cards: cards,
      start: project(detail.start.alt, detail.start.az, A0),
      end: project(detail.end.alt, detail.end.az, A0),
    };
  }

  function fit() {
    var host = document.getElementById('skymap');
    var W = host.clientWidth || 600, H = host.clientHeight || 400;
    baseScale = Math.min((W * 0.96) / 2, H * 0.94);
    view = { ox: W / 2, oy: (H + baseScale) / 2, scale: baseScale };
  }

  function paint() {
    var host = document.getElementById('skymap');
    if (!host || !scene) return;
    var W = host.clientWidth || 600, H = host.clientHeight || 400;
    if (!view) fit();
    var ox = view.ox, oy = view.oy, s = view.scale;
    var X = function (p) { return (ox + p.x * s).toFixed(1); };
    var Y = function (p) { return (oy - p.y * s).toFixed(1); };
    var horizonY = Math.max(0, Math.min(H, oy));

    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block">';
    // sky above the horizon, shaded ground below it
    svg += '<rect x="0" y="0" width="' + W + '" height="' + horizonY + '" fill="#070710"/>';
    svg += '<rect x="0" y="' + horizonY + '" width="' + W + '" height="' + (H - horizonY) + '" fill="#0c0608"/>';

    // altitude grid + cardinal meridian guides
    scene.arcs.forEach(function (pts) {
      svg += '<polyline points="' + pts.map(function (p) { return X(p) + ',' + Y(p); }).join(' ') + '" fill="none" stroke="#26263a" stroke-width="1" opacity="0.7"/>';
    });
    // constellation lines
    scene.segs.forEach(function (seg) {
      svg += '<polyline points="' + seg.map(function (p) { return X(p) + ',' + Y(p); }).join(' ') + '" fill="none" stroke="#3b6ea5" stroke-width="1" opacity="0.55"/>';
    });
    // stars
    scene.stars.forEach(function (st) {
      svg += '<circle cx="' + X(st) + '" cy="' + Y(st) + '" r="' + st.r.toFixed(1) + '" fill="#eef0ff" opacity="' + st.op.toFixed(2) + '"/>';
    });
    // constellation names
    scene.names.forEach(function (nm) {
      svg += '<text x="' + X(nm) + '" y="' + Y(nm) + '" fill="#9fb6d6" font-size="11" text-anchor="middle" font-family="system-ui,sans-serif" opacity="0.85">' + esc(constName(nm.props)) + '</text>';
    });
    // meteor trail
    if (scene.start && scene.end) {
      svg += '<line x1="' + X(scene.start) + '" y1="' + Y(scene.start) + '" x2="' + X(scene.end) + '" y2="' + Y(scene.end) + '" stroke="#ff3b3b" stroke-width="2.5" stroke-linecap="round"/>';
      svg += '<circle cx="' + X(scene.start) + '" cy="' + Y(scene.start) + '" r="5" fill="#5dff5d"/>';
      svg += '<circle cx="' + X(scene.end) + '" cy="' + Y(scene.end) + '" r="5" fill="#ff3b3b"/>';
    }
    // horizon line + cardinal ticks/labels
    var hx0 = Math.max(0, ox - s), hx1 = Math.min(W, ox + s);
    svg += '<line x1="' + hx0.toFixed(1) + '" y1="' + oy.toFixed(1) + '" x2="' + hx1.toFixed(1) + '" y2="' + oy.toFixed(1) + '" stroke="#ff5a5a" stroke-width="1.8"/>';
    scene.cards.forEach(function (c) {
      var cx = ox + c.x * s;
      if (cx < 0 || cx > W) return;
      svg += '<line x1="' + cx.toFixed(1) + '" y1="' + (oy - 6).toFixed(1) + '" x2="' + cx.toFixed(1) + '" y2="' + (oy + 6).toFixed(1) + '" stroke="#ff7a7a" stroke-width="1.5"/>';
      svg += '<text x="' + cx.toFixed(1) + '" y="' + (oy + 22).toFixed(1) + '" fill="#ffb0b0" font-size="13" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif">' + esc(dirLabel(c.key)) + '</text>';
    });
    svg += '</svg>';
    host.innerHTML = svg;
  }

  // --- interaction (zoom / pan) ---
  var rafPending = false;
  function schedulePaint() { if (rafPending) return; rafPending = true; requestAnimationFrame(function () { rafPending = false; paint(); }); }

  function zoomAt(mx, my, factor) {
    if (!view) fit();
    var px = (mx - view.ox) / view.scale, py = (view.oy - my) / view.scale;
    view.scale = Math.max(baseScale * 0.6, Math.min(baseScale * 40, view.scale * factor));
    view.ox = mx - px * view.scale;
    view.oy = my + py * view.scale;
    schedulePaint();
  }

  function bind(host) {
    if (host._mpBound) return;
    host._mpBound = true;
    host.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = host.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    var dragging = false, lx = 0, ly = 0;
    host.addEventListener('mousedown', function (e) { dragging = true; lx = e.clientX; ly = e.clientY; host.style.cursor = 'grabbing'; });
    global.addEventListener('mousemove', function (e) {
      if (!dragging || !view) return;
      view.ox += e.clientX - lx; view.oy += e.clientY - ly; lx = e.clientX; ly = e.clientY; schedulePaint();
    });
    global.addEventListener('mouseup', function () { dragging = false; host.style.cursor = 'grab'; });
    host.addEventListener('dblclick', function () { fit(); paint(); });
    host.style.cursor = 'grab';
  }

  // detail = { start:{alt,az}, end:{alt,az}, lat, lon, event_utc }
  function render(detail) {
    if (!detail || !detail.start || detail.start.alt == null || !detail.end || detail.end.alt == null ||
        detail.lat == null || detail.lon == null || !detail.event_utc) {
      return false;
    }
    MeteorSky._detail = detail;
    loadData().then(function (data) {
      if (MeteorSky._detail !== detail) return;
      var host = document.getElementById('skymap');
      if (host) bind(host);
      prepare(detail, data);
      view = null; // refit for the new measurement
      paint();
    });
    return true;
  }

  function redraw() { if (scene) paint(); }                 // re-label / resize, keep view
  function refit() { if (scene) { fit(); paint(); } }       // reset zoom/pan

  var resizeTimer = null;
  global.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(refit, 150); });

  // zoom buttons (data-zoom = in|out|reset)
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-zoom]');
    if (!b) return;
    var host = document.getElementById('skymap'); if (!host) return;
    var act = b.getAttribute('data-zoom');
    if (act === 'reset') { refit(); return; }
    zoomAt(host.clientWidth / 2, host.clientHeight / 2, act === 'in' ? 1.3 : 1 / 1.3);
  });

  global.MeteorSky = { render: render, redraw: redraw, refit: refit, _detail: null };
})(window);
