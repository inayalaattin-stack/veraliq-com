// agent-core/visitor-session.js
//
// Acquires the short-lived "visitor token" that worker-spatius/session-worker.js
// (Faz 2 — see IMPLEMENTATION-PLAN.md) now requires before /session or /tts
// will do anything. Lives in agent-core/ rather than inside a specific
// provider file per this project's "Cross-surface by default" rule —
// index.html/admin.html/portal.html all reach it through the same shared
// widget-runtime.js.
//
// IMPORTANT: acquireVisitorToken() must only be called AFTER the visitor has
// seen the AI disclosure and clicked "Onayla ve başlat" (see
// agent-core/call-consent.js) — calling it earlier would defeat the whole
// point of gating /session/tts behind consent. widget-runtime.js enforces
// this by only calling it once callConsent.request() has resolved true.

const VISITOR_TOKEN_ENDPOINT = 'https://veraliq-spatius-session.veraliq-com.workers.dev/visitor-token';

// Module-scope cache: a visitor token covers one whole conversation (many
// /tts calls, one /session call), so it's fetched once per call, not once
// per request.
let cached = null; // { token: string, expiresAt: number } | null

function isFresh(entry) {
  // 30s guard band so a token doesn't expire mid-flight between "we checked
  // it's fresh" and "the /session or /tts request this token is for actually
  // lands at the Worker".
  return !!entry && entry.expiresAt * 1000 - Date.now() > 30_000;
}

/**
 * Fetches (or reuses a still-fresh) visitor token. Throws if the Worker
 * rejects the request (e.g. rate limited, Turnstile required/failed, or the
 * Worker isn't configured yet) — callers should treat that the same as any
 * other connection failure (existing error/reconnect state), never as a
 * reason to fall back to a text-chat UI (see CLAUDE.md's voice-only rule).
 * @returns {Promise<string>} the bearer token to attach to /session and /tts
 */
export async function acquireVisitorToken() {
  if (isFresh(cached)) return cached.token;
  const resp = await fetch(VISITOR_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!resp.ok) throw new Error('visitor_token_http_' + resp.status);
  const data = await resp.json();
  if (!data || !data.visitorToken) throw new Error('visitor_token_missing');
  cached = { token: data.visitorToken, expiresAt: data.expiresAt };
  return cached.token;
}

/**
 * Synchronous read of the cached token for providers attaching it to a
 * request. Throws if none was acquired (or it already expired) — that means
 * acquireVisitorToken() was never awaited before connecting, a programming
 * error, not a runtime condition to swallow silently.
 * @returns {string}
 */
export function getVisitorToken() {
  if (!isFresh(cached)) throw new Error('visitor_token_not_acquired');
  return cached.token;
}

/** Clears the cached token (call on disconnect) so a stale one is never reused for an unrelated later session. */
export function clearVisitorToken() {
  cached = null;
}
