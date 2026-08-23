// Veraliq — site interactivity
// SECURITY NOTE: This file intentionally contains NO API keys. Any AI/TTS
// provider key (OpenAI, ElevenLabs, etc.) must live server-side only,
// referenced by the /api/assistant endpoint described in README.md.
// Never place secret keys in client-side JavaScript — they become
// publicly visible to anyone who views page source.

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

  // ---- Language auto-detect (honest scope: sets <html lang>, greets in
  // the visitor's browser language if we have a canned greeting for it.
  // Full conversational translation requires a real backend model call —
  // see README.md "Extending the assistant".) ----
  var GREETINGS = {
    tr: "Merhaba, ben Elif 👋 VERALIQ tarafından desteklenen AI dijital satış agent'ıyım. Size uygun projeyi birlikte bulabiliriz — yatırım için mi, oturum için mi araştırıyorsunuz?",
    en: "Hi, I'm Elif 👋 an AI digital sales agent powered by VERALIQ. I can help you find the right project — are you looking to invest, or to live in it?",
    de: "Hallo, ich bin Elif 👋 ein KI-gestützter digitaler Vertriebsmitarbeiter von VERALIQ. Suchen Sie eine Kapitalanlage oder eine Wohnung zum Selbstbezug?",
    fr: "Bonjour, je suis Elif 👋 une agente commerciale numérique IA propulsée par VERALIQ. Cherchez-vous à investir ou à habiter ?",
    es: "Hola, soy Elif 👋 una agente de ventas digital con IA de VERALIQ. ¿Busca invertir o para vivir?",
    ar: "مرحبًا، أنا إيليف 👋 وكيلة مبيعات رقمية مدعومة بالذكاء الاصطناعي من VERALIQ. هل تبحث عن استثمار أم للسكن؟",
    ru: "Здравствуйте, я Элиф 👋 ИИ-агент по продажам от VERALIQ. Вас интересует инвестиция или собственное жильё?",
    zh: "您好，我是艾莉芙 👋 VERALIQ 的人工智能数字销售顾问。您是想投资还是自住？",
    ja: "こんにちは、エリフです 👋 VERALIQのAIデジタル営業エージェントです。投資目的ですか、それともご自宅用ですか？"
  };

  function detectLangCode() {
    var raw = (navigator.language || 'tr').toLowerCase();
    var short = raw.split('-')[0];
    return GREETINGS[short] ? short : 'tr';
  }

  var detectedLang = detectLangCode();
  document.documentElement.lang = detectedLang;

  // ---- Visitor identity + sales-stage memory (client-side MVP) ----
  // No server-side DB is wired up yet, so cross-visit continuity lives in
  // localStorage: a stable visitorId and the last known sales stage are
  // sent to the backend with every message so replies can stay consistent
  // in tone even across a page reload. Upgrading this to durable
  // server-side memory (Cloudflare KV/D1) is a tracked next step.
  function getVisitorId() {
    try {
      var id = localStorage.getItem('veraliq_visitor_id');
      if (!id) {
        id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(16).slice(2);
        localStorage.setItem('veraliq_visitor_id', id);
      }
      return id;
    } catch (e) { return 'v-nostore'; }
  }
  function getStage() {
    try { return localStorage.getItem('veraliq_stage') || 'DISCOVERY'; } catch (e) { return 'DISCOVERY'; }
  }
  function setStage(stage) {
    try { if (stage) localStorage.setItem('veraliq_stage', stage); } catch (e) { /* ignore */ }
  }
  var visitorId = getVisitorId();

  // ---- Live AI Agent card (hero) — the main product experience.
  // No chat-bubble list: a single live caption area shows the latest
  // exchange, like subtitles, so it reads as a live conversation rather
  // than a chatbot transcript. ----
  var ASSISTANT_ENDPOINT = 'https://veraliq-agent.veraliq-com.workers.dev';

  var input = document.getElementById('assistInput');
  var send = document.getElementById('assistSend');
  var micBtn = document.getElementById('assistMic');
  var voiceToggle = document.getElementById('voiceToggle');
  var avatar = document.getElementById('assistAvatar');
  var captionBox = document.getElementById('assistCaption');
  var cardsBox = document.getElementById('assistCards');
  var statusLine = document.getElementById('agentStatus');
  var conversationHistory = [];
  var voiceOn = true;
  var greeted = false;
  var leadAlreadySent = false;
  var anamClient = null;
  var anamReady = false; // false | 'connecting' | true

  function setCaption(text, who) {
    if (!captionBox) return;
    captionBox.innerHTML = '';
    if (who === 'user') {
      var uLabel = document.createElement('div');
      uLabel.className = 'cap-user mono';
      uLabel.textContent = 'SİZ';
      captionBox.appendChild(uLabel);
    }
    var div = document.createElement('div');
    div.className = who === 'user' ? 'cap-user' : 'cap-bot';
    div.textContent = text;
    captionBox.appendChild(div);
  }

  function setStatus(text) {
    if (statusLine) statusLine.textContent = text;
  }

  function fmtTRY(n) {
    try { return Number(n).toLocaleString('tr-TR') + ' TL'; } catch (e) { return n + ' TL'; }
  }

  // ---- Tool-driven UI cards (project cards + a small map) ----
  // Rendered below the live caption when the backend's Agent Engine calls
  // search_portfolio / create_lead. All data here is explicitly DEMO data
  // (see worker.js) — never presented as a real listing.
  function renderCards(cards) {
    if (!cardsBox) return;
    cardsBox.innerHTML = '';
    if (!cards || !cards.length) { cardsBox.classList.remove('show'); return; }

    cards.forEach(function (c) {
      if (c.type === 'project') {
        var card = document.createElement('div');
        card.className = 'agent-mini-card';
        var demoTag = c.demo ? '<span class="agent-mini-demo">DEMO</span>' : '';
        var seaText = (typeof c.distance_to_sea_m === 'number')
          ? (c.distance_to_sea_m <= 1000 ? 'Denize ' + c.distance_to_sea_m + ' m' : 'Denize ~' + Math.round(c.distance_to_sea_m / 1000) + ' km')
          : '';
        card.innerHTML =
          '<div class="agent-mini-head">' + demoTag + '<strong>' + c.name + '</strong></div>' +
          '<div class="agent-mini-loc mono">' + c.location + (seaText ? ' · ' + seaText : '') + '</div>' +
          '<div class="agent-mini-price">' + fmtTRY(c.price_from_try) + '\'den başlayan</div>' +
          '<div class="agent-mini-rooms mono">' + (c.room_types || []).join(' · ') + '</div>' +
          (c.features && c.features.length ? '<div class="agent-mini-feat">' + c.features.slice(0, 3).join(' · ') + '</div>' : '');
        cardsBox.appendChild(card);
      } else if (c.type === 'map' && typeof c.lat === 'number' && typeof c.lon === 'number') {
        var d = 0.06;
        var bbox = (c.lon - d) + ',' + (c.lat - d) + ',' + (c.lon + d) + ',' + (c.lat + d);
        var mapWrap = document.createElement('div');
        mapWrap.className = 'agent-mini-map';
        mapWrap.innerHTML =
          '<div class="agent-mini-map-label mono">' + (c.label || 'Konum') + ' — gösterge amaçlı</div>' +
          '<iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&marker=' + c.lat + ',' + c.lon + '&layer=mapnik" title="' + (c.label || 'Konum') + '"></iframe>';
        cardsBox.appendChild(mapWrap);
      } else if (c.type === 'lead_confirmed' && c.lead) {
        var lc = document.createElement('div');
        lc.className = 'agent-mini-card agent-mini-lead';
        lc.innerHTML = '<div class="agent-mini-head"><strong>Talebiniz alındı ✓</strong></div>' +
          '<div class="agent-mini-loc mono">Ekibimiz en kısa sürede ' + (c.lead.name || 'sizinle') + ' ile iletişime geçecek.</div>';
        cardsBox.appendChild(lc);
        sendLeadNotification(c.lead);
      }
    });
    cardsBox.classList.add('show');
  }

  // Reuses the existing mailto fallback (no CRM endpoint wired up yet) so
  // a lead captured mid-conversation reaches the same inbox as the demo
  // form, instead of silently vanishing.
  function sendLeadNotification(lead) {
    if (leadAlreadySent) return;
    leadAlreadySent = true;
    try {
      var subject = encodeURIComponent('Veraliq Canlı Agent Lead — ' + (lead.name || ''));
      var bodyLines = [
        'Kaynak: ' + (lead.source || 'veraliq.com canlı Agent'),
        'Ad Soyad: ' + (lead.name || ''),
        'Telefon/E-posta: ' + (lead.phone || ''),
        'Şirket: ' + (lead.company || ''),
        'İlgi/Not: ' + (lead.interest || ''),
        'Zaman: ' + (lead.created_at || new Date().toISOString())
      ];
      var body = encodeURIComponent(bodyLines.join('\n'));
      var mailLink = document.createElement('a');
      mailLink.href = 'mailto:info@veraliq.com?subject=' + subject + '&body=' + body;
      mailLink.target = '_blank';
      mailLink.rel = 'noopener';
      mailLink.style.display = 'none';
      document.body.appendChild(mailLink);
      // Not auto-clicked: opening a mail client without a direct user
      // click is unreliable across browsers and can look like a popup.
      // Instead we surface a visible action in the lead card itself.
      var lastCard = cardsBox && cardsBox.querySelector('.agent-mini-lead');
      if (lastCard) {
        var btn = document.createElement('button');
        btn.className = 'agent-mini-lead-btn';
        btn.textContent = 'Ekibe bildirimi gönder (e-posta aç)';
        btn.addEventListener('click', function () { mailLink.click(); });
        lastCard.appendChild(btn);
      }
    } catch (e) { /* non-critical */ }
  }

  // Greet on load, once, without requiring a click — matches the brief's
  // "agent activates the instant a visitor lands" requirement.
  function greetOnLoad() {
    if (greeted) return;
    greeted = true;
    var greeting = GREETINGS[detectedLang] || GREETINGS.tr;
    setCaption(greeting, 'bot');
    conversationHistory.push({ role: 'model', text: greeting });
    setTimeout(function () { speakReply(greeting); }, 500);
  }
  // Greeting no longer autoplays on page load — the hero is a visual,
  // not a chat surface. It fires the first time the Agent panel opens
  // (see openAgentPanel below), matching a "not a chatbot" first
  // impression while still greeting immediately once invited in.

  // ---- Voice output toggle (free: Web Speech API) ----
  if (voiceToggle) {
    voiceToggle.addEventListener('click', function () {
      voiceOn = !voiceOn;
      voiceToggle.textContent = voiceOn ? '🔊' : '🔇';
      voiceToggle.classList.toggle('on', voiceOn);
      if (!voiceOn && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    });
    voiceToggle.classList.add('on');
  }

  // ---- Anam.ai "Olivia" canlı avatar (opsiyonel katman) ----
  // Panel açıldığında (kullanıcı tıklaması sayesinde autoplay/ses izni
  // olan bir bağlamda) lazy olarak bağlanır; panel kapanınca bağlantı
  // kesilir — ücretsiz/limitli dakika kotasını ziyaretçi panel'i hiç
  // açmasa bile tüketmemek için. Konuşma metni HALA bizim Gemini tabanlı
  // Agent Engine'imizden geliyor (worker.js — search_portfolio/
  // create_lead dahil); Anam sadece o metni Olivia'nın sesi + dudak
  // senkronuyla söylüyor ("CUSTOMER_CLIENT_V1" modu, bkz. worker.js
  // handleAnamSession). ANAM_API_KEY henüz sunucuda tanımlı değilse ya
  // da bağlantı başarısız olursa /anam-session hata döner ve bu kod
  // sessizce vazgeçer — panel mevcut CSS avatar + tarayıcı TTS
  // (speechSynthesis) fallback'ıyla sorunsuz çalışmaya devam eder.
  //
  // DOĞRULANMADI (gerçek ANAM_API_KEY ile canlı test gerekiyor):
  // - unpkg.com üzerinden yüklenen SDK sürümü/yolu (bkz. ANAM_SDK_URL)
  // - Anam'ın gerçek zamanlı akış için kullandığı ağ adresleri
  //   (_headers CSP'sindeki connect-src *.anam.ai geniş tutuldu — canlı
  //   testte Network sekmesinden doğrulanıp daraltılabilir)
  var ANAM_SDK_URL = 'https://unpkg.com/@anam-ai/js-sdk@4.25.0/dist/module/index.js';

  async function connectAnam() {
    if (anamClient || anamReady === 'connecting') return;
    var video = document.getElementById('anamVideo');
    var wrap = document.getElementById('agentAvatarWrap');
    if (!video) return;
    anamReady = 'connecting';
    try {
      var res = await fetch(ASSISTANT_ENDPOINT + '/anam-session', { method: 'POST' });
      if (!res.ok) throw new Error('anam-session ' + res.status);
      var data = await res.json();
      if (!data.sessionToken) throw new Error('sessionToken alınamadı');

      var sdk = await import(/* webpackIgnore: true */ ANAM_SDK_URL);
      anamClient = sdk.createClient(data.sessionToken);
      await anamClient.streamToVideoElement('anamVideo');
      if (wrap) wrap.classList.add('live');
      anamReady = true;
    } catch (e) {
      // Sessiz vazgeçiş — CSS avatar + tarayıcı TTS zaten fallback.
      anamClient = null;
      anamReady = false;
    }
  }

  function disconnectAnam() {
    if (anamClient) {
      try { anamClient.stopStreaming(); } catch (e) { /* ignore */ }
    }
    anamClient = null;
    anamReady = false;
    var wrap = document.getElementById('agentAvatarWrap');
    if (wrap) wrap.classList.remove('live');
  }

  function speakReply(text) {
    if (!voiceOn) return;
    if (anamReady === true && anamClient) {
      try {
        anamClient.talk(text);
        avatar && avatar.classList.add('speaking');
        setStatus('konuşuyor…');
        return;
      } catch (e) { /* Anam talk başarısız — tarayıcı TTS'e düş */ }
    }
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      var utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'tr-TR';
      utter.onstart = function () { avatar && avatar.classList.add('speaking'); setStatus('konuşuyor…'); };
      utter.onend = function () { avatar && avatar.classList.remove('speaking'); setStatus('hazır — sizi dinliyor'); };
      window.speechSynthesis.speak(utter);
    } catch (e) { /* autoplay/voice restrictions — fail silently, caption text still shown */ }
  }

  // ---- Voice input (free: Web Speech API) ----
  var SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (micBtn) {
    if (SpeechRecognitionImpl) {
      var recognition = new SpeechRecognitionImpl();
      recognition.lang = 'tr-TR';
      recognition.interimResults = false;
      recognition.onstart = function () {
        micBtn.classList.add('recording');
        avatar && avatar.classList.add('listening');
        setStatus('dinliyor…');
      };
      recognition.onend = function () {
        micBtn.classList.remove('recording');
        avatar && avatar.classList.remove('listening');
      };
      recognition.onresult = function (event) {
        var text = event.results[0][0].transcript;
        input.value = text;
        handleSend();
      };
      recognition.onerror = function () {
        micBtn.classList.remove('recording');
        avatar && avatar.classList.remove('listening');
        setStatus('hazır — sizi dinliyor');
      };
      micBtn.addEventListener('click', function () {
        // Barge-in: if Elif is currently speaking, stop her so the user
        // can interrupt naturally instead of waiting her out.
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        recognition.start();
      });
    } else {
      micBtn.addEventListener('click', function () {
        setCaption('Bu tarayıcı sesli girişi desteklemiyor. Chrome veya Edge deneyin, ya da yazarak sorun.', 'bot');
      });
    }
  }

  // Typing also counts as a natural interrupt of any ongoing speech.
  if (input) {
    input.addEventListener('keydown', function () {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    });
  }

  // ---- Real backend call ----
  // Backend now returns { reply, cards, stage, leadCaptured } (Agent
  // Engine — tool calls + demo portfolio search + lead capture). Falls
  // back gracefully if an older/plain { reply } shape is ever served.
  async function getAssistantReply(userText) {
    try {
      var res = await fetch(ASSISTANT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: conversationHistory,
          stage: getStage(),
          visitorId: visitorId,
        }),
      });
      if (!res.ok) throw new Error('backend error ' + res.status);
      var data = await res.json();
      return {
        reply: data.reply || 'Şu anda yanıt üretemedim, lütfen tekrar deneyin.',
        cards: Array.isArray(data.cards) ? data.cards : [],
        stage: data.stage || null,
      };
    } catch (err) {
      return {
        reply: 'Şu anda canlı Agent bağlantısı kurulamadı (backend geçici olarak devrede olmayabilir). Lütfen info@veraliq.com adresine yazın, size dönelim.',
        cards: [],
        stage: null,
      };
    }
  }

  function handleSend() {
    var text = input.value.trim();
    if (!text) return;
    setCaption(text, 'user');
    conversationHistory.push({ role: 'user', text: text });
    input.value = '';
    setStatus('düşünüyor…');

    getAssistantReply(text).then(function (result) {
      setCaption(result.reply, 'bot');
      conversationHistory.push({ role: 'model', text: result.reply });
      speakReply(result.reply);
      renderCards(result.cards);
      if (result.stage) setStage(result.stage);
    });
  }

  if (send && input) {
    send.addEventListener('click', handleSend);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleSend();
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

  // ---- Agent launcher + panel: the hero is a full-bleed visual, not a
  // chat surface. A small "Görüşmeyi Başlat" pill appears bottom-right
  // once the hero scrolls out of view (mirrors the reference layout);
  // clicking it — or any "Canlı Agent'ı Dene" link on the page — opens
  // a compact floating panel containing the actual live conversation
  // (caption, voice, mic, tool-driven cards). Closing it returns to the
  // pill, so the site never looks like a chatbot until invited. ----
  var launcher = document.getElementById('agentLauncher');
  var heroVisual = document.getElementById('heroVisual');
  var panel = document.getElementById('agentPanel');
  var panelClose = document.getElementById('agentPanelClose');
  var heroIntersecting = true;

  function updateLauncherVisibility() {
    if (!launcher) return;
    var panelOpen = panel && panel.classList.contains('open');
    launcher.classList.toggle('show', !heroIntersecting && !panelOpen);
  }

  // Plain scroll-position check rather than IntersectionObserver —
  // simpler to reason about and avoids observer-timing edge cases.
  function checkHeroVisibility() {
    if (!heroVisual) return;
    var rect = heroVisual.getBoundingClientRect();
    heroIntersecting = rect.bottom > 80;
    updateLauncherVisibility();
  }
  if (heroVisual) {
    var heroScrollTicking = false;
    window.addEventListener('scroll', function () {
      if (heroScrollTicking) return;
      heroScrollTicking = true;
      setTimeout(function () { checkHeroVisibility(); heroScrollTicking = false; }, 80);
    }, { passive: true });
    window.addEventListener('resize', checkHeroVisibility);
    checkHeroVisibility();
  }

  function openAgentPanel() {
    if (!panel) return;
    panel.classList.add('open');
    updateLauncherVisibility();
    greetOnLoad();
    connectAnam();
    setTimeout(function () { input && input.focus(); }, 350);
  }
  function closeAgentPanel() {
    if (!panel) return;
    panel.classList.remove('open');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    disconnectAnam();
    updateLauncherVisibility();
  }
  if (launcher) launcher.addEventListener('click', openAgentPanel);
  if (panelClose) panelClose.addEventListener('click', closeAgentPanel);
  document.querySelectorAll('.js-open-agent').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      openAgentPanel();
    });
  });
})();
