// worker-spatius/test/session-worker.test.mjs
//
// Tests session-worker.js's route handlers directly (no wrangler/miniflare —
// same dependency-free philosophy as worker-portal/test/portal-worker.test.mjs).
// The global `fetch` is stubbed for the whole file so NOTHING here ever makes
// a real network call to Spatius, Google Translate, or Cloudflare Turnstile —
// required by the master implementation prompt: "no test may make a real
// paid/quota-consuming call by default".
//
// Çalıştırma:  cd worker-spatius/test && node --experimental-sqlite session-worker.test.mjs
// (--experimental-sqlite is harmless here — kept only for command-line
// parity with worker-portal's test runner; this file uses no sqlite.)

import { handleVisitorToken, handleSession, handleTts, corsHeaders } from '../session-worker.js';
import { signVisitorToken } from '../visitor-token.js';

const SPATIUS_UPSTREAM = 'https://console.us-west.spatius.ai/v1/console/session-tokens';
const TTS_UPSTREAM = 'https://translate.google.com/translate_tts';
const TURNSTILE_UPSTREAM = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// ---- fetch stub: routes by URL prefix, never touches the real network ----
let fetchCalls = [];
let mock = {
  spatius: { ok: true, status: 200, json: async () => ({ sessionToken: header() + '.' + payload() }) },
  tts: { ok: true, status: 200, headers: new Map([['content-type', 'audio/mpeg']]), body: 'fake-audio-stream' },
  turnstile: { ok: true, status: 200, json: async () => ({ success: true }) },
};
function header() { return Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'); }
function payload() { return Buffer.from(JSON.stringify({ app_id: 'app_from_jwt' })).toString('base64url'); }

globalThis.fetch = async (url, opts) => {
  fetchCalls.push({ url: String(url), opts });
  if (String(url).startsWith(SPATIUS_UPSTREAM)) {
    const m = mock.spatius;
    return { ok: m.ok, status: m.status, json: m.json, text: async () => m.text || '' };
  }
  if (String(url).startsWith(TTS_UPSTREAM)) {
    const m = mock.tts;
    return { ok: m.ok, status: m.status, headers: { get: (k) => m.headers.get(k.toLowerCase()) }, body: m.body };
  }
  if (String(url) === TURNSTILE_UPSTREAM) {
    const m = mock.turnstile;
    return { ok: m.ok, status: m.status, json: m.json };
  }
  throw new Error('unexpected fetch to ' + url);
};

// ---- env / rate-limiter mocks ---------------------------------------------
function allowingLimiter() { return { limit: async () => ({ success: true }) }; }
function denyingLimiter() { return { limit: async () => ({ success: false }) }; }

function baseEnv(overrides) {
  return {
    SPATIUS_APP_ID: 'app-id-from-secret',
    SPATIUS_API_KEY: 'api-key-from-secret',
    VISITOR_TOKEN_SECRET: 'visitor-secret',
    VISITOR_TOKEN_RATE_LIMITER: allowingLimiter(),
    SESSION_RATE_LIMITER: allowingLimiter(),
    TTS_RATE_LIMITER: allowingLimiter(),
    ...overrides,
  };
}

function req(method, path, body, headers) {
  return new Request('https://veraliq-spatius-session.veraliq-com.workers.dev' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: 'https://veraliq.com', ...(headers || {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function headersFor(request) {
  return corsHeaders(request.headers.get('Origin') || '');
}

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('PASS:', label); }
  else { fail++; console.log('FAIL:', label, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function validVisitorToken(env) {
  const { token } = await signVisitorToken(env.VISITOR_TOKEN_SECRET, 20 * 60);
  return token;
}

const run = async () => {
  // ---- corsHeaders --------------------------------------------------------
  {
    const h = corsHeaders('https://veraliq.com');
    check('cors: allowed origin reflected', h['Access-Control-Allow-Origin'] === 'https://veraliq.com');
    check('cors: no-store present', h['Cache-Control'] === 'no-store');
    check('cors: Authorization allowed in preflight', h['Access-Control-Allow-Headers'].includes('Authorization'));
  }
  {
    const h = corsHeaders('https://evil.example.com');
    check('cors: untrusted origin NOT reflected', h['Access-Control-Allow-Origin'] === 'https://veraliq.com');
  }

  // ---- /visitor-token -------------------------------------------------------
  {
    fetchCalls = [];
    const env = baseEnv();
    const r = req('POST', '/visitor-token', {}, { Origin: 'https://evil.example.com' });
    const resp = await handleVisitorToken(r, env, headersFor(r));
    check('visitor-token: untrusted origin rejected (403)', resp.status === 403);
  }
  {
    const env = baseEnv({ VISITOR_TOKEN_SECRET: undefined });
    const r = req('POST', '/visitor-token', {});
    const resp = await handleVisitorToken(r, env, headersFor(r));
    check('visitor-token: missing secret -> 500 server_not_configured', resp.status === 500);
  }
  {
    const env = baseEnv({ VISITOR_TOKEN_RATE_LIMITER: denyingLimiter() });
    const r = req('POST', '/visitor-token', {});
    const resp = await handleVisitorToken(r, env, headersFor(r));
    check('visitor-token: rate limited -> 429', resp.status === 429);
  }
  {
    const env = baseEnv({ VISITOR_TOKEN_RATE_LIMITER: null });
    const r = req('POST', '/visitor-token', {});
    const resp = await handleVisitorToken(r, env, headersFor(r));
    check('visitor-token: unconfigured rate limiter FAILS CLOSED (429), not silently open', resp.status === 429);
  }
  {
    const env = baseEnv();
    const r = req('POST', '/visitor-token', {});
    const resp = await handleVisitorToken(r, env, headersFor(r));
    const data = await resp.json();
    check('visitor-token: issues a token when no Turnstile configured', resp.status === 200 && !!data.visitorToken, data);
    const cache = resp.headers.get ? resp.headers.get('Cache-Control') : resp.headers['Cache-Control'];
    check('visitor-token: response has Cache-Control: no-store', cache === 'no-store');
  }
  {
    mock.turnstile = { ok: true, status: 200, json: async () => ({ success: false, ['error-codes']: ['invalid-input-response'] }) };
    const env = baseEnv({ TURNSTILE_SECRET_KEY: 'turnstile-secret' });
    const r = req('POST', '/visitor-token', { turnstileToken: 'bad-token' });
    const resp = await handleVisitorToken(r, env, headersFor(r));
    check('visitor-token: Turnstile verification failure -> 403', resp.status === 403);
    mock.turnstile = { ok: true, status: 200, json: async () => ({ success: true }) }; // reset
  }
  {
    const env = baseEnv({ TURNSTILE_SECRET_KEY: 'turnstile-secret' });
    const r = req('POST', '/visitor-token', {}); // no turnstileToken in body
    const resp = await handleVisitorToken(r, env, headersFor(r));
    check('visitor-token: Turnstile configured but token missing from body -> 400', resp.status === 400);
  }
  {
    const env = baseEnv({ TURNSTILE_SECRET_KEY: 'turnstile-secret' });
    const r = req('POST', '/visitor-token', { turnstileToken: 'good-token' });
    const resp = await handleVisitorToken(r, env, headersFor(r));
    check('visitor-token: Turnstile success path issues a token', resp.status === 200);
  }

  // ---- /session ---------------------------------------------------------
  {
    const env = baseEnv();
    const r = req('POST', '/session', {}); // no Authorization header
    const resp = await handleSession(r, env, headersFor(r));
    check('session: missing visitor token -> 401', resp.status === 401);
  }
  {
    const env = baseEnv();
    const r = req('POST', '/session', {}, { Authorization: 'Bearer not-a-real-token' });
    const resp = await handleSession(r, env, headersFor(r));
    check('session: invalid visitor token -> 401', resp.status === 401);
  }
  {
    const env = baseEnv();
    const expiredSig = await signVisitorToken(env.VISITOR_TOKEN_SECRET, -10);
    const r = req('POST', '/session', {}, { Authorization: 'Bearer ' + expiredSig.token });
    const resp = await handleSession(r, env, headersFor(r));
    const data = await resp.json();
    check('session: expired visitor token -> 401 visitor_token_invalid/expired', resp.status === 401 && data.reason === 'expired', data);
  }
  {
    const env = baseEnv({ SPATIUS_API_KEY: undefined });
    const token = await validVisitorToken(env);
    const r = req('POST', '/session', {}, { Authorization: 'Bearer ' + token });
    const resp = await handleSession(r, env, headersFor(r));
    check('session: missing Spatius secret -> 500 server_not_configured', resp.status === 500);
  }
  {
    const env = baseEnv({ SESSION_RATE_LIMITER: denyingLimiter() });
    const token = await validVisitorToken(env);
    const r = req('POST', '/session', {}, { Authorization: 'Bearer ' + token });
    const resp = await handleSession(r, env, headersFor(r));
    check('session: rate limited -> 429', resp.status === 429);
  }
  {
    fetchCalls = [];
    const env = baseEnv();
    const token = await validVisitorToken(env);
    const r = req('POST', '/session', {}, { Authorization: 'Bearer ' + token });
    const resp = await handleSession(r, env, headersFor(r));
    const data = await resp.json();
    check('session: happy path returns sessionToken + jwt-derived appId', resp.status === 200 && !!data.sessionToken && data.appId === 'app_from_jwt', data);
    check('session: upstream called exactly once', fetchCalls.length === 1, fetchCalls);
    const cache = resp.headers.get ? resp.headers.get('Cache-Control') : resp.headers['Cache-Control'];
    check('session: response has Cache-Control: no-store', cache === 'no-store');
  }
  {
    // Faz 2 fix: upstream error detail must never reach the client.
    mock.spatius = { ok: false, status: 402, text: 'ACCOUNT UPGRADE REQUIRED — billing id acct_9f3... contact ops@spatius.ai' };
    const env = baseEnv();
    const token = await validVisitorToken(env);
    const r = req('POST', '/session', {}, { Authorization: 'Bearer ' + token });
    const resp = await handleSession(r, env, headersFor(r));
    const data = await resp.json();
    check('session: upstream error body never leaked to client', resp.status === 502 && JSON.stringify(data).indexOf('acct_9f3') === -1, data);
    check('session: quota-looking error trips the breaker (status field present, no raw detail)', data.error === 'session_token_failed' && data.status === 402, data);
  }
  {
    // Quota breaker: the PREVIOUS test tripped it — the next call must be
    // short-circuited WITHOUT calling upstream again.
    fetchCalls = [];
    const env = baseEnv();
    const token = await validVisitorToken(env);
    const r = req('POST', '/session', {}, { Authorization: 'Bearer ' + token });
    const resp = await handleSession(r, env, headersFor(r));
    const data = await resp.json();
    check('session: quota breaker short-circuits without calling upstream again', resp.status === 502 && data.quota_exhausted === true && fetchCalls.length === 0, { data, fetchCalls });
    mock.spatius = { ok: true, status: 200, json: async () => ({ sessionToken: header() + '.' + payload() }) }; // reset for later tests
  }

  // ---- /tts ---------------------------------------------------------------
  {
    const env = baseEnv();
    const r = new Request('https://x.test/tts', { method: 'POST', headers: { Origin: 'https://veraliq.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Merhaba' }) });
    const resp = await handleTts(r, env, headersFor(r));
    check('tts: missing visitor token -> 401', resp.status === 401);
  }
  {
    const env = baseEnv();
    const token = await validVisitorToken(env);
    const r = new Request('https://x.test/tts', { method: 'POST', headers: { Origin: 'https://veraliq.com', 'Content-Type': 'text/plain', Authorization: 'Bearer ' + token }, body: 'text=Merhaba' });
    const resp = await handleTts(r, env, headersFor(r));
    check('tts: non-JSON content-type rejected (415)', resp.status === 415);
  }
  {
    const env = baseEnv();
    const token = await validVisitorToken(env);
    const big = 'a'.repeat(5000);
    const r = new Request('https://x.test/tts', { method: 'POST', headers: { Origin: 'https://veraliq.com', 'Content-Type': 'application/json', 'Content-Length': String(big.length), Authorization: 'Bearer ' + token }, body: JSON.stringify({ text: big }) });
    const resp = await handleTts(r, env, headersFor(r));
    check('tts: oversized body rejected (413) via Content-Length', resp.status === 413);
  }
  {
    const env = baseEnv();
    const token = await validVisitorToken(env);
    const r = new Request('https://x.test/tts', { method: 'POST', headers: { Origin: 'https://veraliq.com', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ text: '   ' }) });
    const resp = await handleTts(r, env, headersFor(r));
    check('tts: blank text rejected (400 missing_text)', resp.status === 400);
  }
  {
    const env = baseEnv();
    const token = await validVisitorToken(env);
    const tooLong = 'x'.repeat(250);
    const r = new Request('https://x.test/tts', { method: 'POST', headers: { Origin: 'https://veraliq.com', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ text: tooLong }) });
    const resp = await handleTts(r, env, headersFor(r));
    check('tts: text over 200 chars rejected (400 text_too_long)', resp.status === 400);
  }
  {
    const env = baseEnv();
    const token = await validVisitorToken(env);
    const r = new Request('https://x.test/tts', { method: 'POST', headers: { Origin: 'https://veraliq.com', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ text: 'Merhaba', lang: '<script>' }) });
    const resp = await handleTts(r, env, headersFor(r));
    check('tts: malformed lang code rejected (400 invalid_lang)', resp.status === 400);
  }
  {
    const env = baseEnv({ TTS_RATE_LIMITER: denyingLimiter() });
    const token = await validVisitorToken(env);
    const r = new Request('https://x.test/tts', { method: 'POST', headers: { Origin: 'https://veraliq.com', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ text: 'Merhaba' }) });
    const resp = await handleTts(r, env, headersFor(r));
    check('tts: rate limited -> 429', resp.status === 429);
  }
  {
    fetchCalls = [];
    const env = baseEnv();
    const token = await validVisitorToken(env);
    const r = new Request('https://x.test/tts', { method: 'POST', headers: { Origin: 'https://veraliq.com', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ text: 'Merhaba, nasılsınız?', lang: 'tr' }) });
    const resp = await handleTts(r, env, headersFor(r));
    const audioText = await resp.text();
    check('tts: happy path streams audio body through', resp.status === 200 && audioText === 'fake-audio-stream', audioText);
    check('tts: upstream request text sent as query, not leaked into our own logs beyond this one call', fetchCalls.length === 1 && fetchCalls[0].url.includes(encodeURIComponent('Merhaba')));
    const cache = resp.headers.get ? resp.headers.get('Cache-Control') : resp.headers['Cache-Control'];
    check('tts: response has Cache-Control: no-store', cache === 'no-store');
  }
  {
    mock.tts = { ok: false, status: 429, headers: new Map([['content-type', 'text/plain']]), body: '' };
    const env = baseEnv();
    const token = await validVisitorToken(env);
    const r = new Request('https://x.test/tts', { method: 'POST', headers: { Origin: 'https://veraliq.com', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ text: 'Merhaba' }) });
    const resp = await handleTts(r, env, headersFor(r));
    check('tts: upstream failure mapped to 502', resp.status === 502);
    mock.tts = { ok: true, status: 200, headers: new Map([['content-type', 'audio/mpeg']]), body: 'fake-audio-stream' }; // reset
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
};

run().catch(e => { console.error('TEST HARNESS CRASHED:', e); process.exit(1); });
