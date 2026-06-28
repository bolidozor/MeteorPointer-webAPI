// Tiny i18n for the web frontend. The active language is a per-device setting
// stored in the API (loaded from /me, saved via /settings); this module only
// holds the strings and applies them to the DOM.
(function (global) {
  'use strict';

  var DICT = {
    cs: {
      about: 'O aplikaci', logout: 'Odhlásit',
      login: {
        heading: 'Přihlášení přes mobilní aplikaci',
        howto: 'V aplikaci klepni <b>Autorizovat web</b>, pak <b>Skenovat QR</b> a namiř na kód níže — nebo kód opiš ručně:',
        waiting: 'Čekám na potvrzení v aplikaci…',
      },
      grid: {
        intro: 'Přihlášen jako zařízení {device} — {n} měření. Klepni na řádek pro zobrazení stopy na obloze.',
        received: 'Přijato', status: 'Stav', startAltAz: 'Start ALT/AZ', endAltAz: 'Konec ALT/AZ',
        quality: 'Kvalita', gps: 'GPS', acc: '±m',
      },
      sky: {
        head: 'Obloha v čase a místě měření',
        start: 'začátek stopy', end: 'konec stopy',
        pick: 'Vyber měření vlevo pro zobrazení stopy meteoru.',
        loading: 'Načítám…',
        loadFail: 'Detail měření se nepodařilo načíst.',
        noCoords: 'Měření nemá GPS souřadnice nebo čas — stopu na obloze nelze vykreslit.',
        startLabel: 'Start', endLabel: 'Konec', in: 'v souhvězdí',
        hint: 'Kolečkem přiblížíš, tažením posuneš, dvojklikem resetuješ pohled.',
      },
      dir: { N: 'S', NE: 'SV', E: 'V', SE: 'JV', S: 'J', SW: 'JZ', W: 'Z', NW: 'SZ' },
      about_box: {
        tagline: 'Síť pro pozorování meteorů Bolidozor. Web pro nekomerční a výzkumné účely. Naměřená data jsou poskytována pod licencí <b>CC0 1.0</b> (volné dílo).',
        compH: 'Použité komponenty a licence',
        compIntro: 'Tato aplikace používá následující open-source software a data; uvádíme je zde, abychom dostáli jejich licenčním podmínkám (zachování autorství / atribuce).',
        coordsH: 'Souřadnice a čas',
        coords: 'Stopa meteoru je zaznamenána jako dva směry (výška/azimut) v okamžiku měření. Rovníkové souřadnice (RA/Dek) pro vykreslení na obloze počítá server uzavřeným převodem. Čas události je absolutní UTC; lokální čas v místě pozorování se odvozuje z GPS polohy a časového pásma.',
        close: 'Zavřít',
        liStars: 'Data hvězd a souhvězdí — Hipparcos (ESA) a názvy/čáry dle <b>IAU</b>, ve formě datové sady projektu <b>d3-celestial</b> (© 2015 Olaf Frohn, licence <b>BSD-3-Clause</b>). Používáme pouze tato data, nikoli samotnou knihovnu.',
        liSegno: '<b>segno</b> — generování QR kódů (server). Licence <b>BSD</b>.',
        liTz: '<b>timezonefinder</b> — určení časového pásma místa (server). Licence <b>MIT</b>; hranice pásem © přispěvatelé <b>OpenStreetMap</b>, licence <b>ODbL</b>.',
        liDjango: '<b>Django</b> (BSD) &amp; <b>django-ninja</b> (MIT) — serverový framework API.',
      },
    },
    en: {
      about: 'About', logout: 'Sign out',
      login: {
        heading: 'Sign in with the mobile app',
        howto: 'In the app tap <b>Authorize web login</b>, then <b>Scan QR</b> and aim at the code below — or type the code in manually:',
        waiting: 'Waiting for approval in the app…',
      },
      grid: {
        intro: 'Signed in as device {device} — {n} measurement(s). Click a row to show the trail on the sky.',
        received: 'Received', status: 'Status', startAltAz: 'Start ALT/AZ', endAltAz: 'End ALT/AZ',
        quality: 'Quality', gps: 'GPS', acc: '±m',
      },
      sky: {
        head: 'Sky at the time & place of the measurement',
        start: 'trail start', end: 'trail end',
        pick: 'Select a measurement on the left to show the meteor trail.',
        loading: 'Loading…',
        loadFail: 'Could not load the measurement detail.',
        noCoords: 'This measurement has no GPS location or time — the trail cannot be drawn.',
        startLabel: 'Start', endLabel: 'End', in: 'in',
        hint: 'Scroll to zoom, drag to pan, double-click to reset the view.',
      },
      dir: { N: 'N', NE: 'NE', E: 'E', SE: 'SE', S: 'S', SW: 'SW', W: 'W', NW: 'NW' },
      about_box: {
        tagline: 'The Bolidozor meteor-observation network. Web for non-commercial and research use. Measurement data is released under <b>CC0 1.0</b> (public domain).',
        compH: 'Components and licenses',
        compIntro: 'This application uses the following open-source software and data; they are listed here so we meet their license terms (attribution / authorship notices).',
        coordsH: 'Coordinates and time',
        coords: 'A meteor trail is recorded as two directions (altitude/azimuth) at the moment of measurement. The equatorial coordinates (RA/Dec) for plotting are computed on the server by a closed-form conversion. The event time is absolute UTC; the local civil time at the observing site is derived from the GPS location and time zone.',
        close: 'Close',
        liStars: 'Star &amp; constellation data — Hipparcos (ESA) and <b>IAU</b> names/lines, as the dataset shipped by the <b>d3-celestial</b> project (© 2015 Olaf Frohn, <b>BSD-3-Clause</b>). We use only this data, not the library itself.',
        liSegno: '<b>segno</b> — QR code generation (server). <b>BSD</b> license.',
        liTz: '<b>timezonefinder</b> — site time-zone lookup (server). <b>MIT</b> license; zone boundaries © <b>OpenStreetMap</b> contributors, <b>ODbL</b>.',
        liDjango: '<b>Django</b> (BSD) &amp; <b>django-ninja</b> (MIT) — server API framework.',
      },
    },
  };

  var LANG = 'cs';

  function lookup(lang, key) {
    var node = DICT[lang] || DICT.cs;
    var parts = key.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (node == null) return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  function t(key, vars) {
    var s = lookup(LANG, key);
    if (s == null) s = lookup('cs', key);
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  function apply() {
    document.documentElement.lang = LANG;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-lang]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-lang') === LANG);
    });
    if (typeof global.onI18nApplied === 'function') global.onI18nApplied();
  }

  function setLang(lang) {
    LANG = (lang === 'en') ? 'en' : 'cs';
    apply();
  }

  global.MPI18n = {
    t: t, apply: apply, setLang: setLang,
    get lang() { return LANG; },
    supported: function (l) { return l === 'cs' || l === 'en'; },
  };
})(window);
