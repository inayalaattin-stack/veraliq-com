# services/avatar — OpenTalking (QuickTalk / MuseTalk)

Unlike `services/stt` and `services/tts`, this is **not a custom service we
wrote** — `agent-core/avatar-providers/quicktalk-avatar-provider.js` and
`musetalk-avatar-provider.js` are HTTP/WHEP clients for
[datascale-ai/opentalking](https://github.com/datascale-ai/opentalking)
(Apache-2.0), an existing, maintained open-source project. The right move is
to run OpenTalking itself, not to reimplement its avatar-inference server —
see `docs/DIGITAL_HUMAN_ENGINE_REPORT.md` §7 for why this project specifically
(it's what the spec's "OPEN TALKING / QUICKTALK" was referring to, confirmed
by a 2026-08-25 research pass).

## ⚠️ License flag before you enable QuickTalk

`datascale-ai/quicktalk`'s model weights are tagged **"License: other"** on
Hugging Face with no clear standard license text found — read
https://huggingface.co/datascale-ai/quicktalk's actual license/model card
yourself before using QuickTalk in production. **MuseTalk (confirmed MIT) is
the safer first model to enable** — see
`docs/DIGITAL_HUMAN_ENGINE_REPORT.md` §7 for the full comparison. Both are
already wired up as swappable providers (`avatarProvider: 'quicktalk'` vs
`'musetalk'` in `agent-core/config.js`) — flipping between them is a
one-line config change once you've deployed OpenTalking, no code change.

## Setup (on your GPU machine, e.g. the Lenovo LOQ 15IAX9)

1. Follow OpenTalking's own install docs:
   https://github.com/datascale-ai/opentalking (and
   https://datascale-ai.github.io/opentalking/latest/ for the full docs site).
   It supports a `mock` model out of the box for a no-GPU smoke test — useful
   to confirm the REST/WHEP wiring below works before pointing real model
   weights at it.
2. Download/register the MuseTalk (and, once its license is confirmed,
   QuickTalk) model weights per OpenTalking's own avatar-model docs
   (`/avatar_models/musetalk/`, `/avatar_models/quicktalk/` on their docs
   site).
3. Confirm `GET /avatars` and `GET /models` on your running instance show
   `connected: true` for the model you intend to use.
4. Point `agent-core/config.js`'s `AGENT_PROVIDER_CONFIG.selfHostedBaseUrl`
   at your OpenTalking server's REST API base URL, and set
   `avatarProvider: 'musetalk'` (or `'quicktalk'` once its license is clear).

## ⚠️ Not verified in this session

The REST session API (`POST /sessions`, `/start`, `/speak`, `/interrupt`,
`DELETE`) used by `agent-core/avatar-providers/opentalking-base.js` was
confirmed against OpenTalking's published API docs on 2026-08-25. The exact
WHEP delivery path and whether a server-sent-events "speech finished" signal
exists were **not** fully confirmed — `opentalking-base.js` makes a
documented best-effort assumption for both (see that file's header comment).
Test against your actual running instance and adjust `whepPathTemplate` (a
constructor option) if the real path differs. This cloud sandbox has no GPU,
so none of this could be run end-to-end here.

## GPU sizing

See `docs/DIGITAL_HUMAN_ENGINE_REPORT.md` §8. Short version: a laptop RTX
4050/4060 (6-8GB VRAM) is plausible for one concurrent visitor; real-time
multi-session concurrency in a published MuseTalk benchmark used an RTX 4090
(24GB). Measure on your actual hardware before promising concurrency to a
client.
