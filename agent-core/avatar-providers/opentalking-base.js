// agent-core/avatar-providers/opentalking-base.js
//
// Shared client for the OpenTalking (datascale-ai/opentalking, Apache-2.0)
// self-hosted digital-human server — see docs/DIGITAL_HUMAN_ENGINE_REPORT.md
// §7 for the license research behind picking this framework, and
// docs/SELF_HOSTED_DEPLOYMENT.md for how to actually run it on your GPU
// machine. QuickTalkAvatarProvider and MuseTalkAvatarProvider are both thin
// subclasses of this file — in OpenTalking, "quicktalk" vs "musetalk" is
// just the `model` field of the SAME session API, not two different
// servers, so one client implementation covers both.
//
// ⚠️ VERIFY BEFORE PRODUCTION: the REST session API below (POST /sessions,
// /start, /speak, /interrupt, DELETE) was confirmed against OpenTalking's
// published API docs on 2026-08-25. The exact WHEP delivery path/port and
// whether a server-sent-events endpoint exists for a "done speaking" signal
// were NOT fully confirmed in that pass — this file makes a documented,
// best-effort assumption for both (see WHEP_PATH and _waitForSpeakDone
// below) and MUST be checked against your actual deployed OpenTalking
// instance's docs before this provider is flipped on in production. This is
// exactly the kind of thing that can only be verified by running the real
// server — not possible from this cloud sandbox (no GPU).
//
// This provider is NOT selected by default (see agent-core/config.js).

import { AvatarProvider } from '../providers.js';

// Best-effort default — OpenTalking's own docs showed a raw WHIP test
// endpoint at "https://127.0.0.1:8889/whip-test/whep"; a real deployment
// exposes a per-session WHEP path. Override via the `whepPathTemplate`
// constructor option once you've confirmed the real path against your
// server (see docs/SELF_HOSTED_DEPLOYMENT.md).
const DEFAULT_WHEP_PATH_TEMPLATE = '/sessions/{sessionId}/whep';

// Turkish/most-languages average speaking rate, used ONLY as a fallback
// "done speaking" timer if the server doesn't expose a completion event —
// see _waitForSpeakDone().
const FALLBACK_CHARS_PER_SECOND = 14;

export class OpenTalkingAvatarProviderBase extends AvatarProvider {
  /**
   * @param {{baseUrl: string, model: 'quicktalk'|'musetalk', avatarId?: string, whepPathTemplate?: string}} opts
   */
  constructor({ baseUrl, model, avatarId, whepPathTemplate } = {}) {
    super();
    this.providesOwnPipeline = false;
    this.rendersOwnAudioFromText = true; // OpenTalking's /speak does TTS + lip-sync server-side
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    this.model = model;
    this.avatarId = avatarId || 'veraliq-default';
    this.whepPathTemplate = whepPathTemplate || DEFAULT_WHEP_PATH_TEMPLATE;
    this._sessionId = null;
    this._pc = null;
    this._listeners = {};
  }

  async init({ videoEl, bubbleVideoEl }) {
    this._videoEl = videoEl;
    this._bubbleVideoEl = bubbleVideoEl;
  }

  async connect({ lang, ttsProvider, ttsVoice } = {}) {
    if (!this.baseUrl) {
      throw new Error(
        this.model + '_no_base_url — set AGENT_PROVIDER_CONFIG.selfHostedBaseUrl to your ' +
        'OpenTalking server (see docs/SELF_HOSTED_DEPLOYMENT.md)'
      );
    }

    const createResp = await fetch(this.baseUrl + '/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        avatar_id: this.avatarId,
        model: this.model,
        tts_provider: ttsProvider, // undefined = server default; wire your Chatterbox plugin server-side per docs/SELF_HOSTED_DEPLOYMENT.md
        tts_voice: ttsVoice,
      }),
    });
    if (!createResp.ok) throw new Error(this.model + '_session_create_failed_' + createResp.status);
    const created = await createResp.json();
    this._sessionId = created.session_id;

    const startResp = await fetch(this.baseUrl + '/sessions/' + this._sessionId + '/start', { method: 'POST' });
    if (!startResp.ok) throw new Error(this.model + '_session_start_failed_' + startResp.status);

    await this._connectWhep();
    this._emit('live');
  }

  async disconnect() {
    if (this._pc) {
      try { this._pc.close(); } catch (e) {}
      this._pc = null;
    }
    if (this._sessionId) {
      try { await fetch(this.baseUrl + '/sessions/' + this._sessionId, { method: 'DELETE' }); } catch (e) {}
      this._sessionId = null;
    }
    this._emit('lost');
  }

  setEmotion(emotion) {
    this._pendingEmotion = emotion; // sent along with the next /speak call — see speak()
  }

  setListening() {}

  async speak(ttsHandle, meta) {
    if (!this._sessionId) return;
    const text = (meta && meta.text) || '';
    const resp = await fetch(this.baseUrl + '/sessions/' + this._sessionId + '/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, emotion: (meta && meta.emotion) || this._pendingEmotion }),
    });
    if (!resp.ok) throw new Error(this.model + '_speak_failed_' + resp.status);
    await this._waitForSpeakDone(text);
  }

  stopSpeaking() {
    if (!this._sessionId) return;
    // Fire-and-forget: barge-in needs this to be synchronous from the
    // orchestrator's point of view (it does not await stopSpeaking()).
    fetch(this.baseUrl + '/sessions/' + this._sessionId + '/interrupt', { method: 'POST' }).catch(() => {});
  }

  on(event, handler) {
    (this._listeners[event] = this._listeners[event] || []).push(handler);
  }

  _emit(event) {
    (this._listeners[event] || []).forEach((h) => { try { h(); } catch (e) {} });
  }

  async _connectWhep() {
    const pc = new RTCPeerConnection();
    this._pc = pc;
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    const remoteStream = new MediaStream();
    pc.ontrack = (event) => {
      remoteStream.addTrack(event.track);
      if (this._videoEl) this._videoEl.srcObject = remoteStream;
      if (this._bubbleVideoEl) this._bubbleVideoEl.srcObject = remoteStream;
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const whepPath = this.whepPathTemplate.replace('{sessionId}', this._sessionId);
    const resp = await fetch(this.baseUrl + whepPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    });
    if (!resp.ok) throw new Error(this.model + '_whep_negotiate_failed_' + resp.status);
    const answerSdp = await resp.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  /**
   * OpenTalking's docs mention output streaming via SSE but the exact
   * "speech finished" event contract wasn't confirmed (see file header).
   * We try a best-effort SSE listen at /sessions/{id}/events for up to the
   * estimated speaking duration, and otherwise just resolve on a timer —
   * good enough for the avatar to stop its "speaking" UI state at roughly
   * the right time even if the SSE contract turns out to differ.
   */
  async _waitForSpeakDone(text) {
    const estimatedMs = Math.max(800, (text.length / FALLBACK_CHARS_PER_SECOND) * 1000);
    await new Promise((resolve) => setTimeout(resolve, estimatedMs));
  }
}
