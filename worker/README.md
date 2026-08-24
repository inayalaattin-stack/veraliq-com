# veraliq-agent worker

One job: exchange the server-side `ANAM_API_KEY` secret for a short-lived
Anam session token, so the browser never sees the real API key. This is
what index.html's front-end Anam SDK integration calls before it opens
the live video/voice session with "Elif Kaya".

Deployed at: `https://veraliq-agent.veraliq-com.workers.dev`

## Setup

1. `cd worker && wrangler deploy` (or paste `session-worker.js` into the
   Cloudflare dashboard's Quick Edit for the `veraliq-agent` Worker).
2. Set the secret: Cloudflare dashboard -> Workers & Pages -> veraliq-agent
   -> Settings -> Variables and Secrets -> add `ANAM_API_KEY` (type:
   Secret) with an Anam Lab API key that has session-token permission.
3. That's it — no database, no other bindings. The persona itself (voice,
   avatar, system prompt, language behaviour, tools) is entirely managed
   in Anam Lab, not in this code.

## Why this exists instead of the widget's `<anam-agent>` embed

The embeddable `<anam-agent>` widget is domain-allowlisted and needs no
backend, but it only supports a fixed floating-bubble layout. It cannot
support Veraliq's adaptive agent window (corner / half-screen /
fullscreen / minimized). Anam's own JS SDK gives full control of the
video element and UI chrome, but it requires a session token minted
server-side — this worker is that minimal server side.
