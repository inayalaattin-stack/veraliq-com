// agent-core/tts-providers/chatterbox-tts-provider.js
//
// ChatterboxTTSProvider — client for the self-hosted Chatterbox
// Multilingual V3 TTS service (services/tts/, see
// docs/SELF_HOSTED_DEPLOYMENT.md). License: MIT (Resemble AI) — see
// docs/DIGITAL_HUMAN_ENGINE_REPORT.md §7. Not selected by default; requires
// AGENT_PROVIDER_CONFIG.selfHostedBaseUrl to point at your GPU server, and
// has NOT been exercised end-to-end in this session (no GPU here) — verify
// against your running services/tts container before flipping this on.
//
// Contract with services/tts/main.py (matching FastAPI service):
//   POST {baseUrl}/tts/synthesize
//   body: { text, lang, voice_id, emotion, exaggeration? }
//   response: audio/wav binary body (streamed)
//
// `voice_id` is how per-agent voice cloning (spec section 4 — e.g.
// "elif-kaya-tr") is selected: it's a name the server resolves to a stored,
// VERALIQ-owned/consented voice profile — never a raw uploaded sample from
// this client. See services/tts/README.md for the voice-profile contract.

import { TTSProvider } from '../providers.js';

export class ChatterboxTTSProvider extends TTSProvider {
  constructor({ baseUrl } = {}) {
    super();
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
  }

  speak(text, opts) {
    if (!this.baseUrl) {
      throw new Error('chatterbox_no_base_url — set AGENT_PROVIDER_CONFIG.selfHostedBaseUrl (see docs/SELF_HOSTED_DEPLOYMENT.md)');
    }

    const controller = new AbortController();
    let audioEl = null;
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });

    (async () => {
      try {
        const resp = await fetch(this.baseUrl + '/tts/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            text,
            lang: (opts && opts.lang) || 'tr',
            voice_id: (opts && opts.voiceId) || 'elif-kaya-tr',
            emotion: (opts && opts.emotion) || 'neutral',
          }),
        });
        if (!resp.ok) throw new Error('chatterbox_synthesize_failed_' + resp.status);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        audioEl = new Audio(url);
        audioEl.onended = () => { URL.revokeObjectURL(url); resolveDone(); };
        audioEl.onerror = () => { URL.revokeObjectURL(url); resolveDone(); };
        await audioEl.play();
      } catch (e) {
        resolveDone();
      }
    })();

    return {
      done,
      stop: () => {
        controller.abort();
        if (audioEl) { try { audioEl.pause(); } catch (e) {} }
        resolveDone();
      },
      // No phoneme/word-boundary timing in this simple contract — avatar
      // providers fall back to their own amplitude/sine-based talk animation.
    };
  }
}
