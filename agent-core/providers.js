// agent-core/providers.js
//
// VERALIQ DIGITAL HUMAN ENGINE — provider contracts.
//
// These four interfaces are the entire point of the Anam.ai removal: every
// concrete implementation (mock, self-hosted, or a future vendor) must
// satisfy ONE of these shapes. The orchestrator (orchestrator.js) only ever
// talks to these interfaces — it never imports a concrete provider by name.
// Swapping "which model runs the avatar" becomes a one-line change in
// config.js, never a rewrite of the conversation pipeline.
//
// These are plain-JS "interfaces": base classes whose methods throw if a
// subclass forgets to implement them. No build step / TypeScript compiler
// is required, matching the rest of this repo (vanilla JS, no bundler).

function notImplemented(cls, method) {
  throw new Error('[' + cls + '] provider must implement ' + method + '()');
}

// ---------------------------------------------------------------------------
// AvatarProvider — renders the visual "digital human" into a <video> element
// (or a <canvas> composited into one) and reacts to emotion state + audio.
// ---------------------------------------------------------------------------
export class AvatarProvider {
  /**
   * @param {{videoEl: HTMLVideoElement, bubbleVideoEl: HTMLVideoElement, agentIdentity: object}} opts
   */
  async init(opts) { notImplemented('AvatarProvider', 'init'); }

  /** Establish the underlying session/connection. Resolves once the avatar is visible and idle. */
  async connect() { notImplemented('AvatarProvider', 'connect'); }

  /** Tear down the session (called on close / language switch / provider swap). */
  async disconnect() { notImplemented('AvatarProvider', 'disconnect'); }

  /**
   * Drive the avatar's speaking animation for the lifetime of a TTS
   * playback. Receives the TTSProvider's control handle (see
   * TTSProvider#speak below) rather than raw audio, so each avatar backend
   * can use whatever signal it has access to:
   *   - MockAvatarProvider: pulses the mouth shape on `handle.onBoundary`
   *     word-boundary events and stops on `handle.done`.
   *   - A provider fed by a self-hosted TTS that returns real audio
   *     (e.g. Chatterbox via chatterbox-tts-provider.js) can read
   *     `handle.audioUrl`/`handle.audioBuffer` for true phoneme-level sync.
   * Must resolve when speech playback completes naturally (not when
   * interrupted — stopSpeaking() handles that path).
   * @param {{done: Promise<void>, stop: () => void, onBoundary?: (cb:(charIndex:number)=>void)=>(()=>void), audioUrl?: string, audioBuffer?: AudioBuffer}} ttsHandle
   * @param {{text?: string, emotion?: string}} meta
   * @returns {Promise<void>}
   */
  async speak(ttsHandle, meta) { notImplemented('AvatarProvider', 'speak'); }

  /** Immediately stop any in-progress speech animation — used for barge-in. Must be synchronous. */
  stopSpeaking() { notImplemented('AvatarProvider', 'stopSpeaking'); }

  /**
   * True if this provider owns the ENTIRE conversation pipeline itself
   * (STT+LLM+TTS+avatar in one closed session — this is how Anam.ai works)
   * rather than being a pure "render this audio as video" backend. When
   * true, the orchestrator skips wiring its own STTProvider/LLMProvider/
   * TTSProvider and simply calls connect()/disconnect() on this provider.
   * Only AnamAvatarProvider sets this to true; every self-hosted provider
   * (mock/quicktalk/musetalk) is a pure render backend and leaves this false.
   */
  providesOwnPipeline = false;

  /**
   * True for an avatar backend that synthesizes its OWN speech audio from
   * text server-side (this is how the OpenTalking-based providers work —
   * they call a `/speak` endpoint with raw text and the server does
   * TTS+lip-sync together). When true, the orchestrator does NOT call the
   * configured TTSProvider at all for that turn (that would double-speak) —
   * it calls `speak(null, {text, emotion})` and this provider is
   * responsible for producing audio+video together.
   * MockAvatarProvider and AnamAvatarProvider leave this false (Mock has no
   * audio at all; Anam is covered by providesOwnPipeline instead).
   */
  rendersOwnAudioFromText = false;

  /**
   * Set the avatar's current emotion/expression state. Must be a no-op-safe
   * best-effort — providers that can't express an emotion should just ignore
   * unknown values rather than throw.
   * @param {'greeting'|'neutral'|'happy'|'excited'|'surprised'|'thinking'|'concerned'|'empathetic'|'professional'} emotion
   */
  setEmotion(emotion) { notImplemented('AvatarProvider', 'setEmotion'); }

  /** Toggle the avatar's "listening" idle pose (subtle head-tilt / attentive look). */
  setListening(isListening) { /* optional to override */ }

  /** Register a lifecycle event listener: 'live' | 'lost' | 'error'. */
  on(event, handler) { /* optional to override */ }
}

// ---------------------------------------------------------------------------
// TTSProvider — turns text into spoken audio.
// ---------------------------------------------------------------------------
export class TTSProvider {
  /**
   * Starts speaking `text` immediately. Returns a control handle rather than
   * only a Promise, because barge-in needs a SYNCHRONOUS stop() — awaiting a
   * promise is too slow to feel instant when the customer interrupts.
   * @param {string} text
   * @param {{lang: string, voiceId?: string, emotion?: string}} opts
   * @returns {{
   *   done: Promise<void>,
   *   stop: () => void,
   *   onBoundary?: (cb: (charIndex: number) => void) => (() => void),
   *   audioUrl?: string,
   *   audioBuffer?: AudioBuffer
   * }}
   */
  speak(text, opts) { notImplemented('TTSProvider', 'speak'); }
}

// ---------------------------------------------------------------------------
// STTProvider — turns customer speech into text, continuously, so the
// orchestrator can detect barge-in (customer starts talking while the agent
// is still speaking) from interim results.
// ---------------------------------------------------------------------------
export class STTProvider {
  /**
   * @param {{
   *   lang: string,
   *   onInterim: (text: string) => void,
   *   onFinal: (text: string) => void,
   *   onSpeechStart: () => void,
   *   onSpeechEnd: () => void,
   *   onError?: (err: any) => void
   * }} handlers
   */
  start(handlers) { notImplemented('STTProvider', 'start'); }

  stop() { notImplemented('STTProvider', 'stop'); }

  /** True if this provider is actually usable in the current browser/runtime. */
  isSupported() { return true; }
}

// ---------------------------------------------------------------------------
// LLMProvider — the "Sales Brain". CRITICAL SECURITY BOUNDARY (see
// docs/DIGITAL_HUMAN_ENGINE_REPORT.md §0 and the project's architecture
// rule): an LLMProvider produces conversational text and, optionally, an
// INTENT description. It must NEVER be trusted to directly execute a
// state-changing action (payment plan, contract, IBAN, discount). Anything
// that touches money, legal terms, or another tenant's data has to go
// through a separate deterministic authorization layer that does not exist
// in this repo yet — see docs/DIGITAL_HUMAN_ENGINE_REPORT.md §0's "Bu turda
// yapılmayanlar" list. Do not wire `intent` straight to a database call.
// ---------------------------------------------------------------------------
export class LLMProvider {
  /**
   * @param {string} userText
   * @param {{history: Array<{role:'customer'|'agent', text:string}>, lang: string, agentIdentity: object}} context
   * @returns {Promise<{replyText: string, emotion: string, intent: {type: string, parameters: object}|null}>}
   */
  async respond(userText, context) { notImplemented('LLMProvider', 'respond'); }
}
