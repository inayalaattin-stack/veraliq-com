// worker-portal/auth.js
//
// Parola hash'leme (PBKDF2-SHA256, Web Crypto — Cloudflare Workers runtime'ında
// yerleşik, ek paket gerektirmez) ve JWT imzalama/doğrulama (HMAC-SHA256).
//
// GÜVENLİK NOTU: Bu dosya düz metin parolayı ASLA saklamaz, loglamaz veya
// geri döndürmez. Master Platform Prompt madde 57 (API Security) ve madde 44
// ("LLM IBAN üretemez" ile aynı ruhla: "hiçbir sistem bileşeni ham gizli veri
// üretmez/saklamaz") ile uyumlu.

const PBKDF2_ITERATIONS = 100000;

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Password hashing — PBKDF2-SHA256, 100k iterasyon, rastgele 16 byte salt.
// Depolanan format: "pbkdf2$<iterations>$<saltB64url>$<hashB64url>"
// ---------------------------------------------------------------------------
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return 'pbkdf2$' + PBKDF2_ITERATIONS + '$' + toBase64Url(salt) + '$' + toBase64Url(new Uint8Array(derived));
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromBase64Url(parts[2]);
  const expected = parts[3];
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const actual = toBase64Url(new Uint8Array(derived));
  // Sabit zamanlı karşılaştırma (timing attack koruması).
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// JWT — HMAC-SHA256. Basit, bağımlılıksız bir uygulama (jose/jsonwebtoken gibi
// bir npm paketi eklemeye gerek yok; Workers runtime'ı zaten crypto.subtle
// sağlıyor). Claims: sub (user id), company_id (null=admin), role, exp.
// ---------------------------------------------------------------------------
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function signJWT(payload, secret, expiresInSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + (expiresInSeconds || 3600 * 12) };
  const headerB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const bodyB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(body)));
  const signingInput = headerB64 + '.' + bodyB64;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return signingInput + '.' + sigB64;
}

export async function verifyJWT(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sigB64] = parts;
  // GÜVENLİK DÜZELTMESİ (2026-08-27, gerçek bir Playwright/test-suite testiyle
  // bulundu): rastgele/bozuk bir token (ör. "completely.garbage.token") 3
  // parçaya bölünüyor (uzunluk kontrolünü geçiyor) ama parçalar GEÇERLİ
  // base64url değil — fromBase64Url() içindeki atob() bu durumda
  // InvalidCharacterError FIRLATIYORDU, bu da try/catch'siz olduğu için
  // portal-api-worker.js'in en dıştaki genel catch'ine kadar yükseliyor ve
  // "unauthorized" (401) yerine "internal_error" (500) döndürüyordu — hem
  // yanlış HTTP anlamı (kimlik doğrulama hatası bir sunucu çökmesi değildir)
  // hem de gereksiz hata-izleme/log gürültüsü (bot/tarayıcı gönderdiği her
  // bozuk token 500 olarak görünürdü). Şimdi tüm decode/verify adımı
  // try/catch içinde — herhangi bir hata sessizce null (→ 401) döndürür.
  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC', key, fromBase64Url(sigB64), new TextEncoder().encode(headerB64 + '.' + bodyB64)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(bodyB64)));
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export function generateId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return (prefix || 'id') + '_' + toBase64Url(bytes).toLowerCase();
}
