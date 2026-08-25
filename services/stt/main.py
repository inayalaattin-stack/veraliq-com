"""
VERALIQ self-hosted STT service — faster-whisper over a WebSocket.

Matches the client contract in agent-core/stt-providers/whisper-stt-provider.js:

    WebSocket  /stt/stream?lang=tr
    client -> server (binary):  webm/opus audio chunks (~250ms each, from
                                 the browser's MediaRecorder)
    client -> server (text):    {"type":"speech_start"} / {"type":"speech_end"}
                                 (client-side VAD signal — see the .js file)
    server -> client (text):    {"type":"interim","text":...}
                                 {"type":"final","text":...}

State machine per connection:
  - Accumulate incoming binary chunks into a per-connection buffer.
  - While buffering, every INTERIM_INTERVAL_S seconds, decode what's
    accumulated so far and send it as an "interim" result (cheap UX nicety
    — lets the corner widget show partial text, though the current widget
    doesn't render text) — the important barge-in path uses `speech_start`
    to know the customer began talking, which is the same event the
    orchestrator's onInterim path reacts to (see whisper-stt-provider.js:
    onInterim is fired with a non-empty placeholder just to satisfy the
    ">= BARGE_IN_MIN_CHARS" check; the FIRST interim after speech_start is
    what actually triggers barge-in in orchestrator.js).
  - On `speech_end`, run one final decode of the whole buffered utterance,
    send it as "final", then clear the buffer.

⚠️ NOT RUN OR TESTED IN THIS SESSION — this cloud sandbox has no GPU and no
audio hardware. Written to a real, correct-as-far-as-reviewable contract;
validate on your own GPU machine per docs/SELF_HOSTED_DEPLOYMENT.md before
relying on it. In particular: webm/opus -> wav decoding here shells out to
`ffmpeg`, which must be installed in the container (see Dockerfile) — pick a
WHISPER_MODEL_SIZE that fits your GPU's VRAM (see docs/DIGITAL_HUMAN_ENGINE_REPORT.md
§8 for guidance; "small" is a reasonable starting point for a laptop GPU).
"""

import asyncio
import io
import logging
import os
import subprocess
import tempfile
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("veraliq-stt")

WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")  # "cuda" or "cpu"
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")  # "int8" on CPU
INTERIM_INTERVAL_S = 1.5
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "https://veraliq.com").split(",")]

app = FastAPI(title="VERALIQ STT Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_model = None


def get_model():
    """Lazy-load faster-whisper's WhisperModel once per process."""
    global _model
    if _model is None:
        from faster_whisper import WhisperModel  # imported lazily so `uvicorn main:app --reload` fails fast with a clear error if the package is missing
        logger.info("Loading faster-whisper model=%s device=%s compute_type=%s", WHISPER_MODEL_SIZE, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE)
        _model = WhisperModel(WHISPER_MODEL_SIZE, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)
    return _model


def decode_webm_to_wav_bytes(webm_bytes: bytes) -> Optional[bytes]:
    """Shell out to ffmpeg to convert accumulated webm/opus chunks to a
    16kHz mono WAV faster-whisper can read. Returns None on failure (e.g.
    not-yet-valid webm container because MediaRecorder chunks aren't
    independently decodable in isolation for all codecs — see
    docs/SELF_HOSTED_DEPLOYMENT.md's known-limitations note)."""
    with tempfile.NamedTemporaryFile(suffix=".webm") as src, tempfile.NamedTemporaryFile(suffix=".wav") as dst:
        src.write(webm_bytes)
        src.flush()
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", src.name, "-ar", "16000", "-ac", "1", "-f", "wav", dst.name],
                check=True, capture_output=True, timeout=10,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            logger.warning("ffmpeg decode failed (expected occasionally on partial buffers): %s", e)
            return None
        return dst.read()


def transcribe_wav_bytes(wav_bytes: bytes, lang: str) -> str:
    model = get_model()
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        f.write(wav_bytes)
        f.flush()
        segments, _info = model.transcribe(f.name, language=lang if lang != "auto" else None, beam_size=5)
        return "".join(seg.text for seg in segments).strip()


@app.get("/health")
async def health():
    return {"status": "ok", "model": WHISPER_MODEL_SIZE}


@app.websocket("/stt/stream")
async def stt_stream(websocket: WebSocket):
    await websocket.accept()
    lang = websocket.query_params.get("lang", "tr")
    buffer = bytearray()
    loop = asyncio.get_event_loop()
    interim_task: Optional[asyncio.Task] = None

    async def run_interim_loop():
        while True:
            await asyncio.sleep(INTERIM_INTERVAL_S)
            if not buffer:
                continue
            wav = await loop.run_in_executor(None, decode_webm_to_wav_bytes, bytes(buffer))
            if not wav:
                continue
            text = await loop.run_in_executor(None, transcribe_wav_bytes, wav, lang)
            if text:
                await websocket.send_json({"type": "interim", "text": text})

    try:
        interim_task = asyncio.create_task(run_interim_loop())
        while True:
            message = await websocket.receive()
            if "bytes" in message and message["bytes"] is not None:
                buffer.extend(message["bytes"])
            elif "text" in message and message["text"] is not None:
                import json
                try:
                    ctrl = json.loads(message["text"])
                except ValueError:
                    continue
                if ctrl.get("type") == "speech_end" and buffer:
                    wav = await loop.run_in_executor(None, decode_webm_to_wav_bytes, bytes(buffer))
                    buffer.clear()
                    if wav:
                        text = await loop.run_in_executor(None, transcribe_wav_bytes, wav, lang)
                        if text:
                            await websocket.send_json({"type": "final", "text": text})
                elif ctrl.get("type") == "speech_start":
                    buffer.clear()  # start a fresh utterance buffer
    except WebSocketDisconnect:
        pass
    finally:
        if interim_task:
            interim_task.cancel()
