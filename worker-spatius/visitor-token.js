// worker-spatius/visitor-token.js
//
// Pure, dependency-free HMAC-SHA256 signing/verification for the short-lived
// "visitor token" that gates /session and /tts (Faz 2 — see IMPLEMENTATION-
// PLAN.md). Uses only the standard Web Crypto `crypto.subtle` API, which
// both the Cloudflare Workers runtime and Node (20+) provide globally — so
// this exact code runs unit-tested in worker-spatius/test/session-worker.test.mjs
// AND in the live Worker with zero drift between what was tested and what
// ships.
//
// Token shape: base64url(JSON payload) + '.' + base64url(HMAC-SHA256
// signature over the base64url payload). Not a full JWT — no header, no alg
// negotiation (there's exactly one algorithm here, so nothing to negotiate
// or downgrade) — kept intentionally minimal.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const padLen = (4 - (str.length % 4)) % 4;
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * @param {string} secret
 * @param {number} ttlSeconds
 * @returns {Promise<{token: string, expiresAt: number}>}
 */
export async function signVisitorToken(secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now, exp: now + ttlSeconds };
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  return { token: `${payloadB64}.${sigB64}`, expiresAt: payload.exp };
}

/**
 * @param {string} secret
 * @param {string} token
 * @returns {Promise<{valid: boolean, reason?: string, payload?: {iat:number, exp:number}}>}
 */
export async function verifyVisitorToken(secret, token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) {
    return { valid: false, reason: 'malformed' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, reason: 'malformed' };
  const [payloadB64, sigB64] = parts;

  let payload;
  try {
    payload = JSON.parse(decoder.decode(base64UrlDecode(payloadB64)));
  } catch (e) {
    return { valid: false, reason: 'malformed' };
  }

  let expectedSig;
  let actualSig;
  try {
    const key = await importKey(secret);
    expectedSig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64)));
    actualSig = base64UrlDecode(sigB64);
  } catch (e) {
    return { valid: false, reason: 'malformed' };
  }

  if (actualSig.length !== expectedSig.length) return { valid: false, reason: 'bad_signature' };
  // Length is already equal and checked above, so this loop alone doesn't
  // make the comparison constant-time against a length side-channel — but
  // it does avoid the more obvious short-circuit-on-first-byte-mismatch
  // timing leak for equal-length inputs, which is the realistic risk here.
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) diff |= actualSig[i] ^ expectedSig[i];
  if (diff !== 0) return { valid: false, reason: 'bad_signature' };

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || now >= payload.exp) return { valid: false, reason: 'expired' };

  return { valid: true, payload };
}
