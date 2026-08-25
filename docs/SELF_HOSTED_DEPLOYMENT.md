# Self-Hosted Deployment — VERALIQ Digital Human Engine

This is the operational guide for taking the Digital Human Engine from
"Mock Mode running on veraliq.com today" to "real self-hosted STT/TTS/Avatar
running on your GPU machine". Read `docs/DIGITAL_HUMAN_ENGINE_REPORT.md`
first for the architecture, license research, and honest GPU sizing —
this file is the step-by-step.

**Nothing in this file was executed in the session that wrote it** — the
cloud sandbox that produced this code has no GPU and no audio hardware.
Every step below needs to be run and verified on your own machine.

## 0. What you're deploying

| Layer | Service | Where |
|---|---|---|
| STT | `services/stt` (faster-whisper) | your GPU machine, Docker |
| TTS | `services/tts` (Chatterbox Multilingual V3) | your GPU machine, Docker |
| Avatar | OpenTalking (external project) | your GPU machine, its own install — see `services/avatar/README.md` |
| Frontend/orchestrator | `agent-core/` | already live on veraliq.com (Cloudflare Pages), no change needed here |

## 1. Prerequisites on the GPU machine

- NVIDIA GPU + driver installed, `nvidia-smi` working
- Docker + the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/)
- `ffmpeg` (only needed on the host if you run `services/stt` outside Docker — the Dockerfile installs it inside the container already)

## 2. Bring up STT + TTS

```bash
git clone https://github.com/inayalaattin-stack/veraliq-com.git
cd veraliq-com
# Add at least one consented voice reference sample first:
mkdir -p services/tts/voice_profiles
cp /path/to/your/elif-kaya-reference.wav services/tts/voice_profiles/elif-kaya-tr.wav
docker compose up --build
```

Verify:
```bash
curl http://localhost:8001/health   # {"status":"ok","model":"small"}
curl http://localhost:8002/health   # {"status":"ok"}
```

## 3. Bring up OpenTalking (avatar)

Follow `services/avatar/README.md` — it's a separate project with its own
install flow, not something this repo builds for you. Start with its `mock`
model to confirm connectivity, then move to MuseTalk (confirmed MIT license)
before touching QuickTalk (unconfirmed license — read the flag in that
README first).

## 4. Expose these to the internet safely

veraliq.com runs on Cloudflare Pages — the browser will call your GPU
machine's services directly over the internet, so:

- Put a reverse proxy (e.g. Caddy or nginx) with a real TLS certificate in
  front of ports 8001/8002 (and OpenTalking's ports) — browsers will refuse
  mixed-content `ws://`/`http://` calls from an `https://veraliq.com` page.
- Restrict `ALLOWED_ORIGINS` (already wired into both FastAPI services via
  CORS) to `https://veraliq.com` only in production.
- Do **not** port-forward your home router directly without a firewall/allow-list
  review — this is a machine with a GPU and a webcam-adjacent audio pipeline
  sitting on your home network. A Cloudflare Tunnel (`cloudflared`) is a
  reasonable free option to expose it without opening inbound firewall ports.

## 5. Point the frontend at it

Edit `agent-core/config.js`:

```js
export const AGENT_PROVIDER_CONFIG = {
  avatarProvider: 'musetalk',   // or 'quicktalk' once its license is confirmed
  ttsProvider: 'chatterbox',
  sttProvider: 'whisper',
  llmProvider: 'faq',           // or 'openai'/'anthropic' once you've built a key-holding proxy worker
  selfHostedBaseUrl: 'https://your-gpu-machine.example.com',
};
```

Then update `_headers`' CSP `connect-src` (and add a `wss://` entry for the
STT WebSocket) to include that origin — see the comment already left in
`_headers` for exactly what to add.

## 6. Verify before trusting it with real visitors

- Open the site, confirm the corner widget connects and the avatar
  animates (even MuseTalk's basic quality is a meaningful step up from Mock
  Mode's flat canvas face).
- Speak a full sentence in Turkish; confirm a reasonable transcript comes
  back and the agent replies in-character.
- **Barge-in test**: while the agent is speaking, start talking over it —
  confirm it stops within roughly a second and starts listening (spec
  section 6 is explicit this is a critical feature).
- Check GPU memory usage under one active session (`nvidia-smi` while
  connected) against your card's actual VRAM — see
  `docs/DIGITAL_HUMAN_ENGINE_REPORT.md` §8 before promising multi-session
  concurrency to a client.

## Known limitations to fix before this is a finished product

- `services/stt/main.py`'s webm→wav decode runs ffmpeg on the accumulated
  buffer, not a true incremental streaming decoder — fine for one exchange
  at a time, but latency will grow if buffers get long; tune
  `INTERIM_INTERVAL_S` and the client VAD thresholds
  (`agent-core/stt-providers/whisper-stt-provider.js`) once you can hear the
  real behavior.
- `opentalking-base.js`'s WHEP path and "speech done" signal are
  best-effort guesses pending confirmation against your actual OpenTalking
  deployment — see that file's header comment.
- No LLM is wired up yet beyond the deterministic FAQ brain — building the
  `veraliq-llm` proxy worker (holding an OpenAI/Anthropic key server-side,
  see `agent-core/llm-providers/openai-provider.js`'s header comment) is a
  separate, still-open task.
