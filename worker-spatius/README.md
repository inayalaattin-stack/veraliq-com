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
- ⏳ Clara'nın (Elif Kaya için kullanılacak) avatar-id'si: **alındı** —
  `c7069121-8245-4015-9940-82d0dc0c6bda` (bkz.
  `agent-core/avatar-providers/spatius-avatar-provider.js`).
- ⏳ Sıradaki adım: `spatius-avatar-provider.js`'in gerçek
  `@spatius/avatarkit` SDK'sıyla tarayıcıda uçtan uca test edilmesi
  (DOM mount şekli, `AvatarSDK.initialize()` imzası ve PCM16 chunk'lama
  hâlâ doğrulanmadı — dosyanın başındaki not'a bakın).

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

## Bu worker upstream endpoint'i doğru mu?

`session-worker.js` içindeki `UPSTREAM_URL` şu an docs.spatius.ai'nin genel
"Session Token" akış açıklamasına dayanan **en iyi tahmin**dir — Spatius'un
tam API referans sayfası (`api-reference/api-reference.md`) yalnızca özet
metin olarak okunabildi, gerçek endpoint path'i teyit edilemedi. Hesap
açıldıktan sonra Spatius Studio'daki "API Reference" sekmesinden (genelde
gerçek hesaba özel, interaktif bir referans sayfası olur) bu URL'i teyit
edip gerekirse düzeltmemiz gerekecek.
