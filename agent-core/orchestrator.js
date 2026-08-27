// agent-core/orchestrator.js
//
// Wires STT -> LLM -> TTS -> Avatar together and owns the
// ConversationStateMachine, including BARGE-IN / INTERRUPTION CONTROL
// (spec section 6): if the customer starts talking while the agent is
// speaking, we (1) stop the agent's speech animation, (2) cancel the
// in-flight TTS, (3) keep listening, (4) process the new utterance once
// final, (5) generate a reply, (6) resume speaking.
//
// This file never imports a concrete provider directly — it only receives
// already-instantiated providers (see agent-core/config.js#createProviders)
// so it works identically whether the avatar is the mock canvas, a
// self-hosted QuickTalk server, or (temporarily, opt-in only) Anam.

import { AgentState } from './state-machine.js';
import { classifyCustomerText, normalizeEmotion } from './emotion-engine.js';

// How many characters of an INTERIM transcript we require before treating it
// as a genuine barge-in rather than mic noise / a stray "uh". Kept low
// deliberately — the spec is explicit that the agent must stop fast.
const BARGE_IN_MIN_CHARS = 3;

export class AgentOrchestrator {
  /**
   * @param {{
   *   providers: {avatar: import('./providers.js').AvatarProvider, tts: import('./providers.js').TTSProvider, stt: import('./providers.js').STTProvider, llm: import('./providers.js').LLMProvider},
   *   stateMachine: import('./state-machine.js').ConversationStateMachine,
   *   agentIdentity: object,
   *   lang: string,
   *   onTranscript?: (entry: {role:'customer'|'agent', text:string}) => void,
   *   onError?: (err: any) => void,
   *   autoListen?: boolean,
   *   conversationLogger?: import('./conversation-logger.js').ConversationLogger,
   * }} opts
   */
  constructor(opts) {
    this.providers = opts.providers;
    this.fsm = opts.stateMachine;
    this.agentIdentity = opts.agentIdentity || {};
    this.lang = opts.lang || 'tr';
    this.onTranscript = opts.onTranscript || function () {};
    this.onError = opts.onError || function () {};
    // NOT (2026-08-27): opsiyonel — verilmezse (index.html bugün olduğu gibi)
    // davranış SIFIR DEĞİŞİR, hiçbir ağ çağrısı yapılmaz. Verildiğinde, her
    // görüşme VERALIQ Core'a (worker-portal /api/conversations*) kalıcı
    // olarak yazılır — bkz. conversation-logger.js'in başındaki tasarım
    // ilkeleri (asla görüşmeyi kesmez/yavaşlatmaz, best-effort).
    this.conversationLogger = opts.conversationLogger || null;
    // NOT (2026-08-26): varsayılan true (eski davranış korunuyor — mock/dev
    // ortamında hiçbir şey bozulmasın). widget.js, gerçek üretim akışında
    // (Spatius + "Görüşmeye Katıl" kapısı) bunu false geçirip beginListening()
    // ile ziyaretçinin tıklamasına kadar mikrofonu ERTELİYOR. Sebep: birçok
    // mobil tarayıcı (özellikle iOS Safari), sayfa yüklenir yüklenmez
    // otomatik başlatılan mikrofon/konuşma tanıma isteklerini gerçek bir
    // kullanıcı jesti içinde olmadığı için sessizce reddedebiliyor — bu da
    // "seslenmeme rağmen avatar cevap vermiyor" şikayetinin bir parçasıydı.
    this.autoListen = opts.autoListen !== false;

    this.history = [];
    this._activeTts = null;
    this._started = false;
  }

  async start() {
    if (this._started) return;
    this._started = true;

    const { avatar } = this.providers;

    if (avatar.providesOwnPipeline) {
      // Legacy/opt-in path (Anam or any future all-in-one vendor): the
      // avatar provider owns STT+LLM+TTS internally. We do not touch our
      // own providers.stt/llm/tts at all in this mode.
      await avatar.connect();
      return;
    }

    await avatar.connect();

    if (this.conversationLogger) {
      try { await this.conversationLogger.start(); } catch (e) { /* best-effort, never blocks startup */ }
    }

    // Spec section 11: "Agent açılış konuşması KISA OLACAK" — a short
    // opening line, spoken once, before we start listening. Optional: only
    // providers that implement greet() get this (FaqSalesBrainProvider
    // does); an LLMProvider without one just means the agent stays silent
    // until the visitor speaks first.
    if (typeof this.providers.llm.greet === 'function') {
      try {
        const greeting = await this.providers.llm.greet({ lang: this.lang, agentIdentity: this.agentIdentity });
        if (greeting && greeting.replyText) {
          this.history.push({ role: 'agent', text: greeting.replyText });
          this.onTranscript({ role: 'agent', text: greeting.replyText });
          if (this.conversationLogger) this.conversationLogger.appendMessage('agent', greeting.replyText).catch(function () {});
          this.fsm.transition(AgentState.SPEAKING);
          await this._speakReply(greeting.replyText, normalizeEmotion(greeting.emotion || 'greeting'));
        }
      } catch (e) { /* greeting is a nicety, never block startup on it */ }
    }

    if (this.autoListen) this._listenLoop();
  }

  /**
   * Starts (or restarts) the STT listen loop on demand — used by widget.js's
   * "Görüşmeye Katıl" gate when autoListen:false was passed to the
   * constructor. Safe to call only after start() has resolved.
   */
  beginListening() {
    if (!this._started) return;
    this._listenLoop();
  }

  async stop() {
    this._started = false;
    const { avatar, stt } = this.providers;
    try { stt.stop && stt.stop(); } catch (e) {}
    try { avatar.stopSpeaking(); } catch (e) {}
    try { await avatar.disconnect(); } catch (e) {}
    if (this.conversationLogger) {
      try { await this.conversationLogger.end(); } catch (e) { /* best-effort */ }
    }
    this.fsm.transition(AgentState.IDLE);
  }

  /** Restart STT + reset FSM after a language switch, without a full reconnect. */
  async setLanguage(lang) {
    this.lang = lang;
    if (this.providers.avatar.providesOwnPipeline) return; // Anam handles its own language session
    const { stt } = this.providers;
    try { stt.stop(); } catch (e) {}
    this.fsm.transition(AgentState.LISTENING);
    this._runStt();
  }

  _listenLoop() {
    this.fsm.transition(AgentState.LISTENING);
    this._runStt();
  }

  _runStt() {
    const { stt } = this.providers;
    if (!stt.isSupported || !stt.isSupported()) {
      this.onError(new Error('stt_not_supported'));
      return;
    }
    stt.start({
      lang: this.lang,
      onSpeechStart: () => {
        this.providers.avatar.setListening(true);
      },
      onSpeechEnd: () => {
        this.providers.avatar.setListening(false);
      },
      onInterim: (text) => {
        if (this.fsm.state === AgentState.SPEAKING && text && text.trim().length >= BARGE_IN_MIN_CHARS) {
          this._handleBargeIn();
        }
      },
      onFinal: (text) => {
        if (!text || !text.trim()) return;
        this._handleCustomerUtterance(text.trim());
      },
      onError: (err) => this.onError(err),
    });
  }

  // ---- BARGE-IN / INTERRUPTION CONTROL (spec section 6, steps 1-6) ----
  _handleBargeIn() {
    // 1. stop the agent's speaking animation, 2. cancel the TTS stream
    try { this.providers.avatar.stopSpeaking(); } catch (e) {}
    if (this._activeTts) {
      try { this._activeTts.stop(); } catch (e) {}
      this._activeTts = null;
    }
    // 3. keep listening — STT was never paused, so this is implicit.
    this.fsm.transition(AgentState.INTERRUPTED);
    this.fsm.transition(AgentState.LISTENING);
    // 4-6 happen naturally: STT's onFinal for the new utterance re-enters
    // _handleCustomerUtterance below once the customer finishes talking.
  }

  async _handleCustomerUtterance(text) {
    this.history.push({ role: 'customer', text });
    this.onTranscript({ role: 'customer', text });
    if (this.conversationLogger) this.conversationLogger.appendMessage('customer', text).catch(function () {});

    if (!this.fsm.transition(AgentState.THINKING)) return;

    let result;
    try {
      result = await this.providers.llm.respond(text, {
        history: this.history.slice(-12),
        lang: this.lang,
        agentIdentity: this.agentIdentity,
      });
    } catch (err) {
      this.onError(err);
      this.fsm.transition(AgentState.LISTENING);
      return;
    }

    const emotion = normalizeEmotion(result.emotion || classifyCustomerText(text));
    this.providers.avatar.setEmotion(emotion);

    // SECURITY BOUNDARY: `result.intent`, if present, is logged/surfaced for
    // a future deterministic Business Rules Engine to consume — it is
    // intentionally NEVER executed here. See providers.js's LLMProvider
    // doc-comment and docs/DIGITAL_HUMAN_ENGINE_REPORT.md.
    if (result.intent && typeof console !== 'undefined' && console.info) {
      console.info('[VeraliqAgent] intent produced (not executed — no authorization layer wired yet):', result.intent);
    }

    this.history.push({ role: 'agent', text: result.replyText });
    this.onTranscript({ role: 'agent', text: result.replyText });
    if (this.conversationLogger) this.conversationLogger.appendMessage('agent', result.replyText).catch(function () {});

    if (!this.fsm.transition(AgentState.SPEAKING)) return;
    await this._speakReply(result.replyText, emotion);

    if (this.fsm.state === AgentState.SPEAKING) {
      this.fsm.transition(AgentState.LISTENING);
    }
  }

  /** Shared by the opening greeting and every conversational turn. */
  async _speakReply(replyText, emotion) {
    try {
      if (this.providers.avatar.rendersOwnAudioFromText) {
        // Server-side-TTS avatar backend (OpenTalking/QuickTalk/MuseTalk) —
        // it synthesizes speech itself; calling our own TTSProvider here
        // would produce two overlapping voices.
        await this.providers.avatar.speak(null, { text: replyText, emotion });
      } else {
        const handle = this.providers.tts.speak(replyText, { lang: this.lang, emotion });
        this._activeTts = handle;
        await this.providers.avatar.speak(handle, { text: replyText, emotion });
      }
    } catch (e) {
      // interrupted or a provider error — fine, fall through to re-listen
    }
    this._activeTts = null;
  }
}
