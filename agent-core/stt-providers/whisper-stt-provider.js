// agent-core/stt-providers/whisper-stt-provider.js
//
// WhisperSTTProvider — client for the self-hosted faster-whisper STT
// service (services/stt/, see docs/SELF_HOSTED_DEPLOYMENT.md). License:
// MIT (SYSTRAN/faster-whisper) — see docs/DIGITAL_HUMAN_ENGINE_REPORT.md
// §7. Not selected by default; requires
// AGENT_PROVIDER_CONFIG.selfHostedBaseUrl to point at your GPU server, and
// has NOT been exercised end-to-end in this session (no GPU here).
//
// Streams microphone audio to the server over a WebSocket and receives
// interim/final transcripts back — this is the path that actually solves
// the acoustic-echo-cancellation limitation noted in
// webspeech-stt-provider.js, because the server can run proper AEC
// instead of relying on the browser's default mic pipeline.
//
// This client also runs a lightweight client-side VAD (Web Audio API
// amplitude threshold) because faster-whisper, unlike the browser
// SpeechRecognition API, has no built-in notion of "utterance boundary" —
// something has to tell the server when to run a final decode. See
// services/stt/main.py for the matching server-side state machine.
//
// Contract with services/stt/main.py:
//   WebSocket {baseUrl.replace(/^http/,'ws')}/stt/stream?lang=tr
//   client -> server (binary frames): raw webm/opus chunks from MediaRecorder
//   client -> server (text/JSON frames): {"type":"speech_start"} / {"type":"speech_end"}
//     (from this file's amplitude VAD — tells the server when to run a
//     final decode of the buffered audio vs. a cheap rolling interim one)
//   server -> client (JSON): {"type":"interim"|"final","text":...} /
//     {"type":"speech_start"|"speech_end"} (echoed back so UI stays in sync
//     even if the VAD callback fires slightly before the message round-trips)

import { STTProvider } from '../providers.js';

const VAD_SPEECH_THRESHOLD = 0.02; // RMS amplitude, 0..1
const VAD_SILENCE_MS = 700; // how long below threshold before we call it "speech_end"

export class WhisperSTTProvider extends STTProvider {
  constructor({ baseUrl } = {}) {
    super();
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    this._ws = null;
    this._recorder = null;
    this._stream = null;
    this._audioCtx = null;
    this._vadRaf = null;
  }

  isSupported() {
    return !!this.baseUrl && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !!window.MediaRecorder;
  }

  async start(handlers) {
    if (!this.baseUrl) {
      if (handlers.onError) handlers.onError(new Error('whisper_no_base_url — set AGENT_PROVIDER_CONFIG.selfHostedBaseUrl'));
      return;
    }

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      if (handlers.onError) handlers.onError(e);
      return;
    }

    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/stt/stream?lang=' + encodeURIComponent(handlers.lang || 'tr');
    const ws = new WebSocket(wsUrl);
    this._ws = ws;
    ws.binaryType = 'arraybuffer';

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      if (msg.type === 'interim' && handlers.onInterim) handlers.onInterim(msg.text || '');
      if (msg.type === 'final' && handlers.onFinal) handlers.onFinal(msg.text || '');
    };
    ws.onerror = (err) => { if (handlers.onError) handlers.onError(err); };

    ws.onopen = () => {
      const recorder = new MediaRecorder(this._stream, { mimeType: 'audio/webm;codecs=opus' });
      this._recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          event.data.arrayBuffer().then((buf) => ws.send(buf));
        }
      };
      recorder.start(250); // 250ms chunks — matches services/stt's expected streaming cadence
      this._startVad(ws, handlers);
    };
  }

  _startVad(ws, handlers) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return; // no VAD available — server will just never get speech_end; acceptable degradation
    const ctx = new AudioCtx();
    this._audioCtx = ctx;
    const source = ctx.createMediaStreamSource(this._stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    let speaking = false;
    let silenceStartedAt = null;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / data.length);

      if (rms > VAD_SPEECH_THRESHOLD) {
        silenceStartedAt = null;
        if (!speaking) {
          speaking = true;
          if (handlers.onSpeechStart) handlers.onSpeechStart();
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'speech_start' }));
        }
      } else if (speaking) {
        if (silenceStartedAt === null) silenceStartedAt = performance.now();
        if (performance.now() - silenceStartedAt > VAD_SILENCE_MS) {
          speaking = false;
          silenceStartedAt = null;
          if (handlers.onSpeechEnd) handlers.onSpeechEnd();
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'speech_end' }));
        }
      }
      this._vadRaf = requestAnimationFrame(tick);
    };
    this._vadRaf = requestAnimationFrame(tick);
  }

  stop() {
    if (this._vadRaf) { cancelAnimationFrame(this._vadRaf); this._vadRaf = null; }
    if (this._audioCtx) { try { this._audioCtx.close(); } catch (e) {} this._audioCtx = null; }
    if (this._recorder) { try { this._recorder.stop(); } catch (e) {} this._recorder = null; }
    if (this._stream) { try { this._stream.getTracks().forEach((t) => t.stop()); } catch (e) {} this._stream = null; }
    if (this._ws) { try { this._ws.close(); } catch (e) {} this._ws = null; }
  }
}
