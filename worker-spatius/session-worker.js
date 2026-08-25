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

const UPSTREAM_URL = 'https://console.us-west.spatius.ai/v1/console/session-tokens';

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
      // data.sessionToken: docs.spatius.ai/api-reference/api-reference.md ile
      // doğrulandı — Spatius yanıtı bu alanı "sessionToken" adıyla döndürüyor.
      // (Geçici "rawUpstream" teşhis alanı sorunun bulunmasından sonra
      // kaldırıldı — asıl sorun expireAt biriminin ms/sn karışıklığıydı.)
      return new Response(
        JSON.stringify({ sessionToken: data.sessionToken, appId: env.SPATIUS_APP_ID.trim() }),
        { headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Not found', { status: 404, headers });
  },
};
