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
    tr: "Merhaba 👋 Ben Veraliq'in yapay zeka destekli asistanıyım. Size nasıl yardımcı olabilirim?",
    en: "Hi 👋 I'm Veraliq's AI assistant. How can I help you today?",
    de: "Hallo 👋 Ich bin der KI-Assistent von Veraliq. Wie kann ich Ihnen helfen?",
    fr: "Bonjour 👋 Je suis l'assistant IA de Veraliq. Comment puis-je vous aider ?",
    es: "Hola 👋 Soy el asistente de IA de Veraliq. ¿En qué puedo ayudarte?",
    ar: "مرحبًا 👋 أنا مساعد فيراليك الذكي. كيف يمكنني مساعدتك؟",
    ru: "Здравствуйте 👋 Я ИИ-ассистент Veraliq. Чем могу помочь?",
    zh: "您好 👋 我是 Veraliq 的人工智能助手，有什么可以帮您？",
    ja: "こんにちは👋 Veraliqのアシスタント（AI）です。ご用件をお聞かせください。"
  };

  function detectLangCode() {
    var raw = (navigator.language || 'tr').toLowerCase();
    var short = raw.split('-')[0];
    return GREETINGS[short] ? short : 'tr';
  }

  var detectedLang = detectLangCode();
  document.documentElement.lang = detectedLang;

  // ---- AI Assistant widget: connected to a real LLM backend ----
  // Set this to your deployed Cloudflare Worker URL (see worker/README
  // for deployment steps). Until you deploy it, the widget falls back
  // to a clearly-labeled offline message instead of pretending to be smart.
  var ASSISTANT_ENDPOINT = 'https://veraliq-agent.YOUR-SUBDOMAIN.workers.dev';

  var launcher = document.getElementById('veraliq-assist-launcher');
  var panel = document.getElementById('veraliq-assist-panel');
  var body = document.getElementById('assistBody');
  var input = document.getElementById('assistInput');
  var send = document.getElementById('assistSend');
  var micBtn = document.getElementById('assistMic');
  var voiceToggle = document.getElementById('voiceToggle');
  var avatar = document.getElementById('assistAvatar');
  var conversationHistory = [];
  var voiceOn = true;

  function addMsg(text, who) {
    var div = document.createElement('div');
    div.className = 'assist-msg ' + who;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  if (launcher && panel) {
    launcher.addEventListener('click', function () {
      panel.classList.toggle('open');
    });
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
    window.speechSynthesis.cancel();
    var utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'tr-TR';
    utter.onstart = function () { avatar.classList.add('speaking'); };
    utter.onend = function () { avatar.classList.remove('speaking'); };
    window.speechSynthesis.speak(utter);
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
        avatar.classList.add('listening');
      };
      recognition.onend = function () {
        micBtn.classList.remove('recording');
        avatar.classList.remove('listening');
      };
      recognition.onresult = function (event) {
        var text = event.results[0][0].transcript;
        input.value = text;
        handleSend();
      };
      recognition.onerror = function () {
        micBtn.classList.remove('recording');
        avatar.classList.remove('listening');
      };
      micBtn.addEventListener('click', function () { recognition.start(); });
    } else {
      micBtn.addEventListener('click', function () {
        addMsg('Bu tarayıcı sesli girişi desteklemiyor. Chrome veya Edge deneyin, ya da yazarak sorun.', 'bot');
      });
    }
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
      // Honest fallback: don't fake intelligence if the backend isn't
      // deployed yet or is unreachable.
      return 'Şu anda canlı asistan bağlantısı kurulamadı (backend henüz devrede olmayabilir). Lütfen info@veraliq.com adresine yazın, size dönelim.';
    }
  }

  function handleSend() {
    var text = input.value.trim();
    if (!text) return;
    addMsg(text, 'user');
    conversationHistory.push({ role: 'user', text: text });
    input.value = '';
    var thinking = document.createElement('div');
    thinking.className = 'assist-msg bot';
    thinking.textContent = '…';
    thinking.id = 'thinkingMsg';
    body.appendChild(thinking);
    body.scrollTop = body.scrollHeight;

    getAssistantReply(text).then(function (reply) {
      var t = document.getElementById('thinkingMsg');
      if (t) t.remove();
      addMsg(reply, 'bot');
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
})();
