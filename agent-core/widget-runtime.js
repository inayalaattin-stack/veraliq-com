// agent-core/widget-runtime.js
//
// "Adaptive Agent Window" — corner / half / fullscreen / minimized(bubble) /
// closed state machine for the on-site agent widget.
//
// EXTRACTED FROM widget.js (2026-08-27) so the EXACT SAME live, video-based
// avatar system that powers "Elif Kaya" on index.html can be reused, with a
// different persona (agentIdentity) and a different "brain" (LLM provider),
// on OTHER pages of the platform — specifically admin.html ("VERALIQ Admin
// AI") and portal.html ("Şirket Yönetim Asistanı"), per İmparator's explicit
// instruction: "aynı sistemi ... canlı asistanlarıda ekle" (add the SAME
// system as live assistants elsewhere too).
//
// index.html's own widget.js is now a THIN WRAPPER around this file (same
// AGENT_IDENTITY, same default AGENT_PROVIDER_CONFIG, zero behavior change —
// see widget.js's own header comment). Every other line of logic below is an
// UNCHANGED PORT of the previous widget.js — nothing about the corner/half/
// fullscreen/minimize/reconnect/barge-in/caption behavior was altered.
//
// Requires the SAME DOM skeleton index.html already has (#agentWindow,
// #agentBubble, #agentReopenBtn, etc. — see index.html around "agent-window")
// and the SAME CSS classes (.agent-window, .agent-bubble, ...). Any page that
// wants this widget must include that markup + those styles + this module.

import { createProviders } from './config.js';
import { ConversationStateMachine, AgentState } from './state-machine.js';
import { AgentOrchestrator } from './orchestrator.js';
import { ConversationLogger } from './conversation-logger.js';

// index.html loads i18n.js (window.VeraliqI18N) for its 8-language site chrome.
// Internal panels (admin.html, portal.html) are Turkish-only today and do NOT
// load i18n.js, so we fall back to these fixed TR strings for the handful of
// widget status messages instead of showing a raw translation key.
const FALLBACK_I18N = {
  'agent.loadingText': 'Asistan hazırlanıyor…',
  'agent.reconnecting': 'Yeniden bağlanıyor…',
  'agent.unavailable': 'Asistan şu an kullanılamıyor.',
};

const BARGE_IN_HISTORY_LIMIT = 12; // unused here, kept for parity — real limit lives in orchestrator.js

/**
 * @param {{
 *   agentIdentity: {first_name?:string, last_name?:string, display_name:string, company_name:string, role:string},
 *   providerOverrides?: Partial<import('./config.js').AGENT_PROVIDER_CONFIG>,
 *   startMinimized?: boolean,
 *   conversationLogging?: {tokenKey?:string, agentKey?:string, channel?:string},
 * }} opts
 *
 * `conversationLogging` (2026-08-27, 65 maddelik master promptun 3-5, 38-39.
 * maddeleri): opsiyonel. Verilmezse (bugün widget.js/index.html'de olduğu
 * gibi) DAVRANIŞ SIFIR DEĞİŞİR — hiçbir yeni ağ çağrısı yapılmaz. Verilirse,
 * her görüşme oturumu worker-portal'daki /api/conversations* uçlarına
 * kalıcı olarak yazılır (bkz. conversation-logger.js). `tokenKey`, o sayfanın
 * zaten sessionStorage'a yazdığı JWT anahtarıdır (ör. 'veraliq_company_jwt')
 * — backend bu JWT'nin rolünü VE company_id'sini zorunlu kılar, yani bu
 * yalnızca gerçekten o role/company_id'ye sahip bir oturumda çalışır.
 */
export async function initAgentWidget(opts) {
  'use strict';
  const AGENT_IDENTITY = opts.agentIdentity;
  const PROVIDER_OVERRIDES = opts.providerOverrides || {};

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
    stage: document.getElementById('agentStage'),
    textForm: document.getElementById('agentTextForm'),
    textInput: document.getElementById('agentTextInput'),
  };

  if (!els.win || !els.video) return null;

  if (document.readyState === 'loading') {
    await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  const I18N = window.VeraliqI18N || { getLang: () => 'tr', t: (k) => FALLBACK_I18N[k] || k };

  let orchestrator = null;
  let fsm = null;
  let lastWindowState = 'corner';
  let intentionalClose = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  // Video avatarı (Spatius/Anam/vb.) bağlanamadığında (kota bitti, hesap
  // askıda, ...) enableTextModeFallback() bir kez devreye girer ve true
  // olur — initAgent() bir daha video yoluna dönmeyi denemez, sayfa
  // yenilenene kadar metin sohbette kalır. Bkz. o fonksiyonun başındaki not.
  let textModeActive = false;

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
    if (textModeActive) return; // bkz. enableTextModeFallback() — sayfa yenilenene kadar video yoluna dönmüyoruz
    if (orchestrator) { try { await orchestrator.stop(); } catch (e) {} orchestrator = null; }
    try { els.video.srcObject = null; } catch (e) {}
    els.micBlocked.hidden = true;
    listeningStarted = false;
    hideJoinGate();

    try {
      var providers = await createProviders(PROVIDER_OVERRIDES);
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

      var conversationLogger = null;
      if (opts.conversationLogging) {
        conversationLogger = new ConversationLogger({
          tokenKey: opts.conversationLogging.tokenKey,
          agentKey: opts.conversationLogging.agentKey,
          agentPersona: AGENT_IDENTITY.display_name,
          provider: PROVIDER_OVERRIDES.llmProvider || 'faq',
          channel: opts.conversationLogging.channel || 'web',
        });
      }

      orchestrator = new AgentOrchestrator({
        providers: providers,
        stateMachine: fsm,
        agentIdentity: AGENT_IDENTITY,
        lang: I18N.getLang(),
        onError: onOrchestratorError,
        onTranscript: addCaption,
        autoListen: false,
        conversationLogger: conversationLogger,
      });

      await orchestrator.start();
      markLive(true);
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[VeraliqAgent] video avatar failed, falling back to text mode:', err);
      }
      var fellBack = await enableTextModeFallback();
      if (!fellBack) onOrchestratorError(err);
    }
  }

  // Video avatarı (Spatius/Anam/vb.) bağlanamadığında devreye giren yedek:
  // aynı orchestrator/STT/LLM/TTS hattı, sadece görsel avatar yerine
  // MockAvatarProvider'ın <video>'ya HİÇ bağlanmayan sessiz sürümü + bir
  // yazı kutusu (bkz. index.html #agentTextForm, _handleCustomerUtterance
  // orchestrator.js'de zaten mevcut — burada doğrudan çağrılıyor, tıpkı
  // STT'nin onFinal callback'inin yaptığı gibi). Video avatarın kendisi
  // hiç DENENMİYOR (MockAvatarProvider.connect() çağrılmıyor) — bu yüzden
  // ekranda hiçbir zaman "MOCK MODE" filigranı görünmez, sadece metin.
  async function enableTextModeFallback() {
    try {
      var providers = await createProviders(Object.assign({}, PROVIDER_OVERRIDES, { avatarProvider: 'mock' }));
      // Kasıtlı olarak avatar.init()/.connect() ÇAĞRILMIYOR — video hiç
      // başlamasın diye. Orchestrator'ın avatar.setEmotion()/.speak()/.on()
      // çağırdığı yerler MockAvatarProvider'da güvenli no-op'lardır.
      fsm = new ConversationStateMachine();
      orchestrator = new AgentOrchestrator({
        providers: providers,
        stateMachine: fsm,
        agentIdentity: AGENT_IDENTITY,
        lang: I18N.getLang(),
        onError: function (e) { if (typeof console !== 'undefined' && console.warn) console.warn('[VeraliqAgent] text-mode error:', e); },
        onTranscript: addCaption,
        autoListen: false,
      });
      // orchestrator.start() normalde avatar.connect()'i çağırır — Mock için
      // bu zararsız (canvas oluşturur ama hiçbir <video>'ya bağlanmaz, bkz.
      // yukarıdaki not: videoEl/bubbleVideoEl hiç set edilmediği için
      // connect() içindeki `if (this._videoEl)` bloğu çalışmaz).
      await orchestrator.start();

      textModeActive = true;
      els.stage.classList.add('text-mode');
      els.loading.classList.add('hide');
      els.micBlocked.hidden = true;
      els.textForm.hidden = false;
      markLive(true);
      hideJoinGate(); // markLive(true) çağırdığı showJoinGate()'i geçersiz kılar — CSS .text-mode zaten gizliyor ama JS tarafını da tutarlı tutuyoruz
      return true;
    } catch (err2) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[VeraliqAgent] text-mode fallback also failed:', err2);
      }
      return false;
    }
  }

  if (els.textForm) {
    els.textForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (els.textInput.value || '').trim();
      if (!text || !orchestrator) return;
      els.textInput.value = '';
      // Ses akışında SPEAKING'den THINKING'e geçiş STT'nin barge-in'i
      // üzerinden oluyor (_handleBargeIn: SPEAKING -> INTERRUPTED ->
      // LISTENING). Yazı kutusu STT'yi hiç kullanmadığı için (özellikle
      // açılış karşılamasından hemen sonra) aynı geçişi burada elle
      // tetiklemezsek fsm.transition(THINKING) sessizce reddedilip mesaj
      // hiç yanıtlanmaz. _handleBargeIn zaten var olan, test edilmiş
      // geçişi kullanıyor — burada yeniden icat etmiyoruz.
      if (fsm && fsm.state === AgentState.SPEAKING && typeof orchestrator._handleBargeIn === 'function') {
        orchestrator._handleBargeIn();
      }
      orchestrator._handleCustomerUtterance(text);
    });
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
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      reconnectAttempts = 0;
      els.loading.classList.remove('hide');
      setLoadingText(I18N.t('agent.loadingText'));
      initAgent();
    } else {
      orchestrator.setLanguage(newLang);
    }
  });

  // NOT (2026-08-27): index.html'de (pazarlama sayfası) ajan geniş bir
  // "corner" pencere olarak AÇILARAK başlıyor — bu sayfanın ana değer
  // önerisi zaten canlı ajanla konuşmak. admin.html/portal.html ise LOGIN
  // EKRANI/DASHBOARD içeren fonksiyonel paneller: aynı geniş pencere küçük
  // ekranlarda (bkz. @media(max-width:480px) — width:calc(100vw - 24px))
  // neredeyse TÜM ekranı kaplayıp giriş formunu/içeriği TIKLANAMAZ hale
  // getiriyordu (gerçek Playwright testiyle doğrulandı — 390px genişlikte
  // "Giriş Yap" butonu ajan penceresinin arkasında kalıyordu). Bu yüzden bu
  // iki sayfa startMinimized:true geçiyor: ajan yine OTOMATİK bağlanıyor ve
  // otomatik görünüyor (İmparator'ın isteği korunuyor), ama küçük, köşedeki
  // bir "bubble" olarak — tıklayınca aynı pencereye genişliyor, hiçbir
  // ekranı/butonu bloklamıyor.
  if (opts.startMinimized) {
    els.win.hidden = true;
    els.bubble.hidden = false;
    els.reopenBtn.hidden = true;
    lastWindowState = 'corner';
  } else {
    setWindowState('corner');
  }
  initAgent();

  return {
    close: closeAgent,
    reopen: reopenAgent,
  };
}
