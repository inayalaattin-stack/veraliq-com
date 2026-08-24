// Veraliq — site interactivity
// SECURITY NOTE: This file intentionally contains NO API keys.
// Never place secret keys in client-side JavaScript — they become
// publicly visible to anyone who views page source.
//
// NOTE (Ağustos 2026): Sitedeki canlı AI Agent ("Elif Kaya") artık Anam.ai'nin
// hazır widget'ı değil — bu dosyanın alt kısmındaki Adaptive Agent Window
// bölümü, Anam JS SDK'sını doğrudan kullanarak gerçek video akışı ve
// corner/half/fullscreen/minimized/closed durum makinesini yönetiyor.
// Oturum token'ı https://veraliq-agent.veraliq-com.workers.dev/session
// adresinden alınır; gerçek Anam API anahtarı hiçbir zaman tarayıcıya inmez.
// Ses, dil davranışı (TR kilitli) ve konuşma mantığının tamamı Anam Lab'de
// (persona: Elif Kaya) yapılandırıldı.

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
  // through them, pausing on hover/touch/focus. ----
  var chipRow = document.getElementById('chipRow');
  var chipDetail = document.getElementById('chipDetail');
  if (chipRow && chipDetail) {
    var chips = Array.prototype.slice.call(chipRow.querySelectorAll('.chip'));
    var activeIndex = 0;
    var rotateTimer = null;
    var paused = false;

    function showChip(index) {
      activeIndex = index;
      chips.forEach(function (c, i) { c.classList.toggle('active', i === index); });
      chipDetail.textContent = chips[index].getAttribute('data-detail') || '';
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

    showChip(0);
    startRotation();
  }
})();

// ===========================================================================
// ADAPTIVE AGENT WINDOW — "Elif Kaya"
// States: corner (default) | half | fullscreen | minimized (bubble) | closed
// ===========================================================================
(function () {
  'use strict';

  var SESSION_ENDPOINT = 'https://veraliq-agent.veraliq-com.workers.dev/session';
  var SDK_URL = 'https://esm.sh/@anam-ai/js-sdk@latest';

  var els = {
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
    reopenBtn: document.getElementById('agentReopenBtn')
  };

  // If the markup isn't present for some reason, bail out quietly rather
  // than throwing and breaking the rest of the page's scripts.
  if (!els.win || !els.video) return;

  var anamClient = null;
  var lastWindowState = 'corner'; // state to return to from the bubble
  var intentionalClose = false;   // true only when the user clicked "close"
  var reconnectAttempts = 0;
  var reconnectTimer = null;

  function setWindowState(state) {
    els.win.hidden = false;
    els.win.dataset.state = state;
    els.bubble.hidden = true;
    els.reopenBtn.hidden = true;
    if (state !== 'fullscreen') lastWindowState = state;
  }

  function minimize() {
    // Copy the live stream reference into the bubble's video element so the
    // agent keeps talking/listening while the site behind is fully visible.
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
    try {
      if (anamClient && typeof anamClient.stopStreaming === 'function') {
        anamClient.stopStreaming();
      }
    } catch (e) {}
    anamClient = null;
    els.statusDot.classList.remove('live');
    els.bubbleDot.classList.remove('live');
  }

  async function reopenAgent() {
    intentionalClose = false;
    reconnectAttempts = 0;
    els.reopenBtn.hidden = true;
    setWindowState('corner');
    els.loading.classList.remove('hide');
    var textEl = els.loading.querySelector('.agent-loading-text');
    if (textEl) textEl.textContent = 'Agent hazırlanıyor…';
    await initAgent();
  }

  // The Anam WebRTC connection can drop on its own (network blip, a long
  // spell with the tab backgrounded, idle timeout). Unless the user
  // explicitly closed the window, reconnect automatically instead of
  // leaving a frozen/black video behind — with capped backoff so a genuine
  // outage doesn't hammer the token endpoint forever.
  function scheduleReconnect() {
    if (intentionalClose) return;
    if (els.win.hidden && els.bubble.hidden) return; // window is "closed"
    if (reconnectTimer) return; // already scheduled
    if (reconnectAttempts >= 5) return;
    reconnectAttempts++;
    var delay = Math.min(reconnectAttempts * 1500, 8000);
    var textEl = els.loading.querySelector('.agent-loading-text');
    if (textEl) textEl.textContent = 'Bağlantı yeniden kuruluyor…';
    els.loading.classList.remove('hide');
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      initAgent();
    }, delay);
  }

  // ---- drag-to-corner (only while in "corner" state) ----
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

    function endDrag(e) {
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

      // hand positioning back to the corner-anchored CSS rules
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

  // ---- Anam session + SDK wiring ----
  async function fetchSessionToken() {
    var resp = await fetch(SESSION_ENDPOINT, { method: 'POST' });
    if (!resp.ok) throw new Error('session_token_http_' + resp.status);
    var data = await resp.json();
    if (!data || !data.sessionToken) throw new Error('session_token_missing');
    return data.sessionToken;
  }

  function markLive(isLive) {
    els.statusDot.classList.toggle('live', !!isLive);
    els.bubbleDot.classList.toggle('live', !!isLive);
    if (isLive) {
      els.loading.classList.add('hide');
      reconnectAttempts = 0;
      // Keep the bubble's video mirroring the live stream at all times, not
      // just at the moment minimize() is clicked, so it's never stale.
      try { els.bubbleVideo.srcObject = els.video.srcObject; } catch (e) {}
    }
  }

  function wireEvents(client, AnamEvent) {
    function on(name, handler) {
      try {
        if (AnamEvent && AnamEvent[name] && typeof client.addListener === 'function') {
          client.addListener(AnamEvent[name], handler);
        }
      } catch (e) {}
    }
    on('VIDEO_PLAY_STARTED', function () { markLive(true); });
    on('SESSION_READY', function () { markLive(true); });
    on('CONNECTION_ESTABLISHED', function () { markLive(true); });
    on('CONNECTION_CLOSED', function () { markLive(false); scheduleReconnect(); });
    on('USER_SPEECH_STARTED', function () { els.indicator.hidden = false; });
    on('USER_SPEECH_ENDED', function () { els.indicator.hidden = true; });
    on('MIC_PERMISSION_DENIED', function () { els.micBlocked.hidden = false; });
    on('MIC_PERMISSION_GRANTED', function () { els.micBlocked.hidden = true; });
  }

  async function initAgent() {
    // Defensively tear down any previous (likely already-dead) client and
    // clear the stale frame before reconnecting, so we never show a frozen
    // last frame under a "live" green dot.
    try {
      if (anamClient && typeof anamClient.stopStreaming === 'function') anamClient.stopStreaming();
    } catch (e) {}
    anamClient = null;
    try { els.video.srcObject = null; } catch (e) {}

    try {
      var sdk = await import(/* webpackIgnore: true */ SDK_URL);
      var createClient = sdk.createClient;
      var AnamEvent = sdk.AnamEvent;
      if (typeof createClient !== 'function') throw new Error('sdk_shape_unexpected');

      var sessionToken = await fetchSessionToken();
      anamClient = createClient(sessionToken);

      wireEvents(anamClient, AnamEvent);

      if (typeof anamClient.streamToVideoElement === 'function') {
        await anamClient.streamToVideoElement('agentVideo');
      }
      // Safety net: some SDK versions fire readiness events we didn't catch
      // by name above — reveal the video as soon as it actually has frames.
      els.video.addEventListener('playing', function () { markLive(true); }, { once: true });
    } catch (err) {
      // Fail quietly in the UI — never fall back to any old placeholder.
      // Keep the loading text but swap it to a short, honest note, and
      // retry with backoff rather than leaving the window dead forever.
      var textEl = els.loading.querySelector('.agent-loading-text');
      if (textEl) textEl.textContent = 'Agent şu anda bağlanamıyor.';
      scheduleReconnect();
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[VeraliqAgent] init failed:', err);
      }
    }
  }

  // A backgrounded tab throttles timers (and can starve the WebRTC
  // connection itself), so a scheduled reconnect may not have actually run
  // by the time the visitor comes back. Check immediately on return and
  // reconnect right away rather than waiting on a throttled timer.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (intentionalClose) return;
    if (els.win.hidden && els.bubble.hidden) return; // closed
    var tracks = els.video.srcObject ? els.video.srcObject.getTracks() : [];
    var dead = tracks.length > 0 && tracks.every(function (t) { return t.readyState === 'ended'; });
    if (dead || !els.statusDot.classList.contains('live')) {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      reconnectAttempts = 0;
      initAgent();
    }
  });

  // Auto-connect on first visit so the agent is already live in the corner
  // by the time a visitor notices it — no click required to "wake it up".
  setWindowState('corner');
  initAgent();
})();
