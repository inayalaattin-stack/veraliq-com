// worker-spatius/session-worker.js
//
// veraliq-spatius-session — minimal, single-purpose Cloudflare Worker.
//
// visitor-token.js holds the pure sign/verify logic for Faz 2's visitor-
// token gate (kept separate so it can be unit-tested without Workers APIs).
import { signVisitorToken, verifyVisitorToken } from './visitor-token.js';
//
// AYRI bir worker olarak tutuluyor (worker/session-worker.js'deki, hâlihazırda
// CANLI olan Anam worker'ına DOKUNULMADI — brief madde 17: mevcut çalışan
// sistemi bozma). Bunun tek işi: Spatius App ID / API Key'i (sunucu-tarafı
// secret olarak, SPATIUS_APP_ID / SPATIUS_API_KEY) kısa ömürlü bir Spatius
// Session Token'a çevirmek — böylece tarayıcı gerçek API key'i asla görmez
// (docs.spatius.ai/api-reference/authentication.md: "Call the Spatius API
// from your backend only. Never embed the API key in client-side code").
//
// DURUM (2026-08-25): Worker deploy edildi. İlk denemede UPSTREAM_URL tahmini
// yanlış çıktı (DNS hatası — Cloudflare error 1016) — docs.spatius.ai/
// api-reference/api-reference.md'nin gerçek curl örneği okunarak doğru
// endpoint bulundu ve aşağıya işlendi:
//   POST https://console.us-west.spatius.ai/v1/console/session-tokens
//   Header: X-API-Key (bu spesifik endpoint için X-App-ID GEREKMİYOR —
//   resmi örnekte sadece X-API-Key var; X-App-ID diğer "open" API'lerde
//   kullanılıyor, örn. console.spatius.ai/v1/open/avatars).
// SPATIUS_APP_ID secret'ı yine de tutuluyor çünkü istemci tarafında
// AvatarSDK.initialize(appId, ...) için gerekiyor — sadece bu upstream
// isteğine header olarak eklenmiyor.
//
// İKİNCİ BUG (bulundu ve düzeltildi): gerçek upstream çağrısı
// {"error":"session_token_failed", detail: "expire_at cannot be more than
// 24 hours in the future"} ile döndü. Sebep: "expireAt" alan adı doğruydu
// ama DEĞER birimi yanlıştı — Date.now() JS'te MİLİSANİYE döndürür, ama
// Spatius API'si SANİYE cinsinden Unix timestamp bekliyor (doğrulandı:
// docs.spatius.ai/api-reference/api-reference.md örneği
// "$(($(date +%s) + 3600))" kullanıyor — date +%s saniye verir). Milisaniye
// değeri saniye sanılınca tarih ~56000 yılına gidiyor, "24 saatten fazla"
// hatası da buradan geliyordu. Aşağıda saniyeye çevrildi. Yanıttaki alan
// adı da doğrulandı: "sessionToken" (data.sessionToken zaten doğruydu).
//
// ÜÇÜNCÜ BUG (bulundu ve düzeltildi): session token akışı çalışıp Elif Kaya
// (Clara görseli) doğru şekilde göründükten SONRA bile
// "controller.onError: App ID mismatch" ile bağlantı kopuyordu. Claude'un
// kendi Chrome oturumundan sessionToken'ın JWT payload'ı decode edilerek
// (fetch sarmalanıp yanıt yakalanarak) kanıtlandı: JWT'nin İÇİNDEKİ gerçek
// app_id (Spatius'un API Key'e göre KENDİ belirlediği değer, ör.
// "app_mt8yu8ny_101kfqg") ile bu worker'ın env.SPATIUS_APP_ID secret'ından
// döndürdüğü appId (kullanıcının Studio'dan elle kopyaladığı değer, ör.
// "app_mt8yog5x_1dn99l4") BİRBİRİNDEN FARKLIYDI — muhtemelen elle
// kopyalarken karışan benzer karakterler yüzünden (yog5x/yu8ny gibi).
// AvatarSDK.initialize(appId, ...) bu iki değerin eşleşmesini bekliyor.
// FIX: env.SPATIUS_APP_ID'ye güvenmek yerine, gerçek app_id artık
// session token'ın KENDİSİNDEN (JWT payload'ından) okunuyor — bu, Spatius
// sunucusunun API Key'e göre belirlediği TEK doğru kaynak; elle
// kopyalanan/yanlış yazılabilecek bir secret'a bağımlılığı tamamen ortadan
// kaldırıyor. env.SPATIUS_APP_ID sadece decode başarısız olursa yedek.

// DORDUNCU EKLENTI (2026-08-25) - /tts route'u: "konusma testlerini
// tamamla" istegi uzerine arastirildi. Spatius KENDI TTS'ini calistirmiyor
// (yukaridaki mimari not), yani Turkce'nin akici/insansi cikmasi TAMAMEN
// bizim sectigimiz TTS saglayicisina bagli. Repodaki tek ses-buffer ureten
// secenek (chatterbox) kullanicinin kendi GPU sunucusunu gerektiriyor -
// hic kurulmadi (docs/SELF_HOSTED_DEPLOYMENT.md). Denenenler:
//   - ElevenLabs: kart istemiyor AMA free tier ticari kullanim YASAK -
//     elendi.
//   - Google Cloud TTS / Azure Speech: ikisi de free tier icin gercek bir
//     fatura hesabi (genelde kart dogrulamali) istiyor - "asla kart
//     ekleme" kuraliyla celisiyor - elendi.
//   - StreamElements'in eski ucretsiz TTS endpoint'i (topluluk arasinda
//     yillardir bilinen bir "trick"): CANLI test edildi - ARTIK
//     CALISMIYOR, "401 Unauthorized - No API key was found" donuyor.
//   - Google Translate'in dokumante edilmemis "translate_tts" endpoint'i
//     (client=tw-ob varyanti - gTTS gibi acik kaynak kutuphanelerin de
//     kullandigi, token gerektirmeyen varyant): CANLI test edildi, GERCEK
//     Turkce ses (mp3) dondurdugu dogrulandi. Kart yok, kayit yok, API key
//     yok. Resmi bir SLA'si YOK ve herhangi bir an degisebilir/
//     engellenebilir - bu risk google-translate-tts-provider.js'te acikca
//     belirtiliyor. Tarayicidan dogrudan fetch CORS/CSP tarafindan
//     engellendigi icin, bu worker uzerinden proxy'leniyor - tipki /session
//     gibi.
//
// BESINCI EKLENTI (Faz 2, VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md) —
// abuse-koruma katmani: bu worker'in ilk halinde /session tamamen acikti —
// herhangi bir istemci (bir tarayici bile gerekmeden, dogrudan bir script)
// sinirsizca POST atip her seferinde GERCEK bir Spatius session token'i
// (dolayisiyla gercek kota/kredi) tuketebiliyordu; /tts de metni GET query
// string'inde tasiyordu (proxy/erisim loglarina sizabilir). Eklenenler:
//   - IP-bazli gercek rate limiting (Cloudflare'in native Workers Rate
//     Limiting binding'i — wrangler.toml'daki [[ratelimits]], resmi
//     dokumantasyondan doğrulandi, tahmin edilmedi).
//   - Kisa omurlu imzali "visitor token" (bkz. visitor-token.js) — /session
//     ve /tts artik bunu Authorization: Bearer basligi olarak zorunlu
//     kosuyor. Token SADECE /visitor-token'dan alinabiliyor; o route da
//     ayri/daha siki bir rate limit'e ve izinli origin kontrolune tabi.
//     NOT (durustce kayitli): Turnstile entegrasyonu bu turda YAPILMADI —
//     gercek bir Turnstile site key/secret bu sandbox'ta yok ve test
//     edilemeyen bir istemci-tarafi widget'i "calisiyor" diye sunmak
//     yaniltici olurdu. Bu, gercek bir bilinen eksik: rate limit + imzali
//     token, otomatik/betik tabanli suistimali zorlastirir ama insan
//     dogrulamasi saglamaz. Turnstile site key saglandiginda /visitor-token
//     buraya eklenmeye hazir sekilde tasarlandi (bkz. asagidaki yorum).
//   - /tts artik yalnizca POST + application/json body kabul ediyor (GET
//     query string kaldirildi); body boyutu, metin uzunlugu ve dil kodu
//     formati dogrulaniyor.
//   - Upstream cagrilar (Spatius + Google Translate) artik bir timeout ile
//     sariliyor (AbortSignal.timeout) — donmus bir upstream, bu isolate'i
//     sonsuza kadar bekletmesin diye.
//   - /session upstream hata govdesi (detail) artik istemciye HIC
//     dondurulmuyor — hicbir client-tarafi kod bunu okumuyordu zaten (bkz.
//     agent-core/avatar-providers/spatius-avatar-provider.js._fetchSessionToken),
//     ama yine de upstream'in ham hata metnini sizdirmamak icin kaldirildi.
//   - Butun yanitlara Cache-Control: no-store eklendi.
//   - Basit bir kota circuit-breaker: upstream bir kota/odeme hatasi
//     dondurdugunde, bu isolate SADECE bir sure (QUOTA_BREAKER_MS) boyunca
//     upstream'e HIC istek atmadan ayni hatayi dondurur. Bu koruma yalnizca
//     TEK bir isolate omru icinde gecerlidir (Workers cok sayida isolate'te
//     calisabilir) — global/kesin bir devre kesici degil, ama gercek ve
//     olcelebilir bir iyilestirme.
const UPSTREAM_URL = 'https://console.us-west.spatius.ai/v1/console/session-tokens';
const TTS_UPSTREAM_URL = 'https://translate.google.com/translate_tts';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Google'in bu dokumante edilmemis endpoint'i, tek istekte ~200 karakterden
// uzun metinlerde kesiliyor/hata veriyor gozlemlendi (topluluk raporlari) -
// bu yuzden istemci tarafi (google-translate-tts-provider.js) metni cumle
// sinirlarinda parcalayip bu route'a birden fazla kez istek atiyor.
const TTS_MAX_CHARS = 200;
const TTS_MAX_BODY_BYTES = 4096;
const VISITOR_TOKEN_TTL_SECONDS = 20 * 60; // tek bir gorusme oturumu icin makul ust sinir
const UPSTREAM_TIMEOUT_MS = 10_000;
const QUOTA_BREAKER_MS = 5 * 60 * 1000;

const ALLOWED_ORIGINS = new Set([
  'https://veraliq.com',
  'https://www.veraliq.com',
]);

// Isolate-scoped (bkz. yukaridaki "BESINCI EKLENTI" notu) — bir sonraki
// upstream kota hatasina kadar bu zaman damgasindan once /session upstream'e
// hic gitmez.
let quotaTrippedUntil = 0;

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

function looksLikeQuotaError(status, bodyText) {
  if (status === 402 || status === 403) return true;
  const lower = (bodyText || '').toLowerCase();
  return lower.includes('quota') || lower.includes('upgrade') || lower.includes('insufficient credits');
}

async function checkRateLimit(binding, key) {
  // Bir rate-limit binding'i wrangler.toml'da tanimlanmamis/eksikse (ör.
  // henuz deploy edilmemis yerel gelistirme), ACIK basarisiz olmak yerine
  // (rate limit yokmus gibi davranip istegi gecirmek) KAPALI basarisiz
  // oluyoruz — bu, "korumasiz calisiyor ama korumali gorunuyor" durumunu
  // engeller.
  if (!binding || typeof binding.limit !== 'function') return { success: false, configured: false };
  try {
    const { success } = await binding.limit({ key });
    return { success, configured: true };
  } catch (e) {
    return { success: false, configured: true };
  }
}

// Session token'ın (JWT) imzasını DOĞRULAMAZ — sadece payload'daki app_id
// claim'ini okur (görüntüleme/eşleştirme amaçlı, bir yetkilendirme kontrolü
// değil; gerçek yetkilendirme zaten Spatius'un kendi Motion Server'ında
// oluyor). atob() Cloudflare Workers runtime'ında global olarak mevcut.
function decodeJwtAppId(jwt) {
  try {
    const payloadB64Url = jwt.split('.')[1];
    const payloadB64 = payloadB64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payloadB64);
    const payload = JSON.parse(json);
    return payload.app_id || null;
  } catch (e) {
    return null;
  }
}

export function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://veraliq.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
    // Bu endpoint'lerin hicbir yaniti (session token, TTS sesi, hata mesaji
    // dahil) herhangi bir ara katmanda/tarayicida onbelleklenmemeli.
    'Cache-Control': 'no-store',
  };
}

function jsonError(headers, status, error, extra) {
  return new Response(
    JSON.stringify({ error, ...(extra || {}) }),
    { status, headers: { ...headers, 'Content-Type': 'application/json' } }
  );
}

/**
 * /session ve /tts icin ortak visitor-token dogrulamasi. Basarili olursa
 * null, basarisizsa dogrudan donulecek bir Response nesnesi verir.
 */
async function requireVisitorToken(request, env, headers) {
  if (!env.VISITOR_TOKEN_SECRET) {
    return jsonError(headers, 500, 'server_not_configured');
  }
  const authHeader = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return jsonError(headers, 401, 'visitor_token_required');
  const result = await verifyVisitorToken(env.VISITOR_TOKEN_SECRET, match[1]);
  if (!result.valid) return jsonError(headers, 401, 'visitor_token_invalid', { reason: result.reason });
  return null;
}

// Route handlers are exported individually (not just the default fetch
// dispatcher) so worker-spatius/test/session-worker.test.mjs can call each
// one directly with a mocked `env`/`fetch`/rate-limit binding — no Workers
// runtime (miniflare/wrangler) required, matching this repo's existing
// dependency-free node:sqlite-shim testing style for worker-portal.

/**
 * POST /visitor-token — the ONLY way to obtain the token /session and /tts
 * require. Gated by: same-set-of-allowed-origins (existing ALLOWED_ORIGINS)
 * and a strict per-IP rate limit. Turnstile verification runs when
 * TURNSTILE_SECRET_KEY is configured; see the "BESINCI EKLENTI" note above
 * this file for why it isn't required yet in this environment.
 */
export async function handleVisitorToken(request, env, headers) {
  if (!ALLOWED_ORIGINS.has(request.headers.get('Origin') || '')) {
    return jsonError(headers, 403, 'origin_not_allowed');
  }
  if (!env.VISITOR_TOKEN_SECRET) {
    return jsonError(headers, 500, 'server_not_configured');
  }

  const rate = await checkRateLimit(env.VISITOR_TOKEN_RATE_LIMITER, getClientIp(request));
  if (!rate.success) return jsonError(headers, 429, 'rate_limited');

  if (env.TURNSTILE_SECRET_KEY) {
    let body;
    try { body = await request.json(); } catch (e) { body = null; }
    const turnstileToken = body && body.turnstileToken;
    if (!turnstileToken || typeof turnstileToken !== 'string') {
      return jsonError(headers, 400, 'turnstile_token_required');
    }
    let verifyResp;
    try {
      verifyResp = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: turnstileToken, remoteip: getClientIp(request) }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (e) {
      return jsonError(headers, 502, 'turnstile_unreachable');
    }
    const verifyData = await verifyResp.json().catch(() => ({}));
    if (!verifyResp.ok || !verifyData.success) {
      return jsonError(headers, 403, 'turnstile_failed');
    }
  }

  const { token, expiresAt } = await signVisitorToken(env.VISITOR_TOKEN_SECRET, VISITOR_TOKEN_TTL_SECONDS);
  return new Response(
    JSON.stringify({ visitorToken: token, expiresAt }),
    { headers: { ...headers, 'Content-Type': 'application/json' } }
  );
}

/** POST /session — requires a valid visitor token; rate limited; masks upstream error detail. */
export async function handleSession(request, env, headers) {
  const tokenError = await requireVisitorToken(request, env, headers);
  if (tokenError) return tokenError;

  if (!env.SPATIUS_APP_ID || !env.SPATIUS_API_KEY) {
    return jsonError(headers, 500, 'server_not_configured');
  }

  const rate = await checkRateLimit(env.SESSION_RATE_LIMITER, getClientIp(request));
  if (!rate.success) return jsonError(headers, 429, 'rate_limited');

  if (Date.now() < quotaTrippedUntil) {
    return jsonError(headers, 502, 'session_token_failed', { quota_exhausted: true });
  }

  let upstreamResp;
  try {
    upstreamResp = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // .trim(): terminal/shell'den secret girerken kazara eklenen
        // baştaki/sondaki boşluk veya satır sonu karakterlerine karşı.
        'X-API-Key': env.SPATIUS_API_KEY.trim(),
      },
      // expireAt: kısa ömürlü tut (brief + Spatius docs: "Keep Session
      // Tokens short-lived and issue a fresh token for each new
      // connection"). 5 dakika bir konuşma başlatmak için yeterli.
      // ÖNEMLİ: Spatius SANİYE cinsinden Unix timestamp bekliyor —
      // Date.now() milisaniye döndürür, bu yüzden 1000'e bölünüyor.
      body: JSON.stringify({ expireAt: Math.floor(Date.now() / 1000) + 5 * 60 }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    return jsonError(headers, 502, 'upstream_unreachable');
  }

  if (!upstreamResp.ok) {
    const detail = await upstreamResp.text().catch(() => '');
    if (looksLikeQuotaError(upstreamResp.status, detail)) {
      quotaTrippedUntil = Date.now() + QUOTA_BREAKER_MS;
    }
    // Faz 2: upstream'in ham hata govdesi (detail) artik istemciye HIC
    // dondurulmuyor — hicbir client-tarafi kod onu okumuyordu (bkz.
    // agent-core/avatar-providers/spatius-avatar-provider.js._fetchSessionToken,
    // sadece HTTP status koduna bakiyor), ama upstream'in ham metnini
    // sizdirmamak yine de dogru olan.
    return jsonError(headers, 502, 'session_token_failed', { status: upstreamResp.status });
  }

  const data = await upstreamResp.json();
  // data.sessionToken: docs.spatius.ai/api-reference/api-reference.md ile
  // doğrulandı — Spatius yanıtı bu alanı "sessionToken" adıyla döndürüyor.
  //
  // appId: elle girilen env.SPATIUS_APP_ID YERİNE, session token'ın
  // kendi JWT payload'ındaki "app_id" claim'i kullanılıyor — bkz.
  // yukarıdaki "ÜÇÜNCÜ BUG" notu. Bu, "App ID mismatch" hatasını kökten
  // çözüyor çünkü AvatarSDK.initialize()'a artık HER ZAMAN token'la
  // eşleşen doğru değer gidiyor.
  const jwtAppId = decodeJwtAppId(data.sessionToken);
  return new Response(
    JSON.stringify({ sessionToken: data.sessionToken, appId: jwtAppId || env.SPATIUS_APP_ID.trim() }),
    { headers: { ...headers, 'Content-Type': 'application/json' } }
  );
}

const LANG_CODE_RE = /^[a-z]{2}(-[A-Za-z]{2,8})?$/;

/** POST /tts — JSON body (not GET query — text must not leak into logs/caches); requires a valid visitor token. */
export async function handleTts(request, env, headers) {
  const tokenError = await requireVisitorToken(request, env, headers);
  if (tokenError) return tokenError;

  const rate = await checkRateLimit(env.TTS_RATE_LIMITER, getClientIp(request));
  if (!rate.success) return jsonError(headers, 429, 'rate_limited');

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonError(headers, 415, 'unsupported_content_type');
  }

  // Faz 2 review fix: Content-Length is client-supplied and can be omitted
  // or understated — checking it alone doesn't bound anything. Read the
  // actual body text and check ITS length before parsing.
  let rawBody;
  try { rawBody = await request.text(); } catch (e) { return jsonError(headers, 400, 'invalid_json'); }
  if (rawBody.length > TTS_MAX_BODY_BYTES) {
    return jsonError(headers, 413, 'body_too_large');
  }

  let body;
  try { body = JSON.parse(rawBody); } catch (e) { return jsonError(headers, 400, 'invalid_json'); }

  const text = typeof (body && body.text) === 'string' ? body.text.trim() : '';
  if (!text) return jsonError(headers, 400, 'missing_text');
  if (text.length > TTS_MAX_CHARS) return jsonError(headers, 400, 'text_too_long');

  const lang = typeof (body && body.lang) === 'string' ? body.lang : 'tr';
  if (!LANG_CODE_RE.test(lang)) return jsonError(headers, 400, 'invalid_lang');

  const upstream = new URL(TTS_UPSTREAM_URL);
  upstream.searchParams.set('ie', 'UTF-8');
  upstream.searchParams.set('q', text);
  upstream.searchParams.set('tl', lang);
  upstream.searchParams.set('client', 'tw-ob');

  let ttsResp;
  try {
    ttsResp = await fetch(upstream.toString(), {
      headers: {
        // Google'in bu dokumante edilmemis endpoint'i bot gibi gorunen
        // isteklere karsi hassas olabiliyor - gercekci bir tarayici
        // User-Agent/Referer ile istek atiliyor (Worker sunucu-tarafinda
        // calistigi icin bunu tarayici CORS kurallarindan bagimsiz
        // serbestce ayarlayabiliyoruz).
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    return jsonError(headers, 502, 'tts_upstream_unreachable');
  }

  if (!ttsResp.ok) {
    return jsonError(headers, 502, 'tts_upstream_failed', { status: ttsResp.status });
  }

  // Ses baytlarini oldugu gibi (streaming) geri veriyoruz - hicbir sekilde
  // bu Worker'da saklanmiyor/loglanmiyor.
  return new Response(ttsResp.body, {
    headers: { ...headers, 'Content-Type': ttsResp.headers.get('content-type') || 'audio/mpeg' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    if (url.pathname === '/visitor-token' && request.method === 'POST') {
      return handleVisitorToken(request, env, headers);
    }
    if (url.pathname === '/session' && request.method === 'POST') {
      return handleSession(request, env, headers);
    }
    if (url.pathname === '/tts' && request.method === 'POST') {
      return handleTts(request, env, headers);
    }
    return new Response('Not found', { status: 404, headers });
  },
};
