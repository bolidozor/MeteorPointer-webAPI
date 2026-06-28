// My observations: authenticated list (left) + inline sky dome (right).
const API = (window.API_BASE ?? '/api');
const t = (k, v) => window.MPI18n.t(k, v);
const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  return fetch(API + path, { credentials: 'include', ...opts });
}

function fmt(v, d = 1) { return v == null ? '—' : Number(v).toFixed(d); }

function fmtLocal(iso) {
  if (!iso) return '—';
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : iso;
}

function constSuffix(pt) {
  if (!pt || !pt.constellation) return '';
  const name = window.MeteorSky ? MeteorSky.constNameByAbbr(pt.constellation) : pt.constellation;
  return ` · <span class="muted">${t('sky.in')}</span> ${name}`;
}

function show(section) {
  for (const id of ['login', 'app']) $(id).classList.toggle('hidden', id !== section);
  $('logout').classList.toggle('hidden', section !== 'app');
}

let selectedDetail = null;

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
    `<tr data-id="${encodeURIComponent(r.id)}" data-key="${encodeURIComponent(r.client_key)}">
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

// Row click → load detail, render sky map inline.
async function selectReport(id, tr) {
  document.querySelectorAll('#myRows tr.selected').forEach((el) => el.classList.remove('selected'));
  if (tr) tr.classList.add('selected');
  $('skyCaption').textContent = t('sky.loading');

  const key = tr ? decodeURIComponent(tr.dataset.key || '') : '';
  const res = key
    ? await api('/v1/web/reports/' + encodeURIComponent(key))
    : await api('/v1/web/public-reports/' + encodeURIComponent(id));
  if (!res.ok) {
    selectedDetail = null;
    $('skyCaption').textContent = t('sky.loadFail');
    return;
  }
  selectedDetail = await res.json();
  showSkyCaption(selectedDetail);
}

function showSkyCaption(d) {
  const rendered = d ? MeteorSky.render(d) : false;
  if (!d)        { $('skyCaption').textContent = t('sky.pick');     return; }
  if (!rendered) { $('skyCaption').textContent = t('sky.noCoords'); return; }
  renderCaptionText(d);
}

function renderCaptionText(d) {
  const tz = d.event_tz ? ` <span class="muted">(${d.event_tz})</span>` : '';
  const s = d.start, e = d.end;
  let gpsHtml = '';
  if (d.lat != null && d.lon != null) {
    const url = `https://mapy.com/zakladni?x=${d.lon}&y=${d.lat}&z=14&source=coor&id=${d.lon}%2C${d.lat}`;
    gpsHtml = `<br><span class="muted">GPS</span> ${fmt(d.lat, 5)}, ${fmt(d.lon, 5)}` +
      ` · <a href="${url}" target="_blank" rel="noopener" style="color:#7aa2ff">mapy.com ↗</a>`;
  }
  $('skyCaption').innerHTML =
    `<b>${fmtLocal(d.event_local || d.event_utc)}</b>${tz}<br>` +
    `<span class="muted">${t('sky.startLabel')}</span> ALT/AZ ${fmt(s.alt)}° / ${fmt(s.az)}° · RA/Dec ${fmt(s.ra)}° / ${fmt(s.dec)}°${constSuffix(s)}<br>` +
    `<span class="muted">${t('sky.endLabel')}</span>  ALT/AZ ${fmt(e.alt)}° / ${fmt(e.az)}° · RA/Dec ${fmt(e.ra)}° / ${fmt(e.dec)}°${constSuffix(e)}` +
    gpsHtml;
}

window.onSkyData = function (detail) {
  if (selectedDetail && detail === selectedDetail) renderCaptionText(selectedDetail);
};

window.onI18nApplied = function () {
  if (selectedDetail) renderCaptionText(selectedDetail);
  else if ($('skyCaption')) $('skyCaption').textContent = t('sky.pick');
  if (window.MeteorSky) MeteorSky.redraw();
};

$('myRows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (tr && tr.dataset.id) selectReport(decodeURIComponent(tr.dataset.id), tr);
});

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
    else if (status === 'expired')  { clearInterval(pollTimer); startLogin(); }
  }, (interval || 2) * 1000);
}

$('logout').addEventListener('click', async () => {
  await api('/v1/web/logout', { method: 'POST' });
  selectedDetail = null;
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
    }).catch(() => {});
  });
});

(function initLang() {
  const stored = localStorage.getItem('mp_lang');
  const nav = (navigator.language || 'cs').slice(0, 2);
  const lang = window.MPI18n.supported(stored) ? stored : (window.MPI18n.supported(nav) ? nav : 'cs');
  window.MPI18n.setLang(lang);
})();

loadObs();
