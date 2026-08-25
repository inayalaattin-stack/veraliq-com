// agent-core/avatar-providers/anam-avatar-provider.js
//
// AnamAvatarProvider — the ORIGINAL Anam.ai integration, isolated behind the
// AvatarProvider interface and marked `providesOwnPipeline = true` because
// Anam is NOT a pure "render this audio as video" backend: it runs its own
// closed STT+LLM+TTS+avatar session end-to-end. There is no way to plug it
// into the modular STT/LLM/TTS pipeline the way MockAvatarProvider or
// QuickTalkAvatarProvider can — selecting it means the orchestrator hands
// the whole conversation over to Anam, exactly like the pre-refactor code did.
//
// STATUS: kept for reference / manual rollback ONLY. It is NOT wired into
// agent-core/config.js's default selection (see AGENT_PROVIDER_CONFIG —
// avatarProvider defaults to 'mock'), and as of 2026-08-24 the account's
// Anam usage/plan limit was already reached in production, so selecting
// this provider today would show the same "Agent şu anda bağlanamıyor"
// state visitors were already seeing before this refactor. Per the
// project's own phased plan (docs/DIGITAL_HUMAN_ENGINE_REPORT.md, "PHASE 16
// — Anam tamamen kaldır" is explicitly the LAST phase, not the first), this
// file — and worker/session-worker.js which it depends on — stay in the
// repo, unused, until a self-hosted replacement has been validated in
// production. Deleting them is a deliberate, separate, later step.

import { AvatarProvider } from '../providers.js';

const SESSION_ENDPOINT = 'https://veraliq-agent.veraliq-com.workers.dev/session';
const SDK_URL = 'https://esm.sh/@anam-ai/js-sdk@latest';

export class AnamAvatarProvider extends AvatarProvider {
  constructor() {
    super();
    this.providesOwnPipeline = true;
    this._client = null;
    this._listeners = {};
  }

  async init({ videoEl, bubbleVideoEl }) {
    this._videoEl = videoEl;
    this._bubbleVideoEl = bubbleVideoEl;
  }

  async connect({ lang } = {}) {
    const sdk = await import(/* webpackIgnore: true */ SDK_URL);
    const createClient = sdk.createClient;
    const AnamEvent = sdk.AnamEvent;
    if (typeof createClient !== 'function') throw new Error('anam_sdk_shape_unexpected');

    const sessionToken = await this._fetchSessionToken(lang);
    this._client = createClient(sessionToken);
    this._wireEvents(this._client, AnamEvent);

    if (typeof this._client.streamToVideoElement === 'function' && this._videoEl) {
      await this._client.streamToVideoElement(this._videoEl.id || 'agentVideo');
    }
  }

  async disconnect() {
    try {
      if (this._client && typeof this._client.stopStreaming === 'function') this._client.stopStreaming();
    } catch (e) {}
    this._client = null;
  }

  // Anam owns its own TTS/lip-sync — these are no-ops for API compatibility.
  async speak() {}
  stopSpeaking() {}
  setEmotion() { /* Anam Lab persona controls this server-side, not exposed here */ }
  setListening() {}

  on(event, handler) {
    (this._listeners[event] = this._listeners[event] || []).push(handler);
  }

  _emit(event) {
    (this._listeners[event] || []).forEach((h) => { try { h(); } catch (e) {} });
  }

  async _fetchSessionToken(lang) {
    const resp = await fetch(SESSION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang || 'tr' }),
    });
    if (!resp.ok) throw new Error('session_token_http_' + resp.status);
    const data = await resp.json();
    if (!data || !data.sessionToken) throw new Error('session_token_missing');
    return data.sessionToken;
  }

  _wireEvents(client, AnamEvent) {
    const on = (name, handler) => {
      try {
        if (AnamEvent && AnamEvent[name] && typeof client.addListener === 'function') {
          client.addListener(AnamEvent[name], handler);
        }
      } catch (e) {}
    };
    on('VIDEO_PLAY_STARTED', () => this._emit('live'));
    on('SESSION_READY', () => this._emit('live'));
    on('CONNECTION_ESTABLISHED', () => this._emit('live'));
    on('CONNECTION_CLOSED', () => this._emit('lost'));
  }
}
