// Veraliq — site interactivity
// SECURITY NOTE: This file intentionally contains NO API keys.
// Never place secret keys in client-side JavaScript — they become
// publicly visible to anyone who views page source.
//
// NOTE (Ağustos 2026): Sitedeki canlı AI Agent ("Elif Kaya"), VERALIQ Digital
// Human Engine — provider-agnostic, self-hosted-first bir mimari — üzerinden
// çalışıyor. "Adaptive Agent Window" (corner/half/fullscreen/minimized/closed
// durum makinesi, sürükleme, otomatik yeniden bağlanma) artık ayrı bir ES
// modülü olan agent-core/widget.js içinde; STT/LLM/TTS/Avatar katmanları da
// agent-core/ altında değiştirilebilir provider'lar olarak tanımlı (bkz.
// docs/DIGITAL_HUMAN_ENGINE_REPORT.md). Eski Anam.ai entegrasyonu koddan
// silinmedi ama agent-core/avatar-providers/anam-avatar-provider.js içinde
// izole edildi ve varsayılan olarak KAPALI — bkz. agent-core/config.js.

// ===========================================================================
// I18N ENGINE — reads dictionaries from window.VERALIQ_I18N (i18n.js),
// applies them to every [data-i18n*] element, persists the choice, and
// notifies the rest of the page (chips, Agent) via a "veraliq:langchange"
// event. Exposes window.VeraliqI18N = { getLang, setLang, t } for other
// modules in this file to use.
// ===========================================================================
var VeraliqI18N = (function () {
  'use strict';

  var STORAGE_KEY = 'veraliqLang';
  var DEFAULT_LANG = 'tr';
  var data = (typeof window !== 'undefined' && window.VERALIQ_I18N) || { languages: [], dict: {} };
  var languages = data.languages || [];
  var dict = data.dict || {};
  var currentLang = DEFAULT_LANG;

  function supported(code) {
    return languages.some(function (l) { return l.code === code; });
  }

  function detectInitialLang() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && supported(saved)) return saved;
    } catch (e) {}
    try {
      var nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
      if (nav && supported(nav)) return nav;
    } catch (e) {}
    return DEFAULT_LANG;
  }

  function t(key) {
    var langDict = dict[currentLang] || dict[DEFAULT_LANG] || {};
    if (key in langDict) return langDict[key];
    var fallback = dict[DEFAULT_LANG] || {};
    return fallback[key] || key;
  }

  function langMeta(code) {
    for (var i = 0; i < languages.length; i++) {
      if (languages[i].code === code) return languages[i];
    }
    return languages[0] || { code: 'tr', label: 'Türkçe', flag: '🇹🇷', dir: 'ltr' };
  }

  function applyToDom() {
    var meta = langMeta(currentLang);
    document.documentElement.setAttribute('lang', currentLang);
    document.documentElement.setAttribute('dir', meta.dir || 'ltr');

    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    }
    var altNodes = document.querySelectorAll('[data-i18n-alt]');
    for (var j = 0; j < altNodes.length; j++) {
      altNodes[j].setAttribute('alt', t(altNodes[j].getAttribute('data-i18n-alt')));
    }
    var titleNodes = document.querySelectorAll('[data-i18n-title]');
    for (var k = 0; k < titleNodes.length; k++) {
      titleNodes[k].setAttribute('title', t(titleNodes[k].getAttribute('data-i18n-title')));
    }
    var ariaNodes = document.querySelectorAll('[data-i18n-aria]');
    for (var m = 0; m < ariaNodes.length; m++) {
      ariaNodes[m].setAttribute('aria-label', t(ariaNodes[m].getAttribute('data-i18n-aria')));
    }

    var flagEl = document.getElementById('langBtnFlag');
    var codeEl = document.getElementById('langBtnCode');
    if (flagEl) flagEl.textContent = meta.flag;
    if (codeEl) codeEl.textContent = meta.code.toUpperCase();

    var opts = document.querySelectorAll('.lang-opt');
    for (var n = 0; n < opts.length; n++) {
      opts[n].classList.toggle('active', opts[n].getAttribute('data-lang') === currentLang);
    }
  }

  function setLang(code) {
    if (!supported(code)) return;
    currentLang = code;
    try { window.localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
    applyToDom();
    document.dispatchEvent(new CustomEvent('veraliq:langchange', { detail: { lang: code } }));
  }

  function buildSwitcher() {
    var btn = document.getElementById('langBtn');
    var menu = document.getElementById('langMenu');
    if (!btn || !menu) return;

    languages.forEach(function (l) {
      var opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'lang-opt';
      opt.setAttribute('data-lang', l.code);
      opt.setAttribute('role', 'menuitemradio');
      opt.textContent = l.flag + '  ' + l.label;
      opt.addEventListener('click', function () {
        setLang(l.code);
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
      menu.appendChild(opt);
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!menu.classList.contains('open')) return;
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function init() {
    currentLang = detectInitialLang();
    buildSwitcher();
    applyToDom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    getLang: function () { return currentLang; },
    setLang: setLang,
    t: t
  };
})();
window.VeraliqI18N = VeraliqI18N;

(function () {
  'use strict';

  // ---- Mobile nav toggle ----
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
      });
    });
  }

  // ---- FAQ accordion ----
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var q = item.querySelector('.faq-q');
    if (!q) return;
    q.addEventListener('click', function () {
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (el) { el.classList.remove('open'); });
      if (!wasOpen) item.classList.add('open');
    });
  });

  // ---- Demo form: honest fallback — opens a prefilled email, since no
  // backend CRM endpoint is wired up yet. ----
  var demoForm = document.getElementById('demoForm');
  if (demoForm) {
    demoForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(demoForm);
      var subject = encodeURIComponent('Veraliq Demo Talebi — ' + (data.get('company') || ''));
      var bodyLines = [
        'Ad Soyad: ' + (data.get('name') || ''),
        'Şirket: ' + (data.get('company') || ''),
        'Telefon: ' + (data.get('phone') || ''),
        'E-posta: ' + (data.get('email') || ''),
        'Şirket Türü: ' + (data.get('type') || ''),
        'Aylık Lead/Satış Hacmi: ' + (data.get('volume') || '')
      ];
      var body = encodeURIComponent(bodyLines.join('\n'));
      window.location.href = 'mailto:info@veraliq.com?subject=' + subject + '&body=' + body;
      var status = document.getElementById('formStatus');
      if (status) status.classList.add('show');
    });
  }

  // ---- Hero capability chips: click to pin a detail; otherwise auto-rotate
  // through them, pausing on hover/touch/focus. Detail text is looked up
  // through VeraliqI18N by each chip's data-key, so it re-renders correctly
  // when the visitor switches language. Wrapped in try/catch so a future
  // markup change here can never take down nav/FAQ/demo-form init above. ----
  try {
    var chipRow = document.getElementById('chipRow');
    var chipDetail = document.getElementById('chipDetail');
    if (chipRow && chipDetail) {
      var chips = Array.prototype.slice.call(chipRow.querySelectorAll('.chip'));
      var activeIndex = 0;
      var rotateTimer = null;
      var paused = false;

      function chipDetailText(chip) {
        var key = chip.getAttribute('data-key');
        return key ? VeraliqI18N.t(key + '.detail') : '';
      }

      function showChip(index) {
        activeIndex = index;
        chips.forEach(function (c, i) { c.classList.toggle('active', i === index); });
        chipDetail.textContent = chipDetailText(chips[index]);
      }

      function startRotation() {
        if (rotateTimer) return;
        rotateTimer = setInterval(function () {
          if (paused) return;
          showChip((activeIndex + 1) % chips.length);
        }, 3800);
      }

      chips.forEach(function (chip, i) {
        chip.addEventListener('click', function () {
          showChip(i);
          paused = true; // user made an explicit choice — stop auto-rotating
        });
      });
      chipRow.addEventListener('mouseenter', function () { paused = true; });
      chipRow.addEventListener('mouseleave', function () { paused = false; });
      chipRow.addEventListener('touchstart', function () { paused = true; }, { passive: true });
      chipRow.addEventListener('focusin', function () { paused = true; });
      chipRow.addEventListener('focusout', function () { paused = false; });

      // Re-render the currently pinned/rotating chip's detail text whenever
      // the visitor switches language (labels refresh on their own via the
      // i18n engine's [data-i18n] pass — only the JS-set detail line needs
      // an explicit nudge here).
      document.addEventListener('veraliq:langchange', function () {
        chipDetail.textContent = chipDetailText(chips[activeIndex]);
      });

      showChip(0);
      startRotation();
    }
  } catch (chipErr) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[VeraliqChips] init failed:', chipErr);
    }
  }
})();

