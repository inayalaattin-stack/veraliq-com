// agent-core/avatar-providers/mock-avatar-provider.js
//
// MockAvatarProvider — spec section 30 "GPU OLMADAN GELİŞTİRME / Mock Avatar
// Mode". This is a REAL, working provider (not a placeholder that throws) —
// it draws an animated, emotion-reactive avatar face onto a <canvas>, turns
// that canvas into a MediaStream via captureStream(), and hands the stream
// to the SAME <video> element the old Anam integration used
// (videoEl.srcObject). Nothing in index.html has to change for this to
// work: <video id="agentVideo"> plays a canvas-driven stream instead of a
// WebRTC one.
//
// What it deliberately does NOT try to be: photorealistic. Section 30 is
// explicit that Mock Mode's job is to let the LLM/STT/TTS/WebRTC/UI/
// session/interrupt/CRM/presentation/approval workflows be built and tested
// end-to-end without GPU hardware — the photoreal avatar is QuickTalk/
// MuseTalk's job (see quicktalk-avatar-provider.js / musetalk-avatar-provider.js),
// running on your GPU machine per docs/SELF_HOSTED_DEPLOYMENT.md.
//
// No GPU, no model weights, no network calls — pure Canvas2D + rAF.

import { AvatarProvider } from '../providers.js';

const SIZE = 480; // internal canvas resolution (square)

// Emotion -> simple visual parameters. Kept subtle on purpose (spec section
// 10: "abartılı çizgi film karakteri gibi olmamalı — kurumsal ve doğal
// olmalı"): only eyebrow tilt, mouth curve and a faint accent-color glow
// change between states, never exaggerated shapes.
const EMOTION_STYLE = {
  greeting: { browTilt: 0.15, mouthCurve: 0.35, glow: 0.55 },
  neutral: { browTilt: 0, mouthCurve: 0.08, glow: 0.25 },
  happy: { browTilt: 0.1, mouthCurve: 0.45, glow: 0.5 },
  excited: { browTilt: 0.2, mouthCurve: 0.5, glow: 0.65 },
  surprised: { browTilt: 0.35, mouthCurve: 0.15, glow: 0.45 },
  thinking: { browTilt: -0.15, mouthCurve: -0.05, glow: 0.3 },
  concerned: { browTilt: -0.25, mouthCurve: -0.15, glow: 0.2 },
  empathetic: { browTilt: -0.1, mouthCurve: 0.1, glow: 0.35 },
  professional: { browTilt: 0.02, mouthCurve: 0.12, glow: 0.3 },
};

// VERALIQ "Sapphire & Champagne Luxe" palette (see project memory / design
// system) — kept consistent with the rest of the site rather than an
// arbitrary avatar skin tone, since this is explicitly a placeholder, not a
// person.
const COLOR_BG_A = '#102542';
const COLOR_BG_B = '#1a3a63';
const COLOR_ACCENT = '#C79C5A';
const COLOR_FACE = '#e8d9c4';

export class MockAvatarProvider extends AvatarProvider {
  constructor() {
    super();
    this.providesOwnPipeline = false;
    this._canvas = document.createElement('canvas');
    this._canvas.width = SIZE;
    this._canvas.height = SIZE;
    this._ctx = this._canvas.getContext('2d');
    this._raf = null;
    this._t0 = performance.now();
    this._emotion = 'neutral';
    this._listening = false;
    this._speaking = false;
    this._speakPulse = 0;
    this._blinkUntil = 0;
    this._nextBlinkAt = this._t0 + 2000 + Math.random() * 3000;
    this._listeners = {};
  }

  async init({ videoEl, bubbleVideoEl }) {
    this._videoEl = videoEl;
    this._bubbleVideoEl = bubbleVideoEl;
  }

  async connect() {
    const stream = this._canvas.captureStream(30);
    this._stream = stream;
    // The canvas stream has NO audio track (all speech audio plays through
    // the TTS provider separately, not through this <video>) — muting is
    // free here and, critically, is what lets the browser autoplay it
    // without a user gesture. Confirmed via a headless-browser smoke test
    // while building this: an unmuted <video autoplay> with no prior user
    // interaction can leave play()'s returned promise pending indefinitely
    // (neither resolving nor rejecting) rather than cleanly rejecting —
    // which would otherwise hang connect() forever, since orchestrator.start()
    // awaits it. playMuted() below also bounds the wait either way, as a
    // second line of defense.
    if (this._videoEl) {
      this._videoEl.muted = true;
      this._videoEl.srcObject = stream;
      await playMuted(this._videoEl);
    }
    if (this._bubbleVideoEl) {
      this._bubbleVideoEl.muted = true;
      this._bubbleVideoEl.srcObject = stream;
      await playMuted(this._bubbleVideoEl);
    }
    this._startLoop();
    this._emit('live');
  }

  async disconnect() {
    this._stopLoop();
    if (this._videoEl) this._videoEl.srcObject = null;
    if (this._bubbleVideoEl) this._bubbleVideoEl.srcObject = null;
    this._emit('lost');
  }

  setEmotion(emotion) {
    if (EMOTION_STYLE[emotion]) this._emotion = emotion;
  }

  setListening(isListening) {
    this._listening = !!isListening;
  }

  async speak(ttsHandle, meta) {
    this._speaking = true;
    if (meta && meta.emotion) this.setEmotion(meta.emotion);

    let unsubscribe = null;
    if (ttsHandle && typeof ttsHandle.onBoundary === 'function') {
      // Word-boundary events (WebSpeechTTSProvider fires these natively) —
      // pulse the mouth a bit extra on each word for a slightly less
      // metronomic feel than a pure sine wave.
      unsubscribe = ttsHandle.onBoundary(() => { this._speakPulse = 1; });
    }

    try {
      await (ttsHandle && ttsHandle.done);
    } finally {
      if (unsubscribe) unsubscribe();
      this._speaking = false;
    }
  }

  stopSpeaking() {
    this._speaking = false;
  }

  on(event, handler) {
    (this._listeners[event] = this._listeners[event] || []).push(handler);
  }

  _emit(event) {
    (this._listeners[event] || []).forEach((h) => { try { h(); } catch (e) {} });
  }

  _startLoop() {
    const draw = (now) => {
      this._render(now);
      this._raf = requestAnimationFrame(draw);
    };
    this._raf = requestAnimationFrame(draw);
  }

  _stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  _render(now) {
    const ctx = this._ctx;
    const t = (now - this._t0) / 1000;
    const style = EMOTION_STYLE[this._emotion] || EMOTION_STYLE.neutral;

    // ---- background: soft radial gradient, brand navy ----
    const bg = ctx.createRadialGradient(SIZE / 2, SIZE * 0.4, SIZE * 0.1, SIZE / 2, SIZE / 2, SIZE * 0.75);
    bg.addColorStop(0, COLOR_BG_B);
    bg.addColorStop(1, COLOR_BG_A);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // ---- ambient accent glow, intensity follows emotion ----
    const glowR = SIZE * 0.55;
    const glow = ctx.createRadialGradient(SIZE / 2, SIZE * 0.55, 0, SIZE / 2, SIZE * 0.55, glowR);
    glow.addColorStop(0, hexWithAlpha(COLOR_ACCENT, style.glow * 0.35));
    glow.addColorStop(1, hexWithAlpha(COLOR_ACCENT, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // ---- breathing offset (idle) ----
    const breathe = Math.sin(t * 1.1) * 3;
    const cx = SIZE / 2;
    const cy = SIZE * 0.52 + breathe;
    const headR = SIZE * 0.24;

    // shoulders (simple silhouette, gives "person" read rather than a floating ball)
    ctx.fillStyle = hexWithAlpha('#0b1a2e', 0.9);
    ctx.beginPath();
    ctx.ellipse(cx, cy + headR * 2.05, headR * 1.9, headR * 1.5, 0, Math.PI, 0);
    ctx.fill();

    // head
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = COLOR_FACE;
    ctx.beginPath();
    ctx.ellipse(0, 0, headR * 0.86, headR, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---- blink state ----
    if (now > this._nextBlinkAt) {
      this._blinkUntil = now + 140;
      this._nextBlinkAt = now + 2500 + Math.random() * 3500;
    }
    const blinking = now < this._blinkUntil;
    const eyeOpen = blinking ? 0.08 : (this._listening ? 1.0 : 0.85);

    // eyes
    const eyeY = -headR * 0.08;
    const eyeDX = headR * 0.34;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(side * eyeDX, eyeY);
      ctx.fillStyle = '#1c1c1c';
      ctx.beginPath();
      ctx.ellipse(0, 0, headR * 0.11, headR * 0.11 * eyeOpen, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // eyebrows (emotion signal)
    ctx.strokeStyle = 'rgba(40,30,20,0.55)';
    ctx.lineWidth = Math.max(2, headR * 0.045);
    ctx.lineCap = 'round';
    [-1, 1].forEach((side) => {
      const bx = side * eyeDX;
      const by = eyeY - headR * 0.26;
      const tilt = style.browTilt * side * -1;
      ctx.beginPath();
      ctx.moveTo(bx - headR * 0.14, by + tilt * headR * 0.12);
      ctx.lineTo(bx + headR * 0.14, by - tilt * headR * 0.12);
      ctx.stroke();
    });

    // mouth — speaking animation layered on top of the emotion's resting curve
    let openness = 0.06;
    if (this._speaking) {
      const talk = (Math.sin(t * 13) * 0.5 + 0.5) * 0.55 + this._speakPulse * 0.4;
      openness = 0.1 + talk;
      this._speakPulse *= 0.85;
    }
    const mouthY = headR * 0.42;
    const mouthW = headR * 0.5;
    ctx.strokeStyle = '#7a4a3a';
    ctx.lineWidth = Math.max(2, headR * 0.05);
    ctx.beginPath();
    ctx.moveTo(-mouthW / 2, mouthY);
    ctx.quadraticCurveTo(0, mouthY + style.mouthCurve * headR + openness * headR * 0.6, mouthW / 2, mouthY);
    ctx.stroke();

    ctx.restore();

    // ---- corner brand mark (keeps it from reading as a stray demo canvas) ----
    ctx.fillStyle = 'rgba(250,248,245,0.35)';
    ctx.font = '600 ' + Math.round(SIZE * 0.032) + 'px system-ui, sans-serif';
    ctx.fillText('VERALIQ · MOCK MODE', SIZE * 0.04, SIZE * 0.965);
  }
}

// Bounded wait for a <video>.play() call — see the long comment in
// connect() above for why this can't be a plain `await videoEl.play()`.
function playMuted(videoEl) {
  return Promise.race([
    videoEl.play().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

function hexWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}
