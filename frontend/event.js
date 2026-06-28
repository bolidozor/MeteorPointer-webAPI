// Event detail page: loads one measurement by ?id=UUID from the URL and
// renders its full detail + sky dome. Public — no login required.
const API = (window.API_BASE ?? '/api');
const t = (k, v) => window.MPI18n.t(k, v);

function fmt(v, d = 1) { return v == null ? '—' : Number(v).toFixed(d); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtLocal(iso) {
  if (!iso) return '—';
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : iso;
}

function row(label, val) {
  return `<div class="detail-row"><div class="detail-label">${esc(label)}</div><div class="detail-val">${val}</div></div>`;
}

function constNameFor(abbr) {
  if (!abbr) return '';
  const name = window.MeteorSky ? MeteorSky.constNameByAbbr(abbr) : abbr;
  return ` <span class="muted">(${esc(name)})</span>`;
}

function renderDetail(d) {
  const el = document.getElementById('detail');
  if (!d) {
    el.innerHTML = `<p class="error">${t('event.notFound')}</p>`;
    return;
  }

  const s = d.start || {}, e = d.end || {};
  const time = d.event_local ? fmtLocal(d.event_local) : fmtLocal(d.event_utc);
  const tz = d.event_tz ? ` <span class="muted" style="font-size:12px">(${esc(d.event_tz)})</span>` : '';
  const sConst = s.constellation ? `${esc(s.constellation)}${constNameFor(s.constellation)}` : '—';
  const eConst = e.constellation ? `${esc(e.constellation)}${constNameFor(e.constellation)}` : '—';

  el.innerHTML =
    `<h2 data-i18n="event.title">${t('event.title')}</h2>` +
    row(t('event.time'), `<b>${time}</b>${tz}`) +
    row(t('event.status'), `<span class="pill">${esc(d.status)}</span>`) +
    `<hr style="border:none;border-top:1px solid #26262e;margin:16px 0">` +
    `<div class="detail-label" style="margin-bottom:8px">— ${t('sky.start')} —</div>` +
    row('ALT / AZ', `<span class="num">${fmt(s.alt)}° / ${fmt(s.az)}°</span>`) +
    row('RA / Dec', `<span class="num">${fmt(s.ra)}° / ${fmt(s.dec)}°</span>`) +
    row(t('grid.constellation'), sConst) +
    `<div class="detail-label" style="margin:8px 0">— ${t('sky.end')} —</div>` +
    row('ALT / AZ', `<span class="num">${fmt(e.alt)}° / ${fmt(e.az)}°</span>`) +
    row('RA / Dec', `<span class="num">${fmt(e.ra)}° / ${fmt(e.dec)}°</span>`) +
    row(t('grid.constellation'), eConst) +
    `<hr style="border:none;border-top:1px solid #26262e;margin:16px 0">` +
    row(t('grid.quality'), d.quality == null ? '—' : `${Math.round(d.quality * 100)} %`);
}

async function load() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) {
    document.getElementById('detail').innerHTML = `<p class="error">${t('event.notFound')}</p>`;
    return;
  }
  const res = await fetch(`${API}/v1/web/public-reports/${encodeURIComponent(id)}`, { credentials: 'include' })
    .catch(() => null);

  if (!res || !res.ok) {
    document.getElementById('detail').innerHTML = `<p class="error">${t('event.notFound')}</p>`;
    return;
  }
  const d = await res.json();
  renderDetail(d);

  if (d.start && d.start.alt != null && d.event_utc) {
    MeteorSky.render(d);
  }
}

// Sky data loaded → re-render constellation names (now localized).
window.onSkyData = function () { load_done && renderDetail(load_done); };
let load_done = null;

// Language switcher.
document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    window.MPI18n.setLang(btn.getAttribute('data-lang'));
    localStorage.setItem('mp_lang', btn.getAttribute('data-lang'));
  });
});

// Zoom buttons.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-zoom]');
  if (!b) return;
  const host = document.getElementById('skymap');
  const act = b.getAttribute('data-zoom');
  if (act === 'reset') MeteorSky.refit();
  else { const f = act === 'in' ? 1.3 : 1 / 1.3; MeteorSky._zoomAt && MeteorSky._zoomAt(host.clientWidth / 2, f); MeteorSky.redraw && MeteorSky.redraw(); }
});

(function initLang() {
  const stored = localStorage.getItem('mp_lang');
  const nav = (navigator.language || 'cs').slice(0, 2);
  const lang = window.MPI18n.supported(stored) ? stored : (window.MPI18n.supported(nav) ? nav : 'cs');
  window.MPI18n.setLang(lang);
})();

load();
