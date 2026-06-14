// MeteorSky — a self-contained local-sky map that plots a meteor trail.
//
// Uses d3-celestial (BSD-3-Clause), served entirely from our own host: no
// external service, no API calls, no tracking. The star catalogue + Milky Way
// data are static JSON under vendor/celestial/data/. The whole projection and
// drawing happens in the browser.
//
// Given a parsed measurement (start/end RA/Dec + the observing site + the UTC
// event time) it renders the sky as seen from that site at that instant — with
// the horizon — and overlays the meteor's trail (green = start, red = end).
(function (global) {
  'use strict';

  var DATAPATH = 'vendor/celestial/data/';
  var inited = false;
  var trail = null; // transformed endpoint coords: [[ra,dec],[ra,dec]]

  function config(width) {
    return {
      container: 'skymap',
      width: width || 440,
      projection: 'stereographic', // hemispheric: shows a horizon circle
      transform: 'equatorial',
      follow: 'zenith',
      location: true,              // enables the date/location (skyview) machinery
      controls: false,
      interactive: true,
      disableAnimations: true,
      datapath: DATAPATH,
      stars: { show: true, limit: 6, colors: true, size: 6, designation: false,
               propername: false, names: false },
      dsos: { show: false },
      planets: { show: false },
      constellations: {
        show: true, names: true, namesType: 'iau',
        nameStyle: { fill: '#c9cbe0', font: '11px Helvetica, Arial, sans-serif',
                     align: 'center', baseline: 'middle' },
        lines: true, lineStyle: { stroke: '#6f7290', width: 1, opacity: 0.7 },
        bounds: false
      },
      mw: { show: true, style: { fill: '#ffffff', opacity: 0.12 } },
      lines: {
        graticule: { show: true, stroke: '#3a3a4a', width: 0.5, opacity: 0.5 },
        equatorial: { show: false }, ecliptic: { show: false },
        galactic: { show: false }, supergalactic: { show: false }
      },
      horizon: { show: true, stroke: '#ff5a5a', width: 1.6, fill: '#0a0010', opacity: 0.45 },
      background: { fill: '#0a0a14', opacity: 1, stroke: '#0a0a14', width: 1 },
      daylight: { show: false }
    };
  }

  // Register a custom canvas layer that draws the current trail on every redraw
  // (so it follows pan/zoom and date changes). Added once, before display.
  function addTrailLayer() {
    Celestial.add({
      type: 'line',
      callback: function () {},
      redraw: function () {
        if (!trail) return;
        var ctx = Celestial.context;
        var a = Celestial.clip(trail[0]) ? Celestial.mapProjection(trail[0]) : null;
        var b = Celestial.clip(trail[1]) ? Celestial.mapProjection(trail[1]) : null;
        if (a && b) {
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff3b3b'; ctx.globalAlpha = 1;
          ctx.stroke();
        }
        if (a) { ctx.beginPath(); ctx.arc(a[0], a[1], 5, 0, 2 * Math.PI); ctx.fillStyle = '#5dff5d'; ctx.fill(); }
        if (b) { ctx.beginPath(); ctx.arc(b[0], b[1], 5, 0, 2 * Math.PI); ctx.fillStyle = '#ff3b3b'; ctx.fill(); }
      }
    });
  }

  function setTrail(start, end) {
    var geo = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [start, end] } }
    ] };
    trail = Celestial.getData(geo, 'equatorial').features[0].geometry.coordinates;
  }

  // detail = { start:{ra,dec}, end:{ra,dec}, lat, lon, event_utc }
  // Returns true if it could render (needs both RA/Dec, a site and a UTC time).
  function render(detail) {
    if (!detail || !detail.start || detail.start.ra == null ||
        !detail.end || detail.end.ra == null ||
        detail.lat == null || detail.lon == null || !detail.event_utc) {
      return false;
    }
    if (!inited) {
      var el = document.getElementById('skymap');
      addTrailLayer();
      Celestial.display(config(el ? el.clientWidth : 440));
      inited = true;
    }
    setTrail([detail.start.ra, detail.start.dec], [detail.end.ra, detail.end.dec]);
    Celestial.skyview({ date: new Date(detail.event_utc), location: [detail.lat, detail.lon] });
    return true;
  }

  global.MeteorSky = { render: render };
})(window);
