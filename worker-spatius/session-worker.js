// worker-spatius/session-worker.js
//
// veraliq-spatius-session — minimal, single-purpose Cloudflare Worker.
//
// AYRI bir worker olarak tutuluyor (worker/session-worker.js'deki, hâlihazırda
// CANLI olan Anam worker'ına DOKUNULMADI — brief madde 17: mevcut çalışan
// sistemi bozma). Bunun tek işi: Spatius App ID / API Key'i (sunucu-tarafı
// secret olarak, SPATIUS_APP_ID / SPATIUS_API_KEY) kısa ömürlü bir Spatius
// Session Token'a çevirmek — böylece tarayıcı gerçek API key'i asla görmez
// (docs.spatius.ai/api-reference/authentication.md: "Call the Spatius API
// from your backend only. Never embed the API key in client-side code").
//
// DURUM (2026-08-25): Bu worker HENÜZ DEPLOY EDİLMEDİ. Deploy adımları için
// bu klasördeki README.md'ye bakın. Deploy edilene ve secret'lar girilene
// kadar SpatiusAvatarProvider hiçbir zaman gerçek bir bağlantı kuramaz —
// bu kasıtlı: kimse yanlışlıkla bu provider'ı canlıya alamaz.
//
// TODO (deploy sonrası doğrulanacak): Spatius'un gerçek Session Token
// endpoint URL'i ve request/response şekli docs.spatius.ai/api-reference/
// api-reference.md'de tam olarak belirtilmemişti (özet metin buraya kadarını
// doğrulayabildi) — aşağıdaki UPSTREAM_URL ve request body, dokümantasyonun
// "auth.md" sayfasındaki genel akıma göre EN İYİ TAHMİN'dir. Gerçek deploy
// öncesi Spatius Studio hesabı açıldığında bu worker'ı Spatius'un kendi
// "Session Token API" referans sayfasındaki tam örnekle karşılaştırıp
// düzeltin.

const UPSTREAM_URL = 'https://api.spatius.ai/v1/session-tokens'; // TODO: doğrula

const ALLOWED_ORIGINS = new Set([
  'https://veraliq.com',
  'https://www.veraliq.com',
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://veraliq.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    if (url.pathname === '/session' && request.method === 'POST') {
      if (!env.SPATIUS_APP_ID || !env.SPATIUS_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'server_not_configured' }),
          { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
      }

      let upstreamResp;
      try {
        upstreamResp = await fetch(UPSTREAM_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-App-ID': env.SPATIUS_APP_ID,
            'X-API-Key': env.SPATIUS_API_KEY,
          },
          // expireAt: kısa ömürlü tut (brief + Spatius docs: "Keep Session
          // Tokens short-lived and issue a fresh token for each new
          // connection"). 5 dakika bir konuşma başlatmak için yeterli.
          body: JSON.stringify({ expireAt: Date.now() + 5 * 60 * 1000 }),
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: 'upstream_unreachable' }),
          { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
      }

      if (!upstreamResp.ok) {
        const detail = await upstreamResp.text().catch(() => '');
        // Ödeme/quota ile ilgili bir upstream hatası (402/403 + "upgrade"/
        // "quota" içeren body) burada frontend'e olduğu gibi iletiliyor;
        // SpatiusAvatarProvider bunu free-tier-guard.js'e bildirip sıradaki
        // ücretsiz sağlayıcıya geçecek — bu worker hiçbir ödeme/upgrade
        // isteğini KENDİLİĞİNDEN tamamlamaz, sadece durumu raporlar.
        return new Response(
          JSON.stringify({ error: 'session_token_failed', status: upstreamResp.status, detail: detail.slice(0, 300) }),
          { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
      }

      const data = await upstreamResp.json();
      return new Response(
        JSON.stringify({ sessionToken: data.sessionToken, appId: env.SPATIUS_APP_ID }),
        { headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Not found', { status: 404, headers });
  },
};
