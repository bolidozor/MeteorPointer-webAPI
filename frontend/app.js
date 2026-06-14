// Minimal login-test frontend. The real frontend (framework, full UI) follows.
// The API is assumed to run on the same host, port 8000.
const API = `${location.protocol}//${location.hostname}:8000`;

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

async function loadGrid() {
  const me = await api('/v1/web/me');
  if (!me.ok) return startLogin();
  const meData = await me.json();
  $('deviceId').textContent = meData.device_id.slice(0, 8);

  const res = await api('/v1/web/reports');
  const rows = res.ok ? await res.json() : [];
  $('count').textContent = rows.length;
  $('rows').innerHTML = rows
    .map(
      (r) => `<tr>
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
  show('app');
}

let pollTimer = null;

async function startLogin() {
  show('login');
  $('loginStatus').textContent = 'Čekám na potvrzení v aplikaci…';
  const res = await api('/v1/web/device-code', { method: 'POST' });
  const { user_code, device_code, interval } = await res.json();
  $('userCode').textContent = user_code;
  // QR encodes the plain user code; the in-app scanner reads and approves it.
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
      startLogin(); // restart with a fresh code
    }
  }, (interval || 2) * 1000);
}

$('logout').addEventListener('click', async () => {
  await api('/v1/web/logout', { method: 'POST' });
  startLogin();
});

// Start: if already logged in, show the grid; otherwise begin the login flow.
loadGrid();
