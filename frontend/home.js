// Public home page: about + compact list of all observers' latest measurements.
const API = (window.API_BASE ?? '/api');
const t = (k, v) => window.MPI18n.t(k, v);

async function api(path) {
  return fetch(API + path, { credentials: 'include' });
}

function fmt(v, d = 1) {
  return v == null ? '—' : Number(v).toFixed(d);
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
  // Check if already logged in to decide which nav button to show.
  const me = await api('/v1/web/me').catch(() => ({ ok: false }));
  if (me.ok) {
    document.getElementById('myObsBtn').classList.remove('hidden');
    document.getElementById('loginBtn').classList.add('hidden');
  }

  const res = await api('/v1/web/public-reports').catch(() => null);
  const rows = (res && res.ok) ? await res.json() : [];

  document.getElementById('homeCount').textContent =
    rows.length ? t('home.count', { n: rows.length }) : '';

  document.getElementById('homeRows').innerHTML = rows.slice(0, 20).map((r) =>
    `<tr onclick="location.href='event.html?id=${encodeURIComponent(r.id)}'">
      <td>${new Date(r.received_at).toLocaleString()}</td>
      <td>${esc(r.observer)}</td>
      <td>${constCell(r)}</td>
      <td class="num">${r.quality == null ? '—' : Math.round(r.quality * 100) + ' %'}</td>
    </tr>`
  ).join('');
}

// Language switcher (no device setting to persist on home page).
document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const lang = btn.getAttribute('data-lang');
    window.MPI18n.setLang(lang);
    localStorage.setItem('mp_lang', lang);
  });
});

(function initLang() {
  const stored = localStorage.getItem('mp_lang');
  const nav = (navigator.language || 'cs').slice(0, 2);
  const lang = window.MPI18n.supported(stored) ? stored : (window.MPI18n.supported(nav) ? nav : 'cs');
  window.MPI18n.setLang(lang);
})();

load();
