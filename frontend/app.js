// Minimal login-test frontend. The real frontend (framework, full UI) follows.
// API base is injected at build time via config.js (window.API_BASE). It must
// NOT end with a slash. Default `/api` matches the production deployment, where
// the proxy serves the API under :443/api/ and strips the /api prefix before
// forwarding to the container. Dev (FE on :8080) overrides it to the API host.
const API = (window.API_BASE ?? '/api');
const t = (k, v) => window.MPI18n.t(k, v);

const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  return fetch(API + path, { credentials: 'include', ...opts });
}

function show(section) {
  for (const id of ['login', 'app']) $(id).classList.toggle('hidden', id !== section);
  $('logout').classList.toggle('hidden', section !== 'app');
}

function fmt(v, digits = 1) {
  return v === null || v === undefined ? '—' : Number(v).toFixed(digits);
}

// Site-local wall-clock time from an ISO string with offset (shown as-is,
// independent of the viewer's own time zone).
function fmtLocal(iso) {
  if (!iso) return '—';
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : iso;
}

let meData = null;        // { device_id, count }
let selectedDetail = null; // last loaded measurement detail (for re-render)

async function loadGrid() {
  const me = await api('/v1/web/me');
  if (!me.ok) return startLogin();
  const m = await me.json();
  if (window.MPI18n.supported(m.language)) {
    window.MPI18n.setLang(m.language);
    localStorage.setItem('mp_lang', m.language);
  }

  const res = await api('/v1/web/reports');
  const rows = res.ok ? await res.json() : [];
  meData = { device_id: m.device_id.slice(0, 8), count: rows.length };
  $('rows').innerHTML = rows
    .map(
      (r) => `<tr data-key="${encodeURIComponent(r.client_key)}">
        <td>${new Date(r.received_at).toLocaleString()}</td>
        <td><span class="pill">${r.status}</span></td>
        <td class="num">${fmt(r.start_alt)}° / ${fmt(r.start_az)}°</td>
        <td class="num">${fmt(r.end_alt)}° / ${fmt(r.end_az)}°</td>
        <td class="num">${r.quality == null ? '—' : Math.round(r.quality * 100) + ' %'}</td>
        <td class="num">${r.lat == null ? '—' : `${fmt(r.lat, 5)}, ${fmt(r.lon, 5)}`}</td>
        <td class="num">${r.accuracy == null ? '—' : Math.round(r.accuracy)}</td>
      </tr>`,
    )
    .join('');
  refreshGridIntro();
  show('app');
}

function refreshGridIntro() {
  if (meData) $('gridIntro').textContent = t('grid.intro', { device: meData.device_id, n: meData.count });
}

// Click a row -> fetch the parsed detail -> draw the trail on the sky dome.
async function selectReport(key, tr) {
  document.querySelectorAll('#rows tr.selected').forEach((el) => el.classList.remove('selected'));
  if (tr) tr.classList.add('selected');
  $('skyCaption').textContent = t('sky.loading');
  const res = await api('/v1/web/reports/' + key);
  if (!res.ok) {
    selectedDetail = null;
    $('skyCaption').textContent = t('sky.loadFail');
    return;
  }
  selectedDetail = await res.json();
  showSkyCaption(selectedDetail);
}

function showSkyCaption(d) {
  const cap = $('skyCaption');
  const rendered = d ? MeteorSky.render(d) : false;
  if (!d) { cap.textContent = t('sky.pick'); return; }
  if (!rendered) { cap.textContent = t('sky.noCoords'); return; }
  const tz = d.event_tz ? ` <span class="muted">(${d.event_tz})</span>` : '';
  const s = d.start, e = d.end;
  cap.innerHTML =
    `<b>${fmtLocal(d.event_local || d.event_utc)}</b>${tz}<br>` +
    `<span class="muted">${t('sky.startLabel')}</span> ALT/AZ ${fmt(s.alt)}° / ${fmt(s.az)}° · RA/Dek ${fmt(s.ra, 1)}° / ${fmt(s.dec, 1)}°<br>` +
    `<span class="muted">${t('sky.endLabel')}</span> ALT/AZ ${fmt(e.alt)}° / ${fmt(e.az)}° · RA/Dek ${fmt(e.ra, 1)}° / ${fmt(e.dec, 1)}°`;
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
    if (status === 'authenticated') {
      clearInterval(pollTimer);
      loadGrid();
    } else if (status === 'expired') {
      clearInterval(pollTimer);
      startLogin();
    }
  }, (interval || 2) * 1000);
}

// Re-apply language-dependent dynamic content whenever the language changes.
window.onI18nApplied = function () {
  refreshGridIntro();
  if (selectedDetail) showSkyCaption(selectedDetail);
  else $('skyCaption').textContent = t('sky.pick');
  if (window.MeteorSky) MeteorSky.redraw();
};

// Language switcher: update UI now, persist on the device (if signed in).
document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const lang = btn.getAttribute('data-lang');
    window.MPI18n.setLang(lang);
    localStorage.setItem('mp_lang', lang);
    if (meData) {
      await api('/v1/web/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
    }
  });
});

// Row selection (event delegation).
$('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (tr && tr.dataset.key) selectReport(tr.dataset.key, tr);
});

// About / licenses modal.
$('about').addEventListener('click', () => $('aboutModal').classList.remove('hidden'));
$('aboutClose').addEventListener('click', () => $('aboutModal').classList.add('hidden'));
$('aboutModal').addEventListener('click', (e) => {
  if (e.target.id === 'aboutModal') $('aboutModal').classList.add('hidden');
});

$('logout').addEventListener('click', async () => {
  await api('/v1/web/logout', { method: 'POST' });
  meData = null;
  selectedDetail = null;
  startLogin();
});

// Provisional language before we know the device setting: stored choice, else
// the browser language, else Czech.
(function initLang() {
  const stored = localStorage.getItem('mp_lang');
  const nav = (navigator.language || 'cs').slice(0, 2);
  const lang = window.MPI18n.supported(stored) ? stored : (window.MPI18n.supported(nav) ? nav : 'cs');
  window.MPI18n.setLang(lang);
})();

// Start: if already logged in, show the grid; otherwise begin the login flow.
loadGrid();
