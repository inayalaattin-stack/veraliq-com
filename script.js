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
  var statusLine = document.getElementById('agentStatus');
  var conversationHistory = [];
  var voiceOn = true;
  var greeted = false;

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
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(greetOnLoad, 600);
  } else {
    window.addEventListener('DOMContentLoaded', function () { setTimeout(greetOnLoad, 600); });
  }

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

  function speakReply(text) {
    if (!voiceOn || !('speechSynthesis' in window)) return;
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
  async function getAssistantReply(userText) {
    try {
      var res = await fetch(ASSISTANT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, history: conversationHistory }),
      });
      if (!res.ok) throw new Error('backend error ' + res.status);
      var data = await res.json();
      return data.reply || 'Şu anda yanıt üretemedim, lütfen tekrar deneyin.';
    } catch (err) {
      return 'Şu anda canlı Agent bağlantısı kurulamadı (backend geçici olarak devrede olmayabilir). Lütfen info@veraliq.com adresine yazın, size dönelim.';
    }
  }

  function handleSend() {
    var text = input.value.trim();
    if (!text) return;
    setCaption(text, 'user');
    conversationHistory.push({ role: 'user', text: text });
    input.value = '';
    setStatus('düşünüyor…');

    getAssistantReply(text).then(function (reply) {
      setCaption(reply, 'bot');
      conversationHistory.push({ role: 'model', text: reply });
      speakReply(reply);
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

  // ---- Re-engage pill: shows once the hero agent card scrolls out of
  // view, scrolls back to it (and focuses input) on click. ----
  var pill = document.getElementById('reengagePill');
  var agentCard = document.getElementById('agentCard');
  if (pill && agentCard && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        pill.classList.toggle('show', !entry.isIntersecting);
      });
    }, { threshold: 0.1 });
    io.observe(agentCard);
    pill.addEventListener('click', function () {
      agentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { input && input.focus(); }, 500);
    });
  }
})();
