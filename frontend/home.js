// Public home page: about + stats + observations + sky dome.
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

let selectedTr = null;

async function selectReport(id, tr) {
  if (selectedTr) selectedTr.classList.remove('selected');
  selectedTr = tr;
  tr.classList.add('selected');

  const captionEl = document.getElementById('skyCaption');
  captionEl.textContent = t('sky.loading');

  const res = await api(`/v1/web/public-reports/${encodeURIComponent(id)}`);
  if (!res.ok) {
    captionEl.textContent = t('sky.loadFail');
    return;
  }
  const d = await res.json();

  if (!d.lat || !d.lon || !d.event_utc) {
    captionEl.textContent = t('sky.noCoords');
    return;
  }

  window.MeteorSky.render(d);
  captionEl.textContent = '';
}

async function load() {
  // Nav: show "My observations" when signed in.
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

  const tbody = document.getElementById('homeRows');
  tbody.innerHTML = rows.slice(0, 20).map((r) => {
    const id = encodeURIComponent(r.id);
    const q = r.quality == null ? '—' : Math.round(r.quality * 100) + ' %';
    return `<tr data-id="${esc(r.id)}">
      <td>${new Date(r.received_at).toLocaleString()}</td>
      <td>${esc(r.observer)}</td>
      <td>${constCell(r)}</td>
      <td class="num">${q}</td>
      <td><a href="event.html?id=${id}" class="detail-icon" title="${esc(t('event.detail'))}"
             onclick="event.stopPropagation()">↗</a></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => selectReport(tr.dataset.id, tr));
  });

  // Zoom controls wire-up (sky.js exposes MeteorSky._zoomAt / redraw / refit).
  document.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-zoom');
      if (action === 'reset') { window.MeteorSky.refit(); return; }
      const el = document.getElementById('skymap');
      const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
      window.MeteorSky._zoomAt(cx, cy, action === 'in' ? 1.4 : 1 / 1.4);
    });
  });
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
