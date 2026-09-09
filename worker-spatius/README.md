# worker-spatius — Spatius Session Token servisi

Bu klasör, VERALIQ'in Ücretsiz Avatar Havuzu'ndaki ilk sağlayıcı olan
**Spatius**'un API key'ini tarayıcıdan gizleyen, tek işlevli bir Cloudflare
Worker'dır. `worker/` klasöründeki canlı Anam worker'ına **hiç dokunmaz** —
tamamen ayrı bir Cloudflare Worker olarak deploy edilir.

## Neden gerekli?

Spatius'un kendi dokümantasyonu açıkça uyarıyor: *"Call the Spatius API from
your backend only. Never embed the API key in client-side code."* Bu worker
o "backend" görevini görür.

## Durum (2026-08-25)

- ✅ Ücretsiz Spatius hesabı açıldı (kredi kartı girilmedi).
- ✅ Onaylanan avatar: Spatius kütüphanesindeki **"Clara"** — VERALIQ'in
  ortak persona adı ise **Elif Kaya** (mevcut canlı Anam entegrasyonuyla
  aynı isim, tutarlılık için — "Clara" sadece Spatius'un kendi katalog
  etiketi, kullanıcıya hiç gösterilmiyor).
- ✅ Worker deploy edildi: `https://veraliq-spatius-session.veraliq-com.workers.dev`
- ✅ Secret'lar (`SPATIUS_APP_ID` / `SPATIUS_API_KEY`) doğru şekilde
  yüklendi. Yol boyunca iki ayrı bug bulunup düzeltildi: (1) yanlış
  UPSTREAM_URL tahmini (DNS hatası), (2) `expireAt` alanı milisaniye
  olarak gönderiliyordu, Spatius saniye bekliyor — bu yüzden
  `"expire_at cannot be more than 24 hours in the future"` hatası
  alınıyordu. İkisi de `session-worker.js`'de düzeltildi.
- ✅ Session token akışı canlı test edildi ve **çalışıyor**:
  `POST /session` artık gerçek bir `sessionToken` + `appId` döndürüyor.
- ✅ Clara'nın (Elif Kaya için kullanılacak) doğru avatar-id'si bulundu ve
  düzeltildi — ilk denemede yanlışlıkla Halima'nın id'si girilmişti
  (`c7069121-...`), bu "App ID mismatch" hatasına yol açıyordu. Doğru id:
  `d51ab422-3db7-47cc-afa8-7273b02bc70b`.
- ✅ "App ID mismatch" hatası kökten çözüldü: worker artık `appId`'yi elle
  girilen secret yerine session token'ın kendi JWT payload'ından okuyor
  (`decodeJwtAppId`, bkz. `session-worker.js`).
- ✅ `spatius-avatar-provider.js` gerçek `@spatius/avatarkit` SDK'sıyla
  uçtan uca CANLI test edildi (`spatius-test.html`, Claude'un kendi Chrome
  oturumuyla otomatik test): Clara görseli doğru yükleniyor, bağlantı
  "connected" durumunda kalıyor, `controller.send()` ile ses gönderimi
  çalışıyor.
- ✅ `/tts` route'u eklendi: Türkçe konuşma testi için ücretsiz, kart/hesap
  gerektirmeyen bir bulut TTS'i (Google Translate'in dokümante edilmemiş
  `translate_tts` endpoint'i) proxy'liyor — bkz.
  `agent-core/tts-providers/google-translate-tts-provider.js` başındaki
  risk/sınır notları (resmi değil, ticari kullanım için lisanslanmamış,
  sadece doğrulama/köprü katmanı olarak düşünülmeli).
- ⏳ Sıradaki adım: `spatius-test.html`'deki "4) Türkçe Konuşma Testi"
  butonuyla üretilen sesin gerçekten akıcı/anlaşılır olup olmadığının
  İmparator tarafından dinlenerek onaylanması (ben bunu duyamıyorum) —
  sonrasında `config.js`'te `avatarProvider`/`ttsProvider` değişikliği için
  son onay bekleniyor (brief madde 17/19).

## Deploy adımları (İmparator'ın kendi Cloudflare hesabından yapması gerekir
— Claude bu adımı sizin adınıza yapamaz, çünkü hesap/kimlik bilgisi işlemleri
bu oturumun güvenlik kurallarınca yasak)

1. Spatius Studio'da bir "Application" oluşturun (yoksa varsayılan biri
   olabilir), **App ID** ve **API Key**'i not edin.
2. `app.spatius.ai/avatars/library` sayfasında **Clara**'yı bulun, kartından
   **avatar-id**'yi kopyalayın.
3. Bu klasörü (`worker-spatius/`) Cloudflare Workers'a deploy edin:
   ```
   npx wrangler deploy
   ```
4. Secret'ları girin (istem geldiğinde değeri gerçekten yapıştırdığınızdan
   emin olun — boş bırakıp Enter'a basmayın):
   ```
   npx wrangler secret put SPATIUS_APP_ID
   npx wrangler secret put SPATIUS_API_KEY
   ```
5. `npx wrangler deploy` ile yeniden deploy edin (secret'lar deploy'dan
   sonra eklendiyse bu adım gerekebilir).
6. Test edin:
   ```
   Invoke-WebRequest -Uri "https://veraliq-spatius-session.veraliq-com.workers.dev/session" -Method POST -Headers @{"Origin"="https://veraliq.com"} -ContentType "application/json" -Body "{}" | Select-Object -ExpandProperty Content
   ```
7. Test sonucunu ve 2. adımdaki Clara avatar-id'sini bana iletin — ben
   `agent-core/avatar-providers/spatius-avatar-provider.js` içindeki
   `SPATIUS_AVATAR_ID` sabitini dolduracağım, gerçek `@spatius/avatarkit`
   demo koduyla karşılaştırıp doğrulayacağım ve yerel bir test ortamında
   deneyeceğim.
8. Ben test edip onayınıza sunmadan bu provider `agent-core/config.js`'te
   varsayılan seçilmeyecek — site `anam` ile çalışmaya devam edecek
   (brief madde 17 ve 19).

## Faz 2 (VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md) — abuse koruması

İlk halinde `/session` tamamen açıktı: herhangi bir istemci sınırsızca POST
atıp gerçek bir Spatius session token'ı (dolayısıyla gerçek kota/kredi)
tüketebiliyordu; `/tts` de metni GET query string'inde taşıyordu. Eklenenler
(bkz. `session-worker.js`'nin kendi "BEŞİNCİ EKLENTİ" yorumu ve
`visitor-token.js`):

- **Gerçek IP-bazlı rate limiting** — Cloudflare'in native Workers Rate
  Limiting binding'i (`wrangler.toml`'daki `[[ratelimits]]`, resmi
  dokümantasyondan doğrulandı). `/visitor-token`, `/session`, `/tts` için
  ayrı ayrı limitler.
- **Kısa ömürlü imzalı "visitor token"** — `/session` ve `/tts` artık
  `Authorization: Bearer <token>` zorunlu kılıyor. Token SADECE
  `POST /visitor-token`'dan alınabiliyor.
- **`/tts` artık POST + `application/json` body** (GET query string
  kaldırıldı) — metin uzunluğu/dil kodu formatı/body boyutu doğrulanıyor.
- Upstream çağrılara timeout (`AbortSignal.timeout`), `/session`'ın upstream
  hata gövdesini istemciye hiç döndürmemesi, tüm yanıtlara
  `Cache-Control: no-store`, ve tek-isolate ömürlü basit bir kota
  circuit-breaker'ı eklendi.

**Bilerek eksik bırakılan (dürüstçe kayıtlı):** Turnstile insan doğrulaması
bu turda entegre EDİLMEDİ — bu sandbox'ta gerçek bir Turnstile site key/secret
yok, ve test edilemeyen bir istemci-tarafı widget'ı "çalışıyor" diye sunmak
yanıltıcı olurdu. `TURNSTILE_SECRET_KEY` secret'ı ayarlandığında
`/visitor-token` otomatik olarak gerçek bir Turnstile doğrulaması zorunlu
kılacak şekilde kodlandı (bkz. `session-worker.js`'deki `handleVisitorToken`)
— yalnızca gerçek bir site key/secret çifti sağlanması ve
`index.html`/`admin.html`/`portal.html`'a Turnstile widget'ının eklenmesi
gerekiyor. Bu, ayrı bir karar/kurulum maddesi olarak
`IMPLEMENTATION-BASELINE.md`'de kayıtlı.

**Deploy öncesi ek not:** `[[ratelimits]]` binding'i Wrangler 4.36+
gerektiriyor (resmi dokümantasyon) — `npx wrangler --version` ile kontrol
edin, gerekirse `npx wrangler@latest deploy` kullanın. Yeni secret:
`VISITOR_TOKEN_SECRET` (zorunlu — `npx wrangler secret put VISITOR_TOKEN_SECRET`),
`TURNSTILE_SECRET_KEY` (opsiyonel, yukarıya bakın).

**Test:** `test/session-worker.test.mjs` — gerçek Spatius/Google
Translate/Turnstile'a HİÇBİR istek atmadan (hepsi mock'lanmış `fetch`)
tüm route'ları ve hata yollarını doğrular:
```
cd worker-spatius/test && node session-worker.test.mjs
```

## Bu worker upstream endpoint'i doğru mu?

`session-worker.js` içindeki `UPSTREAM_URL` şu an docs.spatius.ai'nin genel
"Session Token" akış açıklamasına dayanan **en iyi tahmin**dir — Spatius'un
tam API referans sayfası (`api-reference/api-reference.md`) yalnızca özet
metin olarak okunabildi, gerçek endpoint path'i teyit edilemedi. Hesap
açıldıktan sonra Spatius Studio'daki "API Reference" sekmesinden (genelde
gerçek hesaba özel, interaktif bir referans sayfası olur) bu URL'i teyit
edip gerekirse düzeltmemiz gerekecek.
