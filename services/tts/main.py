"""
VERALIQ self-hosted TTS service — Chatterbox Multilingual V3 (Resemble AI,
MIT license — see docs/DIGITAL_HUMAN_ENGINE_REPORT.md §7) behind a small
FastAPI wrapper.

Matches the client contract in agent-core/tts-providers/chatterbox-tts-provider.js:

    POST /tts/synthesize
    body: {"text": "...", "lang": "tr", "voice_id": "elif-kaya-tr", "emotion": "happy"}
    response: audio/wav binary body

Voice profiles (spec section 4 — "agent.voice_id = 'elif-kaya-tr'", "voice
cloning" for VERALIQ-owned/consented agent voices only, NEVER a real
person's voice without consent) are stored as reference audio files under
./voice_profiles/<voice_id>.wav and resolved by name — this endpoint never
accepts a raw uploaded voice sample from the browser. Adding a new agent
voice is a deploy-time step (drop a consented reference .wav in that
folder), not a runtime API call, precisely to keep voice cloning out of
untrusted client reach.

⚠️ NOT RUN OR TESTED IN THIS SESSION — no GPU in this cloud sandbox. Verify
on your own GPU machine per docs/SELF_HOSTED_DEPLOYMENT.md. The exact
chatterbox-tts Python package API may differ slightly by version; check
https://github.com/resemble-ai/chatterbox's README against the
`model.generate(...)` call below when you actually install it.
"""

import io
import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("veraliq-tts")

VOICE_PROFILES_DIR = os.environ.get("VOICE_PROFILES_DIR", "./voice_profiles")
DEFAULT_VOICE_ID = os.environ.get("DEFAULT_VOICE_ID", "elif-kaya-tr")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "https://veraliq.com").split(",")]

app = FastAPI(title="VERALIQ TTS Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST"],
    allow_headers=["*"],
)

_model = None


def get_model():
    global _model
    if _model is None:
        from chatterbox.tts import ChatterboxMultilingualTTS  # lazy import — fails fast with a clear error if not installed
        logger.info("Loading Chatterbox Multilingual TTS model")
        _model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
    return _model


class SynthesizeRequest(BaseModel):
    text: str
    lang: str = "tr"
    voice_id: str = DEFAULT_VOICE_ID
    emotion: str = "neutral"
    exaggeration: float = 0.5  # Chatterbox's expressiveness knob — kept low/default per spec "abartılı olmamalı"


# Coarse emotion -> exaggeration/cfg nudge. Deliberately subtle (spec
# section 10: corporate and natural, never cartoonish).
EMOTION_EXAGGERATION = {
    "happy": 0.6, "excited": 0.7, "surprised": 0.6,
    "concerned": 0.4, "empathetic": 0.45, "thinking": 0.4,
    "professional": 0.5, "neutral": 0.5, "greeting": 0.55,
}


def resolve_voice_reference(voice_id: str) -> str:
    path = os.path.join(VOICE_PROFILES_DIR, voice_id + ".wav")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"unknown voice_id '{voice_id}' — add {path} (a VERALIQ-owned/consented reference sample) to enable it")
    return path


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/tts/synthesize")
async def synthesize(req: SynthesizeRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")

    voice_ref = resolve_voice_reference(req.voice_id)
    exaggeration = EMOTION_EXAGGERATION.get(req.emotion, req.exaggeration)

    model = get_model()
    # NOTE: verify this call shape against the installed chatterbox-tts
    # version — Resemble AI's API has changed across releases.
    wav_tensor = model.generate(
        req.text,
        language_id=req.lang,
        audio_prompt_path=voice_ref,
        exaggeration=exaggeration,
    )

    buf = io.BytesIO()
    import torchaudio
    torchaudio.save(buf, wav_tensor, model.sr, format="wav")
    buf.seek(0)
    return StreamingResponse(buf, media_type="audio/wav")
