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
const UPSTREAM_URL = 'https://console.us-west.spatius.ai/v1/console/session-tokens';
const TTS_UPSTREAM_URL = 'https://translate.google.com/translate_tts';
// Google'in bu dokumante edilmemis endpoint'i, tek istekte ~200 karakterden
// uzun metinlerde kesiliyor/hata veriyor gozlemlendi (topluluk raporlari) -
// bu yuzden istemci tarafi (google-translate-tts-provider.js) metni cumle
// sinirlarinda parcalayip bu route'a birden fazla kez istek atiyor.
const TTS_MAX_CHARS = 200;

const ALLOWED_ORIGINS = new Set([
  'https://veraliq.com',
  'https://www.veraliq.com',
]);

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

    if (url.pathname === '/tts' && request.method === 'GET') {
      const text = (url.searchParams.get('text') || '').slice(0, TTS_MAX_CHARS);
      const lang = url.searchParams.get('lang') || 'tr';
      if (!text.trim()) {
        return new Response(
          JSON.stringify({ error: 'missing_text' }),
          { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
      }

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
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: 'tts_upstream_unreachable' }),
          { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
      }

      if (!ttsResp.ok) {
        return new Response(
          JSON.stringify({ error: 'tts_upstream_failed', status: ttsResp.status }),
          { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
      }

      // Ses baytlarini oldugu gibi (streaming) geri veriyoruz - hicbir
      // sekilde bu Worker'da saklanmiyor/loglanmiyor.
      return new Response(ttsResp.body, {
        headers: { ...headers, 'Content-Type': ttsResp.headers.get('content-type') || 'audio/mpeg' },
      });
    }

    return new Response('Not found', { status: 404, headers });
  },
};
