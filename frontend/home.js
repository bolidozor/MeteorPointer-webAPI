// Public home page: about + stats + map + compact recent observations.
const API = (window.API_BASE ?? '/api');
const t = (k, v) => window.MPI18n.t(k, v);

async function api(path) {
  return fetch(API + path, { credentials: 'include' }).catch(() => ({ ok: false }));
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function constCell(r) {
  const a = r.start_constellation, b = r.end_constellation;
  if (!a && !b) return '—';
  if (a && b && a !== b) return `${esc(a)} → ${esc(b)}`;
  return esc(a || b);
}

let map = null;

function initMap(rows) {
  if (map) { map.remove(); map = null; }

  map = L.map('obsMap', {
    center: [50, 15], zoom: 5,
    zoomControl: true, attributionControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);

  const points = [];
  rows.forEach((r) => {
    if (r.lat == null || r.lon == null) return;
    points.push([r.lat, r.lon]);
    const marker = L.circleMarker([r.lat, r.lon], {
      radius: 6, fillColor: '#ff5a5a', color: '#ff8a8a',
      weight: 1, opacity: 0.9, fillOpacity: 0.7,
    }).addTo(map);
    const cons = constCell(r);
    const q = r.quality == null ? '—' : Math.round(r.quality * 100) + ' %';
    marker.bindPopup(
      `<b>${esc(r.observer)}</b><br>` +
      `${new Date(r.received_at).toLocaleString()}<br>` +
      `${cons} · ${q}<br>` +
      `<a href="event.html?id=${encodeURIComponent(r.id)}" style="color:#7aa2ff">` +
      `${t('event.detail')}</a>`
    );
  });

  if (points.length) {
    try { map.fitBounds(L.latLngBounds(points).pad(0.2)); } catch (_) {}
  }
}

async function load() {
  // Nav button: show "My observations" when already signed in.
  const me = await api('/v1/web/me');
  if (me.ok) {
    document.getElementById('myObsBtn').classList.remove('hidden');
    document.getElementById('loginBtn').classList.add('hidden');
  }

  // Stats.
  const statsRes = await api('/v1/web/stats');
  if (statsRes.ok) {
    const s = await statsRes.json();
    document.getElementById('statReports').textContent = s.total_reports.toLocaleString();
    document.getElementById('statObservers').textContent = s.total_observers.toLocaleString();
  }

  // Recent observations.
  const res = await api('/v1/web/public-reports');
  const rows = res.ok ? await res.json() : [];

  document.getElementById('homeCount').textContent =
    rows.length ? t('home.count', { n: rows.length }) : '';

  document.getElementById('homeRows').innerHTML = rows.slice(0, 20).map((r) =>
    `<tr onclick="location.href='event.html?id=${encodeURIComponent(r.id)}'">
      <td>${new Date(r.received_at).toLocaleString()}</td>
      <td>${esc(r.observer)}</td>
      <td>${constCell(r)}</td>
      <td class="num">${r.quality == null ? '—' : Math.round(r.quality * 100) + ' %'}</td>
      <td><a href="event.html?id=${encodeURIComponent(r.id)}" onclick="event.stopPropagation()"
             style="color:#7aa2ff;font-size:12px" data-i18n="event.detail">${t('event.detail')}</a></td>
    </tr>`
  ).join('');

  initMap(rows);
}

document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    window.MPI18n.setLang(btn.getAttribute('data-lang'));
    localStorage.setItem('mp_lang', btn.getAttribute('data-lang'));
  });
});

(function initLang() {
  const stored = localStorage.getItem('mp_lang');
  const nav = (navigator.language || 'cs').slice(0, 2);
  const lang = window.MPI18n.supported(stored) ? stored : (window.MPI18n.supported(nav) ? nav : 'cs');
  window.MPI18n.setLang(lang);
})();

load();
