# VERALIQ — Güvenlik

_Gerçek, mevcut durumu anlatır. Test edilmiş iddialar "✅ TEST EDİLDİ" ile, henüz test edilmemiş/eksik olanlar "⚠️ EKSİK" ile işaretlenmiştir._

## Kimlik doğrulama

- Parolalar PBKDF2-SHA256, 100.000 iterasyon (Web Crypto), düz metin ASLA saklanmıyor. ✅ TEST EDİLDİ (`worker-portal/test/`).
- JWT, HMAC-SHA256 ile imzalanıyor (`auth.js`), harici bir kütüphane yok. Secret Cloudflare'da (`env.JWT_SECRET`), frontend'de değil.
- Rol tabanlı erişim (RBAC): `veraliq_admin` / `company_owner` / `company_staff`. Her route `requireAuth(request, env, allowedRoles)` ile korunuyor. ✅ TEST EDİLDİ (401/403 senaryoları).

## Multi-tenant izolasyon

Her sorgu, JWT içindeki `company_id` ile sunucu tarafında zorunlu kılınıyor — istemcinin gönderdiği hiçbir `company_id` parametresine güvenilmiyor. ✅ TEST EDİLDİ: iki farklı şirket (ABC/XYZ) birbirinin proje/birim/takım verisini göremiyor, cross-tenant doğrudan-id erişimi 403 dönüyor.

## Zero Trust AI

Hiçbir LLM/AI ajanı veritabanına doğrudan erişemiyor veya SQL üretmiyor. Üç "beyin" de (FaqSalesBrainProvider, AdminAssistantBrainProvider, CompanyAssistantBrainProvider) yalnızca sabit, deterministik, parametreli sorgu fonksiyonlarını çağırıyor. `LLMProvider.respond()`'ın `intent` alanı hiçbir zaman doğrudan çalıştırılmıyor — kritik iş kuralı/yetkilendirme motoru (madde 35-36: IBAN değiştirme, fiyat politikası, indirim tanımlama gibi işlemler için) bu repo'da henüz YOK çünkü LLM'e zaten böyle bir eylem yetkisi verilmedi (yapacak bir şey olmadığı için ayrı bir "business rules engine" gerekmiyor — ileride LLM'e state-changing bir eylem yetkisi verilirse ZORUNLU olarak eklenmeli).

## ⚠️ Henüz yapılmamış / genişletilmemiş güvenlik testleri

- SQL injection: kod TÜM sorgularda parametreli `.bind()` kullanıyor (string interpolation ile SQL kurulmuyor) — yapısal olarak korunmuş durumda, ama bunu doğrulayan AYRI bir otomatik test (kötü niyetli input ile) henüz yazılmadı.
- XSS: frontend'de kullanıcı girdisi render edilirken `esc()` fonksiyonu (HTML-escape) kullanılıyor — ama tüm render noktalarını tarayan sistematik bir test yok.
- CSRF: JWT `Authorization` header'ında taşınıyor (cookie DEĞİL), bu CSRF riskini yapısal olarak büyük ölçüde azaltıyor (tarayıcı bir isteğe otomatik JWT header eklemiyor) — ama explicit bir CSRF testi yazılmadı.
- Prompt injection: müşteri/şirket girdisi hiçbir zaman bir LLM'in "sistem talimatı" olarak yorumlanmıyor (deterministik regex-eşleştirme kullanılıyor, gerçek bir LLM API'sine promptun bir parçası olarak enjekte edilmiyor) — `faq`/`adminAssistant`/`companyAssistant` sağlayıcılarının hiçbiri gerçek bir LLM API'si çağırmıyor, bu yüzden klasik "prompt injection" saldırı yüzeyi bu üç sağlayıcı için yapısal olarak yok. `openai-provider.js`/`anthropic-provider.js` (kullanılmıyor, kod içinde hazır) gerçek bir LLM API'sine bağlanıyor — bunlar aktif edilirse ayrı bir girdi-sanitizasyon/sistem-promptu-izolasyonu incelemesi GEREKİR.
- Rate limiting: uygulama kodunda YOK — Cloudflare hesap seviyesinde (WAF/Rate Limiting Rules) yapılandırılmalı.
- MFA: YOK. Admin girişi yalnızca email+şifre.
- Session hijacking / token çalınması: JWT `sessionStorage`'da tutuluyor (tarayıcı sekmesi kapanınca silinir, `localStorage`'dan daha kısa ömürlü) — bir XSS açığı JWT'yi çalabilir (bu yüzden yukarıdaki XSS test eksikliği önemli).

## Cloudflare hesap seviyesinde olması gereken, uygulama kodunun kapsamı DIŞINDA kalan önlemler

MFA (Cloudflare Zero Trust ile), WAF kuralları, IP bazlı erişim kısıtlaması, DDoS koruması — bunlar `admin.html`'den veya bu koddan yönetilemez, Cloudflare Dashboard'dan yapılandırılmalıdır.

## Secret yönetimi

`JWT_SECRET` ve `AGENT_SHARED_SECRET` yalnızca Cloudflare Worker secret olarak saklanıyor (`wrangler secret put`), hiçbir zaman kaynak koduna veya frontend'e yazılmıyor. Git repo'sunda `.env` veya benzeri bir dosya YOK — secret'lar yalnızca kullanıcının kendi terminalinden, tek seferlik olarak girildi.
