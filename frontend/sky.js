// MeteorSky — a self-contained "horizon dome" view of a single meteor.
//
// No external service or API: bright stars come from a static catalogue we
// host (vendor/celestial/data/stars.6.json, Hipparcos), everything is computed
// and drawn (SVG) in the browser.
//
// The sky is shown the way it looked from the observing site at the event time,
// as a half-dome: the flat bottom edge is the HORIZON (with cardinal-direction
// marks), altitude grows upward to the zenith at the top, and only what was
// ABOVE the horizon is drawn. The view faces the meteor, and the trail is drawn
// green (start) -> red (end). Below-horizon sky is never shown.
(function (global) {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  var starsPromise = null;
  var lastDetail = null;

  function loadStars() {
    if (!starsPromise) {
      starsPromise = fetch('vendor/celestial/data/stars.6.json')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          return j.features.map(function (f) {
            return { ra: f.geometry.coordinates[0], dec: f.geometry.coordinates[1], mag: f.properties.mag };
          }).filter(function (s) { return s.mag <= 5.2; });
        })
        .catch(function () { return []; });
    }
    return starsPromise;
  }

  // Greenwich -> local apparent sidereal time (degrees), mean (arc-minute fine).
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
    var x = Math.cos(a * D2R) + Math.cos(b * D2R);
    var y = Math.sin(a * D2R) + Math.sin(b * D2R);
    return ((Math.atan2(y, x) * R2D) % 360 + 360) % 360;
  }

  // Project (alt,az) onto the half-dome facing azimuth A0.
  // Returns unit coords {x:-1..1, y:0..1} (zenith at (0,1)), or null if the
  // point is below the horizon or behind the viewer (front hemisphere only).
  function project(alt, az, A0) {
    if (alt < 0) return null;
    var a = alt * D2R, z = az * D2R, A = A0 * D2R;
    var e = Math.sin(z) * Math.cos(a), n = Math.cos(z) * Math.cos(a), u = Math.sin(a);
    var xc = e * Math.cos(A) - n * Math.sin(A);   // right  = (cosA, -sinA)
    var zc = e * Math.sin(A) + n * Math.cos(A);   // forward = (sinA,  cosA)
    if (zc < 0) return null;
    var k = 1 / (1 + zc);
    return { x: xc * k, y: u * k };
  }

  function el(name, attrs) {
    var node = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    return node;
  }

  var CARDINALS = [
    { key: 'N', az: 0 }, { key: 'NE', az: 45 }, { key: 'E', az: 90 }, { key: 'SE', az: 135 },
    { key: 'S', az: 180 }, { key: 'SW', az: 225 }, { key: 'W', az: 270 }, { key: 'NW', az: 315 },
  ];

  function dirLabel(key) {
    return (global.MPI18n ? global.MPI18n.t('dir.' + key) : key);
  }

  function draw(detail, stars) {
    var host = document.getElementById('skymap');
    if (!host) return;
    var W = host.clientWidth || 600, H = host.clientHeight || 400;

    // Half-dome geometry: width 2R, height R, centred in the panel.
    var R = Math.min((W * 0.96) / 2, H * 0.94);
    var cx = W / 2;
    var baseY = (H + R) / 2;             // horizon line y
    var P = function (p) { return [cx + p.x * R, baseY - p.y * R]; };

    var A0 = meanAz(detail.start.az, detail.end.az);
    var lst = lstDeg(new Date(detail.event_utc), detail.lon);

    var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, style: 'display:block' });

    // Sky fill: clip to the upper half-disk.
    var clip = el('clipPath', { id: 'domeClip' });
    var arc = 'M ' + (cx - R) + ' ' + baseY + ' A ' + R + ' ' + R + ' 0 0 1 ' + (cx + R) + ' ' + baseY + ' Z';
    clip.appendChild(el('path', { d: arc }));
    var defs = el('defs', {}); defs.appendChild(clip); svg.appendChild(defs);
    svg.appendChild(el('path', { d: arc, fill: '#070710', stroke: 'none' }));

    var g = el('g', { 'clip-path': 'url(#domeClip)' });

    // Altitude grid arcs (30 deg, 60 deg) sampled across the facing hemisphere.
    [30, 60].forEach(function (altLine) {
      var pts = [];
      for (var d = -90; d <= 90; d += 3) {
        var p = project(altLine, (A0 + d + 360) % 360, A0);
        if (p) pts.push(P(p).join(','));
      }
      if (pts.length > 1) g.appendChild(el('polyline', { points: pts.join(' '), fill: 'none', stroke: '#2a2a3a', 'stroke-width': 1, opacity: 0.7 }));
    });
    // Vertical guides toward each visible cardinal direction.
    CARDINALS.forEach(function (c) {
      var pts = [];
      for (var alt = 0; alt <= 80; alt += 4) {
        var p = project(alt, c.az, A0);
        if (p) pts.push(P(p).join(','));
      }
      if (pts.length > 1) g.appendChild(el('polyline', { points: pts.join(' '), fill: 'none', stroke: '#20202c', 'stroke-width': 1, opacity: 0.6 }));
    });

    // Stars.
    stars.forEach(function (s) {
      var aa = radecToAltaz(s.ra, s.dec, detail.lat, lst);
      var p = project(aa.alt, aa.az, A0);
      if (!p) return;
      var xy = P(p);
      var r = Math.max(0.5, (6.2 - s.mag) * 0.42);
      g.appendChild(el('circle', { cx: xy[0], cy: xy[1], r: r, fill: '#eef0ff', opacity: Math.min(1, 0.35 + (6 - s.mag) * 0.13) }));
    });

    // Meteor trail (use the measured alt/az directly — exact, no inverse).
    var ps = project(detail.start.alt, detail.start.az, A0);
    var pe = project(detail.end.alt, detail.end.az, A0);
    if (ps && pe) {
      var a = P(ps), b = P(pe);
      g.appendChild(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#ff3b3b', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
      g.appendChild(el('circle', { cx: a[0], cy: a[1], r: 5, fill: '#5dff5d' }));
      g.appendChild(el('circle', { cx: b[0], cy: b[1], r: 5, fill: '#ff3b3b' }));
    }
    svg.appendChild(g);

    // Dome outline + horizon line.
    svg.appendChild(el('path', { d: arc, fill: 'none', stroke: '#ff5a5a', 'stroke-width': 1.4, opacity: 0.55 }));
    svg.appendChild(el('line', { x1: cx - R, y1: baseY, x2: cx + R, y2: baseY, stroke: '#ff5a5a', 'stroke-width': 1.8 }));

    // Cardinal-direction ticks + labels along the horizon.
    CARDINALS.forEach(function (c) {
      var p = project(0, c.az, A0);
      if (!p) return;
      var x = cx + p.x * R;
      svg.appendChild(el('line', { x1: x, y1: baseY - 6, x2: x, y2: baseY + 6, stroke: '#ff7a7a', 'stroke-width': 1.5 }));
      var label = el('text', { x: x, y: baseY + 22, fill: '#ffb0b0', 'font-size': 13, 'font-weight': 700, 'text-anchor': 'middle', 'font-family': 'system-ui, sans-serif' });
      label.textContent = dirLabel(c.key);
      svg.appendChild(label);
    });

    host.innerHTML = '';
    host.appendChild(svg);
  }

  // detail = { start:{alt,az}, end:{alt,az}, lat, lon, event_utc }
  function render(detail) {
    if (!detail || !detail.start || detail.start.alt == null ||
        !detail.end || detail.end.alt == null ||
        detail.lat == null || detail.lon == null || !detail.event_utc) {
      return false;
    }
    lastDetail = detail;
    loadStars().then(function (stars) { if (lastDetail === detail) draw(detail, stars); });
    return true;
  }

  function redraw() {
    if (!lastDetail) return;
    loadStars().then(function (stars) { draw(lastDetail, stars); });
  }

  var resizeTimer = null;
  global.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redraw, 150);
  });

  global.MeteorSky = { render: render, redraw: redraw };
})(window);
