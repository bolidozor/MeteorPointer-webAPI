// Public home page: about + stats + all-trails sky map + recent observations table.
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

  // Show all trajectories on the sky map at once.
  window.MeteorSky.renderAll(rows);

  document.getElementById('homeRows').innerHTML = rows.slice(0, 30).map((r) => {
    const id = encodeURIComponent(r.id);
    const q = r.quality == null ? '—' : Math.round(r.quality * 100) + ' %';
    return `<tr>
      <td>${new Date(r.received_at).toLocaleString()}</td>
      <td>${esc(r.observer)}</td>
      <td>${constCell(r)}</td>
      <td class="num">${q}</td>
      <td><a href="event.html?id=${id}" class="detail-icon" title="${esc(t('event.detail'))}">↗</a></td>
    </tr>`;
  }).join('');
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
