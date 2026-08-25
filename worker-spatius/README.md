# worker-spatius — Spatius Session Token servisi

Bu klasör, VERALIQ'in Ücretsiz Avatar Havuzu'ndaki ilk sağlayıcı olan
**Spatius**'un API key'ini tarayıcıdan gizleyen, tek işlevli bir Cloudflare
Worker'dır. `worker/` klasöründeki canlı Anam worker'ına **hiç dokunmaz** —
tamamen ayrı bir Cloudflare Worker olarak deploy edilir.

## Neden gerekli?

Spatius'un kendi dokümantasyonu açıkça uyarıyor: *"Call the Spatius API from
your backend only. Never embed the API key in client-side code."* Bu worker
o "backend" görevini görür.

## Deploy adımları (İmparator'ın kendi Cloudflare hesabından yapması gerekir
— Claude bu adımı sizin adınıza yapamaz, çünkü hesap/kimlik bilgisi işlemleri
bu oturumun güvenlik kurallarınca yasak)

0. **Ücretsiz Spatius hesabı 2026-08-25'te zaten açıldı** ✅ (kredi kartı
   girilmedi). Onaylanan avatar: **Clara** (Spatius'un kendi kütüphanesindeki
   vintage/kurumsal avatar — Halima değil, karar sonradan Clara olarak
   netleşti).
1. Spatius Studio'da bir "Application" oluşturun (yoksa varsayılan biri
   olabilir), **App ID** ve **API Key**'i not edin.
2. `app.spatius.ai/avatars/library` sayfasında **Clara**'yı bulun, kartından
   **avatar-id**'yi kopyalayın.
3. Bu klasörü (`worker-spatius/`) Cloudflare Workers'a deploy edin:
   ```
   npx wrangler deploy
   ```
   (ilk seferde `wrangler login` ile kendi Cloudflare hesabınıza giriş
   yapmanız istenecek — bu da sizin tarafınızdan yapılmalı.)
4. Secret'ları girin:
   ```
   npx wrangler secret put SPATIUS_APP_ID
   npx wrangler secret put SPATIUS_API_KEY
   ```
5. Deploy tamamlanınca Cloudflare size bir adres verecek, örn:
   `https://veraliq-spatius-session.<sizin-subdomain>.workers.dev`
6. Bu adresi ve 2. adımdaki Clara avatar-id'sini bana iletin — ben
   `agent-core/avatar-providers/spatius-avatar-provider.js` içindeki
   `SPATIUS_SESSION_ENDPOINT` ve `SPATIUS_AVATAR_ID` sabitlerini
   dolduracağım, gerçek `@spatius/avatarkit` demo koduyla karşılaştırıp
   doğrulayacağım ve yerel bir test ortamında deneyeceğim.
7. Ben test edip onayınıza sunmadan bu provider `agent-core/config.js`'te
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
