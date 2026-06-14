// MeteorSky — a self-contained all-sky view of the sky for one meteor.
//
// No external service or API: the star catalogue and constellation data are
// static JSON we host (vendor/celestial/data/, Hipparcos + IAU). Everything is
// computed and drawn (SVG) in the browser.
//
// Stereographic ("stereo") projection of the local sky at the event instant,
// like VirtualSky: a circular map with the ZENITH at the centre and the HORIZON
// as the outer circle. It is conformal, so constellation shapes are undistorted.
// Meridians (constant azimuth) are radial lines from the zenith; almucantars
// (constant altitude) are concentric circles; cardinal directions sit around
// the horizon circle. The ground (below the horizon) is the area outside the
// circle. Looking up: North at top, East at left. Scroll/buttons zoom, drag
// pans, double-click resets. The meteor trail is green (start) -> red (end).
(function (global) {
  'use strict';
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  var dataPromise = null, dataCache = null;
  var model = null;
  var view = { zoom: 1, panX: 0, panY: 0 };

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
    };
  }

  function frame() {
    var host = document.getElementById('skymap');
    var W = host.clientWidth || 600, H = host.clientHeight || 400;
    var R = (Math.min(W, H) / 2) * 0.95 * view.zoom;     // horizon-circle radius
    return { W: W, H: H, cx: W / 2 + view.panX, cy: H / 2 + view.panY, R: R };
  }

  function paint() {
    var host = document.getElementById('skymap');
    if (!host || !model) return;
    var f = frame(), W = f.W, H = f.H, cx = f.cx, cy = f.cy, R = f.R;
    // stereographic: a point at zenith distance z maps to radius R*tan(z/2).
    var px = function (alt, az) {
      var rr = R * Math.tan((90 - alt) / 2 * D2R);
      var a = az * D2R;
      return [cx - rr * Math.sin(a), cy - rr * Math.cos(a)];   // N up, E left (looking up)
    };
    var below = function (alt) { return alt < -1.5; };

    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block">';
    svg += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0c0608"/>';   // ground
    svg += '<defs><clipPath id="mpsky"><circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + R.toFixed(1) + '"/></clipPath></defs>';
    svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + R.toFixed(1) + '" fill="#070710"/>';
    svg += '<g clip-path="url(#mpsky)">';

    // almucantars (constant altitude -> concentric circles)
    [30, 60].forEach(function (al) {
      var r = R * Math.tan((90 - al) / 2 * D2R);
      svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="none" stroke="#222232" stroke-width="1" opacity="0.55"/>';
    });
    // meridians (constant azimuth -> radial lines from the zenith)
    for (var mz = 0; mz < 360; mz += 30) {
      var p0 = px(80, mz), p1 = px(0, mz), maj = (mz % 90 === 0);
      svg += '<line x1="' + p0[0].toFixed(1) + '" y1="' + p0[1].toFixed(1) + '" x2="' + p1[0].toFixed(1) + '" y2="' + p1[1].toFixed(1) + '" stroke="' + (maj ? '#2f2f46' : '#222232') + '" stroke-width="1" opacity="' + (maj ? 0.75 : 0.55) + '"/>';
    }

    // constellation lines (azimuthal: no seam; just split where a point dips below)
    model.lines.forEach(function (ls) {
      var cur = [];
      for (var i = 0; i < ls.length; i++) {
        if (below(ls[i][0])) { if (cur.length > 1) svg += line(cur); cur = []; continue; }
        var p = px(ls[i][0], ls[i][1]); cur.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
      }
      if (cur.length > 1) svg += line(cur);
    });
    // stars
    model.stars.forEach(function (st) {
      if (st.alt < 0) return;
      var p = px(st.alt, st.az), r = Math.max(0.5, (6.2 - st.mag) * 0.42);
      svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#eef0ff" opacity="' + Math.min(1, 0.35 + (6 - st.mag) * 0.13).toFixed(2) + '"/>';
    });
    // constellation names
    model.names.forEach(function (nm) {
      if (below(nm.alt)) return;
      var p = px(nm.alt, nm.az);
      svg += '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" fill="#9fb6d6" font-size="11" text-anchor="middle" font-family="system-ui,sans-serif" opacity="0.85">' + esc(constName(nm.props)) + '</text>';
    });
    // meteor trail
    var a = px(model.start.alt, model.start.az), b = px(model.end.alt, model.end.az);
    svg += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="#ff3b3b" stroke-width="2.5" stroke-linecap="round"/>';
    svg += '<circle cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="5" fill="#5dff5d"/>';
    svg += '<circle cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="5" fill="#ff3b3b"/>';
    svg += '</g>';

    // horizon circle + cardinal labels around it
    svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + R.toFixed(1) + '" fill="none" stroke="#ff5a5a" stroke-width="1.8"/>';
    CARDINALS.forEach(function (cd) {
      var aa = cd.az * D2R, lr = R + 16;
      var x = cx - lr * Math.sin(aa), y = cy - lr * Math.cos(aa);
      var big = (cd.az % 90 === 0);
      svg += '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" fill="#ffb0b0" font-size="' + (big ? 15 : 12) + '" font-weight="700" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif">' + esc(dirLabel(cd.key)) + '</text>';
    });
    svg += '</svg>';
    host.innerHTML = svg;
  }
  function line(pts) { return '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#3b6ea5" stroke-width="1" opacity="0.6"/>'; }

  var raf = false;
  function schedule() { if (raf) return; raf = true; requestAnimationFrame(function () { raf = false; paint(); }); }

  function reset() { view = { zoom: 1, panX: 0, panY: 0 }; }
  function zoomAt(mx, my, factor) {
    var f = frame();
    var nz = Math.max(1, Math.min(12, view.zoom * factor));
    var k = nz / view.zoom;
    view.zoom = nz;
    view.panX = (mx - (mx - f.cx) * k) - f.W / 2;
    view.panY = (my - (my - f.cy) * k) - f.H / 2;
  }

  function bind(host) {
    if (host._mpBound) return; host._mpBound = true;
    host.style.cursor = 'grab';
    host.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = host.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      schedule();
    }, { passive: false });
    var drag = false, lx = 0, ly = 0;
    host.addEventListener('mousedown', function (e) { drag = true; lx = e.clientX; ly = e.clientY; host.style.cursor = 'grabbing'; });
    global.addEventListener('mousemove', function (e) {
      if (!drag) return;
      view.panX += e.clientX - lx; view.panY += e.clientY - ly; lx = e.clientX; ly = e.clientY; schedule();
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
    });
    return true;
  }
  function redraw() { if (model) paint(); }
  function refit() { if (model) { reset(); paint(); } }

  var rt = null;
  global.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(redraw, 150); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-zoom]'); if (!b) return;
    var act = b.getAttribute('data-zoom'), host = document.getElementById('skymap'); if (!host) return;
    if (act === 'reset') refit();
    else { zoomAt(host.clientWidth / 2, host.clientHeight / 2, act === 'in' ? 1.3 : 1 / 1.3); paint(); }
  });

  global.MeteorSky = { render: render, redraw: redraw, refit: refit, _detail: null };
})(window);
