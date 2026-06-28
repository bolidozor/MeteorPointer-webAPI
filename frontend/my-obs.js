// My observations page: authenticated, shows own measurement list.
// Each row links to event.html?id=... for the full detail + sky view.
const API = (window.API_BASE ?? '/api');
const t = (k, v) => window.MPI18n.t(k, v);
const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  return fetch(API + path, { credentials: 'include', ...opts });
}

function fmt(v, d = 1) { return v == null ? '—' : Number(v).toFixed(d); }

function show(section) {
  for (const id of ['login', 'app']) $(id).classList.toggle('hidden', id !== section);
  $('logout').classList.toggle('hidden', section !== 'app');
}

async function loadObs() {
  const me = await api('/v1/web/me');
  if (!me.ok) return startLogin();
  const m = await me.json();
  if (window.MPI18n.supported(m.language)) {
    window.MPI18n.setLang(m.language);
    localStorage.setItem('mp_lang', m.language);
  }

  const res = await api('/v1/web/reports');
  const rows = res.ok ? await res.json() : [];
  $('myIntro').textContent = t('myobs.intro', { device: m.device_id.slice(0, 8), n: rows.length });

  $('myRows').innerHTML = rows.map((r) =>
    `<tr onclick="location.href='event.html?id=${encodeURIComponent(r.id)}'">
      <td>${new Date(r.received_at).toLocaleString()}</td>
      <td><span class="pill">${r.status}</span></td>
      <td class="num">${fmt(r.start_alt)}° / ${fmt(r.start_az)}°</td>
      <td class="num">${fmt(r.end_alt)}° / ${fmt(r.end_az)}°</td>
      <td class="num">${r.quality == null ? '—' : Math.round(r.quality * 100) + ' %'}</td>
      <td class="num">${r.lat == null ? '—' : `${fmt(r.lat, 5)}, ${fmt(r.lon, 5)}`}</td>
      <td class="num">${r.accuracy == null ? '—' : Math.round(r.accuracy)}</td>
    </tr>`
  ).join('');

  show('app');
}

let pollTimer = null;

async function startLogin() {
  show('login');
  $('loginStatus').textContent = t('login.waiting');
  const res = await api('/v1/web/device-code', { method: 'POST' });
  const { user_code, device_code, interval } = await res.json();
  $('userCode').textContent = user_code;
  $('qr').src = `${API}/v1/web/qr?data=${encodeURIComponent(user_code)}`;

  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const r = await api('/v1/web/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code }),
    });
    const { status } = await r.json();
    if (status === 'authenticated') { clearInterval(pollTimer); loadObs(); }
    else if (status === 'expired')   { clearInterval(pollTimer); startLogin(); }
  }, (interval || 2) * 1000);
}

$('logout').addEventListener('click', async () => {
  await api('/v1/web/logout', { method: 'POST' });
  startLogin();
});

document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const lang = btn.getAttribute('data-lang');
    window.MPI18n.setLang(lang);
    localStorage.setItem('mp_lang', lang);
    await api('/v1/web/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    });
  });
});

window.onI18nApplied = function () {
  if ($('app') && !$('app').classList.contains('hidden')) {
    $('myIntro').textContent = $('myIntro').textContent; // refreshed via loadObs on lang change
  }
};

(function initLang() {
  const stored = localStorage.getItem('mp_lang');
  const nav = (navigator.language || 'cs').slice(0, 2);
  const lang = window.MPI18n.supported(stored) ? stored : (window.MPI18n.supported(nav) ? nav : 'cs');
  window.MPI18n.setLang(lang);
})();

loadObs();
