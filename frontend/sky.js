// MeteorSky — a self-contained all-sky view of the sky for one meteor.
//
// No external service or API: the star catalogue and constellation data are
// static JSON we host (vendor/celestial/data/, Hipparcos + IAU). Everything is
// computed and drawn (SVG) in the browser.
//
// Stereographic ("stereo") projection of the local sky at the event instant,
// like VirtualSky: the projection is centred on a point ON the horizon in the
// viewing direction, so the HORIZON is a straight horizontal line at the bottom
// and the sky domes up above it (it is NOT a circle). It is conformal, so
// constellation shapes are undistorted; meridians (constant azimuth) curve up
// and converge at the zenith; almucantars (constant altitude) are arcs. Drag
// turns the view left/right (azimuth) with the horizon line fixed; the wheel /
// buttons zoom the field of view. The ground below the horizon is shaded. The
// meteor trail is green (start) -> red (end).
(function (global) {
  'use strict';
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  var dataPromise = null, dataCache = null;
  var model = null;
  var view = null;   // { az: centre azimuth (deg), foc: scale (px) }
  var baseFoc = 1;

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
        // Index constellation props by IAU abbreviation (e.g. "Ori") so the
        // caption can show a localized full name for a detected constellation.
        dataCache.byAbbr = {};
        res[2].features.forEach(function (f) {
          var k = (f.properties.desig || f.id || '').toLowerCase();
          if (k) dataCache.byAbbr[k] = f.properties;
        });
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
  // Localized full constellation name for an IAU abbreviation (e.g. "Ori" ->
  // "Orion"/"Orion"); falls back to the abbreviation until the data has loaded.
  function constNameByAbbr(abbr) {
    if (!abbr) return '';
    var p = dataCache && dataCache.byAbbr && dataCache.byAbbr[String(abbr).toLowerCase()];
    return p ? constName(p) : abbr;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function buildSky(lat, lst, data) {
    var aa = function (ra, dec) { return radecToAltaz(ra, dec, lat, lst); };
    return {
      stars: data.stars.map(function (s) { var p = aa(s.ra, s.dec); return { alt: p.alt, az: p.az, mag: s.mag }; }),
      lines: data.lines.map(function (ls) { return ls.map(function (pt) { var p = aa(pt[0], pt[1]); return [p.alt, p.az]; }); }),
      names: data.names.map(function (n) { var p = aa(n.ra, n.dec); return { alt: p.alt, az: p.az, props: n.props }; }),
    };
  }

  function build(detail, data) {
    var lst = lstDeg(new Date(detail.event_utc), detail.lon), lat = detail.lat;
    var sky = buildSky(lat, lst, data);
    model = {
      stars: sky.stars, lines: sky.lines, names: sky.names,
      trails: [{ start: { alt: detail.start.alt, az: detail.start.az }, end: { alt: detail.end.alt, az: detail.end.az } }],
      centerAz: meanAz(detail.start.az, detail.end.az),
    };
  }

  // Reference location for "show all" view (centre of Czech Republic).
  var REF_LAT = 49.8, REF_LON = 15.5;

  function buildAll(rows, data) {
    var lst = lstDeg(new Date(), REF_LON);
    var sky = buildSky(REF_LAT, lst, data);
    var trails = [];
    var azSum = 0, azCount = 0;
    rows.forEach(function (r) {
      if (r.start_alt == null || r.start_az == null || r.end_alt == null || r.end_az == null) return;
      trails.push({ start: { alt: r.start_alt, az: r.start_az }, end: { alt: r.end_alt, az: r.end_az } });
      azSum += r.start_az; azCount++;
    });
    var centerAz = azCount ? ((azSum / azCount) % 360 + 360) % 360 : 180;
    model = { stars: sky.stars, lines: sky.lines, names: sky.names, trails: trails, centerAz: centerAz };
  }

  function geom() {
    var host = document.getElementById('skymap');
    var W = host.clientWidth || 600, H = host.clientHeight || 400;
    // Horizon line near the bottom; default scale puts the zenith at ~20% from
    // the top (sky fills ~80% of the height).
    return { W: W, H: H, cx: W / 2, baseY: H * 0.9, base: H * 0.35 };
  }

  function paint() {
    var host = document.getElementById('skymap');
    if (!host || !model) return;
    var g = geom(), W = g.W, H = g.H, cx = g.cx, baseY = g.baseY, foc = view.foc;
    var A = view.az * D2R, fE = Math.sin(A), fN = Math.cos(A), rE = Math.cos(A), rN = -Math.sin(A);
    // Stereographic centred on the horizon point at azimuth A: horizon -> the
    // straight line y = baseY; zenith -> straight up; sky domes above.
    var px = function (alt, az) {
      var a = alt * D2R, z = az * D2R;
      var e = Math.sin(z) * Math.cos(a), n = Math.cos(z) * Math.cos(a), u = Math.sin(a);
      var zc = e * fE + n * fN;
      if (zc <= -0.15) return null;          // behind the viewer -> cull
      var k = 2 / (1 + zc);
      return [cx + foc * k * (e * rE + n * rN), baseY - foc * k * u];
    };
    var onx = function (p) { return p && p[0] >= -60 && p[0] <= W + 60; };
    var project = function (coords, minAlt) {
      var segs = [], cur = [];
      for (var i = 0; i < coords.length; i++) {
        var p = (coords[i][0] < (minAlt == null ? 0 : minAlt)) ? null : px(coords[i][0], coords[i][1]);
        if (!p) { if (cur.length > 1) segs.push(cur); cur = []; continue; }
        cur.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
      }
      if (cur.length > 1) segs.push(cur);
      return segs;
    };

    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block">';
    svg += '<rect x="0" y="0" width="' + W + '" height="' + baseY.toFixed(0) + '" fill="#070710"/>';                  // sky
    svg += '<rect x="0" y="' + baseY.toFixed(0) + '" width="' + W + '" height="' + (H - baseY).toFixed(0) + '" fill="#0c0608"/>'; // ground

    // alt-azimuth grid: meridians (converge at the zenith) + almucantars
    for (var mz = 0; mz < 360; mz += 30) {
      var mer = []; for (var ma = 0; ma <= 89; ma += 3) mer.push([ma, mz]);
      var maj = (mz % 90 === 0);
      project(mer, 0).forEach(function (sg) { svg += grid(sg, maj ? '#2f2f46' : '#222232', maj ? 0.7 : 0.5); });
    }
    [30, 60].forEach(function (al) {
      var alm = []; for (var d = -180; d <= 180; d += 3) alm.push([al, ((A * R2D + d) % 360 + 360) % 360]);
      project(alm, 0).forEach(function (sg) { svg += grid(sg, '#222232', 0.5); });
    });

    // constellation lines
    model.lines.forEach(function (ls) { project(ls, -3).forEach(function (sg) { svg += line(sg); }); });
    // stars
    model.stars.forEach(function (st) {
      if (st.alt < 0) return;
      var p = px(st.alt, st.az); if (!onx(p)) return;
      var r = Math.max(0.5, (6.2 - st.mag) * 0.42);
      svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#eef0ff" opacity="' + Math.min(1, 0.35 + (6 - st.mag) * 0.13).toFixed(2) + '"/>';
    });
    // constellation names
    model.names.forEach(function (nm) {
      if (nm.alt < -2) return;
      var p = px(nm.alt, nm.az); if (!onx(p)) return;
      svg += '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" fill="#9fb6d6" font-size="11" text-anchor="middle" font-family="system-ui,sans-serif" opacity="0.85">' + esc(constName(nm.props)) + '</text>';
    });
    // meteor trail(s)
    var multi = model.trails.length > 1;
    model.trails.forEach(function (tr) {
      var a = px(tr.start.alt, tr.start.az), b = px(tr.end.alt, tr.end.az);
      if (!a || !b || (!onx(a) && !onx(b))) return;
      svg += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="#ff3b3b" stroke-width="' + (multi ? '1.8' : '2.5') + '" stroke-linecap="round" opacity="' + (multi ? '0.8' : '1') + '"/>';
      svg += '<circle cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="' + (multi ? '3' : '5') + '" fill="#5dff5d" opacity="' + (multi ? '0.8' : '1') + '"/>';
      svg += '<circle cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="' + (multi ? '3' : '5') + '" fill="#ff3b3b" opacity="' + (multi ? '0.8' : '1') + '"/>';
    });

    // horizon line (straight, fixed) + cardinal marks
    svg += '<line x1="0" y1="' + baseY.toFixed(1) + '" x2="' + W + '" y2="' + baseY.toFixed(1) + '" stroke="#ff5a5a" stroke-width="1.8"/>';
    CARDINALS.forEach(function (cd) {
      var p = px(0, cd.az); if (!onx(p)) return;
      svg += '<line x1="' + p[0].toFixed(1) + '" y1="' + (baseY - 7).toFixed(1) + '" x2="' + p[0].toFixed(1) + '" y2="' + (baseY + 7).toFixed(1) + '" stroke="#ff7a7a" stroke-width="1.5"/>';
      svg += '<text x="' + p[0].toFixed(1) + '" y="' + (baseY + 24).toFixed(1) + '" fill="#ffb0b0" font-size="14" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif">' + esc(dirLabel(cd.key)) + '</text>';
    });
    svg += '</svg>';
    host.innerHTML = svg;
  }
  function line(pts) { return '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#3b6ea5" stroke-width="1" opacity="0.6"/>'; }
  function grid(pts, stroke, op) { return '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + stroke + '" stroke-width="1" opacity="' + op + '"/>'; }

  var raf = false;
  function schedule() { if (raf) return; raf = true; requestAnimationFrame(function () { raf = false; paint(); }); }

  function reset() { var g = geom(); baseFoc = g.base; view = { az: model.centerAz, foc: baseFoc }; }
  // Zoom keeps the sky under the cursor put horizontally (more detail there).
  function zoomAt(mx, factor) {
    var g = geom();
    var nf = Math.max(baseFoc, Math.min(baseFoc * 6, view.foc * factor));
    view.az += (mx - g.cx) * (1 / view.foc - 1 / nf) * R2D;
    view.foc = nf;
    view.az = ((view.az % 360) + 360) % 360;
  }

  function bind(host) {
    if (host._mpBound) return; host._mpBound = true;
    host.style.cursor = 'grab';
    host.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = host.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      schedule();
    }, { passive: false });
    var drag = false, lx = 0;
    host.addEventListener('mousedown', function (e) { drag = true; lx = e.clientX; host.style.cursor = 'grabbing'; });
    global.addEventListener('mousemove', function (e) {
      if (!drag || !view) return;
      view.az = ((view.az - (e.clientX - lx) / view.foc * R2D) % 360 + 360) % 360;  // turn left/right
      lx = e.clientX; schedule();
    });
    global.addEventListener('mouseup', function () { drag = false; host.style.cursor = 'grab'; });
    host.addEventListener('dblclick', function () { reset(); paint(); });
  }

  function render(detail) {
    if (!detail || !detail.start || detail.start.alt == null || !detail.end || detail.end.alt == null ||
        detail.lat == null || detail.lon == null || !detail.event_utc) return false;
    MeteorSky._detail = detail;
    loadData().then(function (data) {
      if (MeteorSky._detail !== detail) return;
      var host = document.getElementById('skymap'); if (host) bind(host);
      build(detail, data); reset(); paint();
      if (typeof global.onSkyData === 'function') global.onSkyData(detail);
    });
    return true;
  }

  function renderAll(rows) {
    MeteorSky._detail = null;
    loadData().then(function (data) {
      var host = document.getElementById('skymap'); if (host) bind(host);
      buildAll(rows, data); reset(); paint();
    });
  }

  function redraw() { if (model) paint(); }
  function refit() { if (model) { reset(); paint(); } }

  var rt = null;
  global.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(redraw, 150); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-zoom]'); if (!b || !view) return;
    var act = b.getAttribute('data-zoom'), host = document.getElementById('skymap'); if (!host) return;
    if (act === 'reset') refit();
    else { zoomAt(host.clientWidth / 2, act === 'in' ? 1.3 : 1 / 1.3); paint(); }
  });

  global.MeteorSky = {
    render: render, renderAll: renderAll, redraw: redraw, refit: refit,
    constNameByAbbr: constNameByAbbr,
    _zoomAt: zoomAt,
    _detail: null,
  };
})(window);
