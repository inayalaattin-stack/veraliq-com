// agent-core/tts-providers/webspeech-tts-provider.js
//
// WebSpeechTTSProvider — the DEFAULT TTS provider today. Uses the browser's
// native SpeechSynthesis API. Zero cost, zero deploy, works the moment this
// ships — which is exactly why it (not a stub) is what replaces Anam's
// voice output as the production default: Anam is currently non-functional
// in production (usage limit reached, see docs/DIGITAL_HUMAN_ENGINE_REPORT.md
// §0), so this is a strict improvement over the current "Agent şu anda
// bağlanamıyor" state, even though its voice quality is well below
// Chatterbox/Anam. It is the intended BRIDGE provider until
// chatterbox-tts-provider.js is deployed on self-hosted GPU hardware.
//
// Turkish note: Chrome/Edge ship a reasonable tr-TR system voice on most
// platforms; quality varies by OS. This provider always requests the voice
// matching the requested `lang` and falls back to the browser's default if
// no exact match exists, rather than silently speaking in the wrong language.

import { TTSProvider } from '../providers.js';

export class WebSpeechTTSProvider extends TTSProvider {
  constructor() {
    super();
    this._voicesCache = null;
  }

  _pickVoice(lang) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    if (!this._voicesCache || this._voicesCache.length === 0) {
      this._voicesCache = window.speechSynthesis.getVoices();
    }
    const voices = this._voicesCache || [];
    const exact = voices.find((v) => v.lang && v.lang.toLowerCase() === lang.toLowerCase());
    if (exact) return exact;
    const prefix = lang.split('-')[0].toLowerCase();
    const partial = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(prefix));
    return partial || null;
  }

  speak(text, opts) {
    const lang = (opts && opts.lang) || 'tr-TR';
    const synth = (typeof window !== 'undefined') ? window.speechSynthesis : null;

    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      // No TTS available at all in this environment — resolve immediately
      // rather than hanging the conversation state machine forever.
      return { done: Promise.resolve(), stop: () => {} };
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = /-/.test(lang) ? lang : lang + '-' + lang.toUpperCase();
    const voice = this._pickVoice(utter.lang);
    if (voice) utter.voice = voice;

    // Emotion has no direct WebSpeech API knob beyond rate/pitch — a subtle,
    // non-cartoonish nudge only (spec section 10: no exaggerated mimicry).
    const emotion = opts && opts.emotion;
    if (emotion === 'happy' || emotion === 'excited') { utter.pitch = 1.08; utter.rate = 1.03; }
    else if (emotion === 'empathetic' || emotion === 'concerned') { utter.pitch = 0.96; utter.rate = 0.95; }
    else { utter.pitch = 1.0; utter.rate = 1.0; }

    const boundaryListeners = [];
    utter.onboundary = () => { boundaryListeners.forEach((cb) => { try { cb(); } catch (e) {} }); };

    let resolveDone;
    let settled = false;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    const finish = () => { if (settled) return; settled = true; clearTimeout(safetyTimer); resolveDone(); };
    utter.onend = finish;
    utter.onerror = finish;

    // SAFETY NET: some environments (confirmed via a headless-browser smoke
    // test while building this) never fire onend/onboundary/onerror at
    // all — no voices installed, a headless Chromium with no real audio
    // output, some Android WebViews, etc. Without this timer, `done` would
    // hang forever and freeze the whole orchestrator (it awaits this
    // before returning to LISTENING). ~110ms/char is a deliberately slow
    // upper bound — real speech should always finish first and hit
    // onend/onerror above; this only fires as a last resort.
    const estimatedMs = Math.max(1500, text.length * 110);
    const safetyTimer = setTimeout(finish, estimatedMs);

    // Cancel any prior utterance before speaking a new one — required on
    // several browsers or speak() silently no-ops.
    try { synth.cancel(); } catch (e) {}
    synth.speak(utter);

    return {
      done,
      stop: () => { try { synth.cancel(); } catch (e) {} finish(); },
      onBoundary: (cb) => { boundaryListeners.push(cb); return () => { const i = boundaryListeners.indexOf(cb); if (i >= 0) boundaryListeners.splice(i, 1); }; },
    };
  }
}
