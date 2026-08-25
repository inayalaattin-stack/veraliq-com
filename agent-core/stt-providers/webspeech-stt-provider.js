// agent-core/stt-providers/webspeech-stt-provider.js
//
// WebSpeechSTTProvider — the DEFAULT STT provider today. Uses the browser's
// native SpeechRecognition (webkitSpeechRecognition on Chrome/Edge/Safari;
// unsupported on Firefox — isSupported() reports this honestly so the
// caller can fall back to a text-only chat panel rather than silently
// failing). Zero cost, zero deploy.
//
// Runs in CONTINUOUS + INTERIM-RESULTS mode specifically so the
// orchestrator can detect BARGE-IN (spec section 6): interim results keep
// arriving even while the agent is speaking, which is what lets
// orchestrator.js notice the customer has started talking and interrupt
// the agent — this is the browser-native half of that feature; true
// echo-cancelled full-duplex listening while the agent's own voice is
// playing is a known limitation of relying on the OS/browser's default mic
// pipeline (see docs/DIGITAL_HUMAN_ENGINE_REPORT.md §6 risk notes) and gets
// materially better once a self-hosted STT server with proper AEC
// (acoustic echo cancellation) replaces this via whisper-stt-provider.js.

import { STTProvider } from '../providers.js';

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// Hard-fail cap for HARD errors ('audio-capture' — no working mic at all;
// 'not-allowed' — permission denied). Confirmed necessary by an end-to-end
// browser smoke test while building this: without a cap, a persistent
// 'audio-capture' failure makes onend -> rec.start() -> instant onerror ->
// onend spin as fast as the engine allows (dozens of restarts/second),
// which is both a wasted-CPU bug and, on a real visitor's machine with a
// genuinely broken mic, an infinite console-spam loop that never settles
// into a clear "this isn't working" state.
const MAX_CONSECUTIVE_HARD_ERRORS = 3;

export class WebSpeechSTTProvider extends STTProvider {
  constructor() {
    super();
    this._recognition = null;
    this._handlers = null;
    this._shouldRun = false;
    this._consecutiveHardErrors = 0;
  }

  isSupported() {
    return !!getRecognitionCtor();
  }

  start(handlers) {
    this._handlers = handlers;
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      if (handlers.onError) handlers.onError(new Error('speech_recognition_unsupported'));
      return;
    }

    this._shouldRun = true;
    const rec = new Ctor();
    this._recognition = rec;
    rec.lang = (handlers.lang || 'tr-TR');
    rec.continuous = true;
    rec.interimResults = true;

    let hardFailStop = false;

    rec.onresult = (event) => {
      this._consecutiveHardErrors = 0; // a real result proves the mic pipeline works
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (interim && handlers.onInterim) handlers.onInterim(interim);
      if (final && handlers.onFinal) handlers.onFinal(final);
    };
    rec.onspeechstart = () => { this._consecutiveHardErrors = 0; if (handlers.onSpeechStart) handlers.onSpeechStart(); };
    rec.onspeechend = () => { if (handlers.onSpeechEnd) handlers.onSpeechEnd(); };
    rec.onerror = (event) => {
      // 'no-speech' and 'aborted' are routine (silence timeout / intentional
      // stop()) — do not surface those as errors, just let onend restart us.
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      // 'audio-capture' (no working mic) and 'not-allowed' (permission
      // denied/blocked) are HARD failures — retrying instantly cannot fix
      // them. Cap consecutive retries so we surface a terminal error
      // instead of spinning forever (see MAX_CONSECUTIVE_HARD_ERRORS above).
      if (event.error === 'audio-capture' || event.error === 'not-allowed') {
        this._consecutiveHardErrors++;
        if (this._consecutiveHardErrors >= MAX_CONSECUTIVE_HARD_ERRORS) {
          hardFailStop = true;
          this._shouldRun = false;
        }
      }
      if (handlers.onError) handlers.onError(event.error);
    };
    rec.onend = () => {
      // Browsers auto-stop SpeechRecognition after a period of silence —
      // restart transparently as long as we're still supposed to be
      // listening, so a quiet visitor doesn't silently lose the mic.
      if (this._shouldRun && !hardFailStop) {
        try { rec.start(); } catch (e) { /* already starting — ignore */ }
      }
    };

    try { rec.start(); } catch (e) { /* ignore double-start */ }
  }

  stop() {
    this._shouldRun = false;
    if (this._recognition) {
      try { this._recognition.stop(); } catch (e) {}
      this._recognition = null;
    }
  }
}
