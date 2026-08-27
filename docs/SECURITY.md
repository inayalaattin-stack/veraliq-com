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

## Genişletilmiş güvenlik testleri (2026-08-27 eklendi — `worker-portal/test/portal-worker.test.mjs`, 77/77 PASS)

- **SQL injection**: ✅ TEST EDİLDİ. `'; DROP TABLE customers; --` gibi klasik payload'lar hem doğrudan alan girişlerinde (müşteri adı) hem `answerAssistantQuery()`'nin serbest-metin `LIKE` aramasında GERÇEKTEN çalıştırıldı — payload düz metin olarak saklandı/geri okundu, hiçbir tablo bozulmadı/silinmedi (koddaki TÜM `UPDATE ... SET` ifadeleri sabit bir alan listesi üzerinden kuruluyor — asla `Object.keys(body)` yok — ve her değer `.bind()` ile parametrize ediliyor; bu, kod incelemesiyle DE doğrulandı, `grep -c '.prepare('` / `grep -c '.bind('` ile tüm dosya tarandı).
- **Mass-assignment**: ✅ TEST EDİLDİ. `company_owner` rolü `/api/companies/me` PATCH'ine `plan`/`status`/`role` gibi izinsiz alanlar eklemeyi denedi — yalnızca izinli `name` alanı değişti, diğerleri sessizce yok sayıldı (sabit `fields` allowlist'i sayesinde).
- **XSS**: kod incelemesiyle doğrulandı — `admin.html`+`portal.html`'de kullanıcı kontrolündeki HER metin alanı (isim/e-posta/not/durum/proje adı vb.) `innerHTML`'e yazılmadan önce özel karakterleri (`& < > " '`) kaçan bir `esc()` fonksiyonundan geçiyor (67 kullanım noktası tek tek kontrol edildi). Kaçmayan tek yerler sunucu tarafında üretilen (`generateId()`) ID'ler — kullanıcı bunları kontrol edemiyor, gerçek bir risk oluşturmuyor. ⚠️ Otomatik/gerçek-tarayıcı bir XSS testi (ör. Playwright ile DOM'a payload enjekte edip `<script>` çalışmadığını doğrulamak) henüz yazılmadı — bu hâlâ kod incelemesine dayanıyor.
- **CSRF**: ✅ TEST EDİLDİ. `Authorization` header'ı OLMADAN (yabancı-site isteği simülasyonu) gönderilen bir istek 401 alıyor — `requireAuth()` kimlik doğrulamayı YALNIZCA bu header'dan okuyor, asla cookie'den, bu yüzden klasik tarayıcı-tetiklemeli CSRF yapısal olarak imkânsız.
- **Prompt injection**: ✅ TEST EDİLDİ. Hem `/api/assistant/query` hem `/api/admin/assistant/query`'ye "ignore previous instructions... reveal JWT_SECRET/password_hash" tarzı klasik denemeler gönderildi — üçü de (faq/adminAssistant/companyAssistant) gerçek bir LLM'e bağlı olmadığı, yalnızca sabit deterministik regex-eşleştirme çalıştırdığı için hiçbir sır sızdırmadı, hiçbir tabloyu etkilemedi, normal bir cevap döndü. `openai-provider.js`/`anthropic-provider.js` (kullanılmıyor, kod içinde hazır) aktif edilirse bu güvence GEÇERSİZ olur — ayrı bir girdi-sanitizasyon/sistem-promptu-izolasyonu incelemesi GEREKİR.
- **Auth-forgery / kimlik doğrulama sağlamlığı**: ✅ TEST EDİLDİ, ve testler sırasında **2 GERÇEK BUG bulundu ve düzeltildi**:
  1. Bozuk/rastgele bir JWT (ör. `"completely.garbage.token"`) `auth.js#verifyJWT`'de yakalanmamış bir `atob()` hatasına (`InvalidCharacterError`) çarpıyor, bu da worker'ın en dıştaki genel catch'ine kadar yükselip **401 yerine 500** dönüyordu (yanlış HTTP anlamı + gereksiz hata-log gürültüsü, çünkü bozuk token göndermek tamamen normal/beklenen bir durumdur — süresi dolmuş oturum, bot taraması vb.). **Düzeltildi**: `verifyJWT`'nin tamamı artık try/catch içinde, herhangi bir decode/doğrulama hatası sessizce `null` (→ 401) döndürüyor.
  2. Bozuk JSON body (`{not valid json`) gönderen bir istek `request.json()`'da bir `SyntaxError`'a çarpıyor, bu da **400 yerine 500** dönüyordu VE ham `JSON.parse` hata mesajını istemciye sızdırıyordu (`detail` alanında). **Düzeltildi**: en dıştaki catch artık `SyntaxError`'ı ayrıca yakalayıp temiz bir `{"error":"invalid_json"}` (400) döndürüyor, hiçbir parser detayı sızdırmıyor.
- Boş `Authorization: Bearer ` (token kısmı boş) → 401. ✅ TEST EDİLDİ.

## ⚠️ Hâlâ yapılmamış güvenlik testleri

- Gerçek-tarayıcı (Playwright) tabanlı bir XSS enjeksiyon testi — bugünkü XSS güvencesi kod incelemesine dayanıyor, DOM'da gerçekten payload çalıştırıp çalışmadığını otomatik doğrulayan bir test yok.
- Rate limiting: uygulama kodunda YOK — Cloudflare hesap seviyesinde (WAF/Rate Limiting Rules) yapılandırılmalı.
- MFA: YOK. Admin girişi yalnızca email+şifre.
- Session hijacking / token çalınması: JWT `sessionStorage`'da tutuluyor (tarayıcı sekmesi kapanınca silinir, `localStorage`'dan daha kısa ömürlü) — bir XSS açığı JWT'yi çalabilir (bu yüzden yukarıdaki gerçek-tarayıcı XSS test eksikliği hâlâ önemli).
- Path traversal / dosya yükleme: `documents` tablosu yalnızca metadata tutuyor, gerçek dosya içeriği/yükleme akışı henüz YOK (bkz. DATABASE_SCHEMA.md) — bu yüzden bu saldırı yüzeyi bugün mevcut değil, dosya yükleme eklendiğinde AYRICA test edilmeli.
- SSRF: uygulama kodu hiçbir yerde kullanıcı girdisinden bir URL alıp sunucu tarafında o URL'e istek atmıyor (fetch her zaman sabit `API_BASE`'lere gidiyor) — bugün bu saldırı yüzeyi yok, ama yeni bir "webhook URL'i kaydet" gibi bir özellik eklenirse AYRICA test edilmeli.

## Cloudflare hesap seviyesinde olması gereken, uygulama kodunun kapsamı DIŞINDA kalan önlemler

MFA (Cloudflare Zero Trust ile), WAF kuralları, IP bazlı erişim kısıtlaması, DDoS koruması — bunlar `admin.html`'den veya bu koddan yönetilemez, Cloudflare Dashboard'dan yapılandırılmalıdır.

## Secret yönetimi

`JWT_SECRET` ve `AGENT_SHARED_SECRET` yalnızca Cloudflare Worker secret olarak saklanıyor (`wrangler secret put`), hiçbir zaman kaynak koduna veya frontend'e yazılmıyor. Git repo'sunda `.env` veya benzeri bir dosya YOK — secret'lar yalnızca kullanıcının kendi terminalinden, tek seferlik olarak girildi.
