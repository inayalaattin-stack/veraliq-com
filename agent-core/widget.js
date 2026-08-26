// agent-core/widget.js
//
// "Adaptive Agent Window" — corner / half / fullscreen / minimized(bubble) /
// closed state machine for the on-site agent widget.
//
// This is a PORT, not a rewrite: the window-chrome behaviour (drag-to-corner,
// minimize-to-bubble, reopen button, auto-reconnect-with-backoff,
// reconnect-on-language-switch, reconnect when the tab becomes visible
// again) is preserved from the previous Anam-only version of this code that
// used to live inline in script.js. What changed is what's INSIDE
// initAgent(): instead of importing the Anam SDK directly, it now goes
// through agent-core's provider-agnostic pipeline (config.js + orchestrator.js)
// — see docs/DIGITAL_HUMAN_ENGINE_REPORT.md for why.
//
// Loaded as `<script type="module" src="agent-core/widget.js">` from
// index.html — module scripts defer automatically, so this always runs
// after script.js (which defines window.VeraliqI18N) has executed.

import { createProviders, AGENT_PROVIDER_CONFIG } from './config.js';
import { ConversationStateMachine, AgentState } from './state-machine.js';
import { AgentOrchestrator } from './orchestrator.js';

// The agent's identity on veraliq.com itself (spec section 11 — this is the
// "VERALIQ Digital Sales Assistant" persona, distinct from any client
// company's own portal instance, which would supply its own
// company_name/display_name here instead — see PRD.md §1.1).
const AGENT_IDENTITY = {
  first_name: 'Elif',
  last_name: 'Kaya',
  display_name: 'Elif Kaya',
  company_name: 'VERALIQ',
  role: 'Digital Sales Assistant',
};

(async function () {
  'use strict';

  const els = {
    win: document.getElementById('agentWindow'),
    header: document.getElementById('agentHeader'),
    video: document.getElementById('agentVideo'),
    loading: document.getElementById('agentLoading'),
    micBlocked: document.getElementById('agentMicBlocked'),
    indicator: document.getElementById('agentIndicator'),
    statusDot: document.getElementById('agentStatusDot'),
    halfBtn: document.getElementById('agentHalfBtn'),
    fullBtn: document.getElementById('agentFullBtn'),
    minBtn: document.getElementById('agentMinBtn'),
    closeBtn: document.getElementById('agentCloseBtn'),
    bubble: document.getElementById('agentBubble'),
    bubbleVideo: document.getElementById('agentBubbleVideo'),
    bubbleDot: document.getElementById('agentBubbleDot'),
    reopenBtn: document.getElementById('agentReopenBtn'),
    joinGate: document.getElementById('agentJoinGate'),
    joinBtn: document.getElementById('agentJoinBtn'),
    captions: document.getElementById('agentCaptions'),
  };

  if (!els.win || !els.video) return;

  // Wait for the DOM (and window.VeraliqI18N's init()) to be fully ready
  // before reading the visitor's language, so we start in the correct
  // language on first load rather than racing script.js's DOMContentLoaded
  // handler — see this file's header for why that race exists.
  if (document.readyState === 'loading') {
    await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  const I18N = window.VeraliqI18N || { getLang: () => 'tr', t: (k) => k };

  let orchestrator = null;
  let fsm = null;
  let lastWindowState = 'corner';
  let intentionalClose = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  function setWindowState(state) {
    els.win.hidden = false;
    els.win.dataset.state = state;
    els.bubble.hidden = true;
    els.reopenBtn.hidden = true;
    if (state !== 'fullscreen') lastWindowState = state;
  }

  function minimize() {
    try { els.bubbleVideo.srcObject = els.video.srcObject; } catch (e) {}
    els.win.hidden = true;
    els.bubble.hidden = false;
    els.reopenBtn.hidden = true;
  }

  function restoreFromBubble() {
    setWindowState(lastWindowState === 'fullscreen' ? 'corner' : lastWindowState);
  }

  async function closeAgent() {
    intentionalClose = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    els.win.hidden = true;
    els.bubble.hidden = true;
    els.reopenBtn.hidden = false;
    if (orchestrator) { try { await orchestrator.stop(); } catch (e) {} }
    els.statusDot.classList.remove('live');
    els.bubbleDot.classList.remove('live');
  }

  async function reopenAgent() {
    intentionalClose = false;
    reconnectAttempts = 0;
    els.reopenBtn.hidden = true;
    setWindowState('corner');
    els.loading.classList.remove('hide');
    setLoadingText(I18N.t('agent.loadingText'));
    await initAgent();
  }

  function setLoadingText(text) {
    var textEl = els.loading.querySelector('.agent-loading-text');
    if (textEl) textEl.textContent = text;
  }

  // ---- "Görüşmeye Katıl" giriş kapısı — bkz. orchestrator.js'teki
  // autoListen notu. Video/avatar otomatik bağlanıyor, sadece mikrofon
  // dinlemesi bu tıklamaya kadar erteleniyor. ----
  var listeningStarted = false;
  function showJoinGate() {
    if (listeningStarted || !els.joinGate) return;
    els.joinGate.hidden = false;
  }
  function hideJoinGate() {
    if (els.joinGate) els.joinGate.hidden = true;
  }
  if (els.joinBtn) {
    els.joinBtn.addEventListener('click', function () {
      listeningStarted = true;
      hideJoinGate();
      if (orchestrator && typeof orchestrator.beginListening === 'function') {
        orchestrator.beginListening();
      }
    });
  }

  // ---- Canlı altyazı / mini-transkript — müşteri sağda, asistan solda,
  // eski satırlar tamamen silinmiyor (son 20 satırla sınırlı, kaydırılabilir).
  // Spec kaynağı: İmparator'ın "cümle özeti yazıya dökülüp kayboluyor,
  // onu entegre edelim" isteği — burada özetlemek yerine gerçek transkripti
  // gösteriyoruz (daha basit ve daha doğru: hiçbir bilgi kaybı yok). ----
  var CAPTION_MAX_LINES = 20;
  function addCaption(entry) {
    if (!els.captions || !entry || !entry.text) return;
    els.captions.hidden = false;
    var line = document.createElement('div');
    line.className = 'agent-caption-line ' + (entry.role === 'customer' ? 'customer' : 'agent');
    line.textContent = entry.text;
    els.captions.appendChild(line);
    while (els.captions.children.length > CAPTION_MAX_LINES) {
      els.captions.removeChild(els.captions.firstChild);
    }
    els.captions.scrollTop = els.captions.scrollHeight;
  }

  function scheduleReconnect() {
    if (intentionalClose) return;
    if (els.win.hidden && els.bubble.hidden) return;
    if (reconnectTimer) return;
    if (reconnectAttempts >= 5) return;
    reconnectAttempts++;
    var delay = Math.min(reconnectAttempts * 1500, 8000);
    setLoadingText(I18N.t('agent.reconnecting'));
    els.loading.classList.remove('hide');
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      initAgent();
    }, delay);
  }

  // ---- drag-to-corner (only while in "corner" state) — unchanged from the original ----
  (function setupDrag() {
    var dragging = false, offsetX = 0, offsetY = 0;

    els.header.addEventListener('pointerdown', function (e) {
      if (els.win.dataset.state !== 'corner') return;
      if (e.target.closest('.agent-btn')) return;
      dragging = true;
      var rect = els.win.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      els.win.classList.add('dragging');
      els.header.classList.add('grabbing');
      els.win.style.left = rect.left + 'px';
      els.win.style.top = rect.top + 'px';
      els.win.style.right = 'auto';
      els.win.style.bottom = 'auto';
      try { els.header.setPointerCapture(e.pointerId); } catch (e2) {}
    });

    els.header.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      els.win.style.left = (e.clientX - offsetX) + 'px';
      els.win.style.top = (e.clientY - offsetY) + 'px';
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      els.win.classList.remove('dragging');
      els.header.classList.remove('grabbing');

      var rect = els.win.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var corner =
        (cx < window.innerWidth / 2 ? 'l' : 'r') +
        (cy < window.innerHeight / 2 ? 't' : 'b');
      var cornerMap = { lt: 'tl', rt: 'tr', lb: 'bl', rb: 'br' };
      els.win.dataset.corner = cornerMap[corner] || 'br';

      els.win.style.left = '';
      els.win.style.top = '';
      els.win.style.right = '';
      els.win.style.bottom = '';
    }
    els.header.addEventListener('pointerup', endDrag);
    els.header.addEventListener('pointercancel', endDrag);
  })();

  // ---- controls ----
  els.halfBtn.addEventListener('click', function () {
    setWindowState(els.win.dataset.state === 'half' ? 'corner' : 'half');
  });
  els.fullBtn.addEventListener('click', function () {
    setWindowState(els.win.dataset.state === 'fullscreen' ? 'corner' : 'fullscreen');
  });
  els.minBtn.addEventListener('click', minimize);
  els.closeBtn.addEventListener('click', closeAgent);
  els.bubble.addEventListener('click', restoreFromBubble);
  els.reopenBtn.addEventListener('click', reopenAgent);

  function markLive(isLive) {
    els.statusDot.classList.toggle('live', !!isLive);
    els.bubbleDot.classList.toggle('live', !!isLive);
    if (isLive) {
      els.loading.classList.add('hide');
      reconnectAttempts = 0;
      try { els.bubbleVideo.srcObject = els.video.srcObject; } catch (e) {}
      showJoinGate();
    }
  }

  function onOrchestratorError(err) {
    var message = (err && (err.message || err.toString())) || '';
    if (message.indexOf('not-allowed') !== -1 || message === 'permission-denied' || err === 'not-allowed') {
      els.micBlocked.hidden = false;
      return;
    }
    if (typeof console !== 'undefined' && console.warn) console.warn('[VeraliqAgent] error:', err);
    setLoadingText(I18N.t('agent.unavailable'));
    els.loading.classList.remove('hide');
    scheduleReconnect();
  }

  async function initAgent() {
    if (orchestrator) { try { await orchestrator.stop(); } catch (e) {} orchestrator = null; }
    try { els.video.srcObject = null; } catch (e) {}
    els.micBlocked.hidden = true;
    listeningStarted = false;
    hideJoinGate();

    try {
      var providers = await createProviders(AGENT_PROVIDER_CONFIG);
      await providers.avatar.init({ videoEl: els.video, bubbleVideoEl: els.bubbleVideo, agentIdentity: AGENT_IDENTITY });

      providers.avatar.on('live', function () { markLive(true); });
      providers.avatar.on('lost', function () { markLive(false); scheduleReconnect(); });

      fsm = new ConversationStateMachine();
      fsm.onChange(function (state) {
        els.win.dataset.agentState = state.toLowerCase();
        if (state === AgentState.LISTENING || state === AgentState.INTERRUPTED) {
          els.indicator.hidden = false;
        } else {
          els.indicator.hidden = true;
        }
      });

      orchestrator = new AgentOrchestrator({
        providers: providers,
        stateMachine: fsm,
        agentIdentity: AGENT_IDENTITY,
        lang: I18N.getLang(),
        onError: onOrchestratorError,
        onTranscript: addCaption,
        autoListen: false,
      });

      await orchestrator.start();
      // Providers without a discrete "live" event (e.g. the mock avatar
      // resolves connect() synchronously-ish) — mark live once start()
      // resolves rather than waiting forever for an event that may not fire.
      markLive(true);
    } catch (err) {
      onOrchestratorError(err);
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (intentionalClose) return;
    if (els.win.hidden && els.bubble.hidden) return;
    if (!els.statusDot.classList.contains('live')) {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      reconnectAttempts = 0;
      initAgent();
    }
  });

  document.addEventListener('veraliq:langchange', function (e) {
    if (intentionalClose) return;
    if (els.win.hidden && els.bubble.hidden) return;
    if (!orchestrator) return;
    var newLang = (e.detail && e.detail.lang) || I18N.getLang();
    if (orchestrator.providers.avatar.providesOwnPipeline) {
      // Legacy Anam-style provider: session language is fixed for its
      // lifetime, so a full reconnect is required (this mirrors the
      // original behaviour exactly).
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      reconnectAttempts = 0;
      els.loading.classList.remove('hide');
      setLoadingText(I18N.t('agent.loadingText'));
      initAgent();
    } else {
      // Self-hosted / mock pipeline: STT+TTS language can switch live,
      // no visible interruption needed — a real improvement over the
      // Anam-only version of this widget.
      orchestrator.setLanguage(newLang);
    }
  });

  // Auto-connect on first visit so the agent is already live in the corner
  // by the time a visitor notices it.
  setWindowState('corner');
  initAgent();
})();
