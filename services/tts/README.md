# services/tts — Chatterbox Multilingual V3 (self-hosted)

Wraps [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) (MIT
license) in a minimal FastAPI service matching the contract
`agent-core/tts-providers/chatterbox-tts-provider.js` expects. See
`docs/DIGITAL_HUMAN_ENGINE_REPORT.md` §7 for the license research and §8 for
GPU sizing.

## Voice profiles — spec section 4 ("voice cloning" rules)

The spec is explicit: **never clone a real person's voice without their
consent**, and agent voices must be **VERALIQ-owned/consented profiles**.
This service enforces that structurally, not just by policy: `/tts/synthesize`
only ever resolves a `voice_id` to a reference `.wav` file that YOU placed in
`voice_profiles/` at deploy time — there is no API for a browser client to
upload or specify a raw voice sample. To add a new agent voice (e.g. a male
voice, or a distinct voice per client company's persona):

1. Record (or otherwise legitimately obtain, with documented consent) a clean
   ~10-20 second reference sample of the voice.
2. Save it as `voice_profiles/<voice_id>.wav` (e.g. `elif-kaya-tr.wav`).
3. Reference that `voice_id` from `agent.voice_id` in the agent identity
   config (see `agent-core/widget.js`'s `AGENT_IDENTITY`).

`voice_profiles/` is git-ignored (see repo root `.gitignore`) — these files
never belong in version control.

## Running (GPU machine)

```bash
docker build -t veraliq-tts .
docker run --gpus all -p 8002:8002 -v $(pwd)/voice_profiles:/app/voice_profiles veraliq-tts
```

Then point `agent-core/config.js`'s `AGENT_PROVIDER_CONFIG.selfHostedBaseUrl`
at `http://<your-server>:8002` and set `ttsProvider: 'chatterbox'`.

## Not verified in this session

This code was written against Chatterbox's published README/model card, not
run — this cloud sandbox has no GPU. Before production use: build the image,
confirm `chatterbox.tts.ChatterboxMultilingualTTS.from_pretrained(...)` and
`model.generate(...)` still match the installed package version (check
resemble-ai/chatterbox's current README), and listen to the actual output
for Turkish naturalness.
