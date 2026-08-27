# VERALIQ Master Platform — Sistem Analizi, Mimari Haritalar ve 20 Fazlık Yol Haritası

**Tarih:** 2026-08-27
**Bağlam:** İmparator'un "Master Platform Geliştirme Promptu" (84 madde) talebi üzerine hazırlandı.
**Yöntem:** Prompt'un kendi 81. maddesindeki talimata uyuldu — önce mevcut sistem analiz edildi, sonra Architecture/Database/API/UI haritaları çıkarıldı, sonra Missing Features listelendi, ancak geliştirmeye ondan sonra başlandı.

---

## 0. Bu Dokümanın Dürüst Çerçevesi

84 maddelik prompt, gerçek bir mühendislik ekibinin **çeyrek yıllar** süren işini tarif ediyor: tam multi-tenant SaaS, gerçek zamanlı dağıtık kilitleme, CRM/ERP entegrasyonları, native mobil uygulama (biyometrik kimlik doğrulama, push bildirim, kamera OCR dahil), WhatsApp Business API, ödeme/sözleşme motorları, 3D sunum sağlayıcıları, event-driven mimari, RBAC/MFA/audit log ile tam güvenlik sertleştirmesi.

Bunu tek bir oturumda "production-ready" olarak iddia etmek — promptun kendi 83. maddesindeki "SADECE MOCKUP YAPMA, FAKE DATA KULLANMA" kuralını ihlal eder. Bu yüzden bu doküman iki şeyi net ayırıyor:

1. **Bu oturumda gerçekten inşa edilen** (gerçek veritabanı, gerçek backend, gerçek auth, gerçek race-condition korumalı envanter kilidi — çalışır, deploy edilebilir durumda).
2. **Sizin hesabınız/kararınız/üçüncü taraf servis aboneliği gerektiren** (WhatsApp Business API, ödeme sağlayıcı, CRM/ERP entegrasyonları, native mobil uygulama + app store hesapları, 3D/Cureviz sağlayıcı, e-imza) — bunlar için kod mimarisi hazırlandı (provider-agnostic arayüzler), ama gerçek bağlantı sizin sağlayacağınız API anahtarları/hesaplarla kurulacak.

Teknoloji değişikliği yapılmadı: mevcut Cloudflare Pages (statik site) + Cloudflare Workers mimarisi korundu. Yeni backend ihtiyacı için de aynı ekosistemin parçası olan **Cloudflare D1** (SQL veritabanı) ve **Durable Objects** (gerçek zamanlı kilitleme) kullanıldı — promptun 81. maddesindeki "gereksiz framework/database/teknoloji değişikliği yapma" kuralına uyulmuş oldu.

---

## 1. ARCHITECTURE MAP (Mevcut Sistem)

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE PAGES (statik site — veraliq.com)                        │
│  index.html, script.js, i18n.js (8 dil), admin.html, portal.html     │
│  assets/veraliq-mark.svg, kvkk.html, privacy.html, terms.html        │
└───────────────┬────────────────────────────────────────────────────┬─┘
                │                                                    │
                ▼                                                    ▼
┌───────────────────────────────────┐          ┌──────────────────────────────┐
│  agent-core/ (istemci taraflı JS)  │          │  worker-portal/ (YENİ, bu     │
│  ───────────────────────────────   │          │  oturumda eklendi)            │
│  widget.js  → UI state machine     │          │  D1 SQL veritabanı            │
│  orchestrator.js → STT→LLM→TTS→    │          │  Durable Object (presentation │
│    Avatar akışı, barge-in          │          │    lock)                      │
│  config.js → provider seçimi       │          │  JWT auth (admin + şirket)    │
│  providers.js → 4 soyut arayüz     │          │  Company/Project/Unit/        │
│    (Avatar/TTS/STT/LLM)            │          │    Lead/Approval/AuditLog CRUD│
│  avatar-providers/spatius-*.js     │          └──────────────────────────────┘
│  tts-providers/google-translate-*  │
│  llm-providers/faq-sales-brain-*   │          ┌──────────────────────────────┐
│  stt-providers/webspeech-*.js      │          │  worker-spatius/ (mevcut)      │
└─────────────────────────────────────┘          │  /session → Spatius session   │
                                                   │  /tts → Google Translate proxy│
┌───────────────────────────────────┐          └──────────────────────────────┘
│  worker/ (mevcut, CANLI — DOKUNULMADI)          ┌──────────────────────────────┐
│  Anam.ai session-worker (legacy    │          │  services/ (mevcut, deploy    │
│  avatar sağlayıcı, hâlâ kod olarak │          │  edilmemiş, self-host taslağı)│
│  duruyor ama config.js'de aktif    │          │  stt/ (Whisper, Docker)        │
│  değil — bkz. Bölüm 3)             │          │  tts/ (Chatterbox, Docker)     │
└───────────────────────────────────┘          │  avatar/ (README, henüz kod yok)│
                                                   └──────────────────────────────┘
```

**Kritik gözlem:** Bugüne kadar VERALIQ'in TAMAMI istemci taraflı (client-side) çalışıyordu — hiçbir gerçek veritabanı, hiçbir sunucu taraflı iş mantığı yoktu. `admin.html`/`portal.html` (bu sabah eklendi) tamamen `localStorage`'a yazıyordu — yani veriler tarayıcıya özeldi, cihazlar arası paylaşılmıyordu, gerçek bir kimlik doğrulama değildi. Bu, promptun 83. maddesindeki "FAKE DATA KULLANMA" kuralını ihlal ediyordu; bu oturumun ana işi bunu gerçek bir backend'e taşımak.

---

## 2. DATABASE MAP

### 2.1 Öncesi
Veritabanı YOKTU. `agent-core` state'i yalnızca bellekte (`AgentOrchestrator.history`) tutuluyordu, sayfa yenilenince kayboluyordu.

### 2.2 Bu oturumda eklenen (worker-portal/schema.sql — Cloudflare D1)

```
companies (id, name, slug, plan, status, created_at)
users (id, company_id NULL=admin, email, password_hash, role, name, created_at)
   role: 'veraliq_admin' | 'company_owner' | 'company_staff'
projects (id, company_id, name, location, description, delivery_date,
          lat, lng, ada, parsel, pafta, status, created_at, updated_at)
units (id, project_id, company_id, block, floor, unit_no, unit_type,
       gross_area, net_area, price, currency, status, assigned_agent_type,
       assigned_agent_id, presentation_session_id, hold_expires_at,
       reservation_expires_at, created_at, updated_at)
   status: AVAILABLE | PRESENTATION | HOLD | RESERVED | DEPOSIT_PAID | CONTRACT | SOLD
documents (id, company_id, project_id NULL, filename, file_type, category,
           r2_key, uploaded_by, version, created_at)
leads (id, company_id, project_id NULL, name, phone, email, budget,
       interest, source, assigned_to, assigned_type, status, notes,
       ai_summary, created_at, updated_at)
approval_requests (id, company_id, type, related_id, requested_by,
                    amount, status, approved_by, approved_at, created_at)
audit_log (id, company_id, user_id, action, entity_type, entity_id,
           old_value, new_value, ip, device, created_at)
```

Her tablo `company_id` taşır (Company A satırları Company B'nin sorgularında asla dönmez — API katmanında JWT'den gelen `company_id` her `WHERE` koşuluna otomatik eklenir; bkz. Bölüm 55/56 karşılığı, madde 4).

### 2.3 Henüz eklenmeyen (Faz 4+, gerçek doküman/CRM/ödeme verisi netleşince)
`brochures/asset` içerik dosyaları (bugün yalnızca metadata var, gerçek dosya = Cloudflare R2 gerektirir — R2 bucket'ı da sizin `wrangler r2 bucket create` ile açmanız gerekir), `contracts`, `payments`, `crm_sync_log`, `presentation_lock_history`.

---

## 3. API MAP

### 3.1 Öncesi
API yoktu. Yalnızca 2 stateless Worker vardı:
- `worker/session-worker.js` — Anam.ai session token üretimi (canlı ama config.js'de artık kullanılmıyor, dokunulmadı)
- `worker-spatius/session-worker.js` — `/session` (Spatius token), `/tts` (Google Translate proxy) — **`/tts` route'u deploy edilmemiş durumda, canlıda 404 veriyor (bu akşamki bilinen sorun, ayrı konu)**

### 3.2 Bu oturumda eklenen — `worker-portal/portal-api-worker.js`

| Endpoint | Metod | Açıklama | Yetki |
|---|---|---|---|
| `/api/auth/admin/login` | POST | VERALIQ admin girişi | herkes |
| `/api/auth/company/login` | POST | Şirket kullanıcı girişi | herkes |
| `/api/companies` | GET, POST | Şirket listele/oluştur | admin |
| `/api/companies/:id` | GET, PATCH, DELETE | Şirket detay/güncelle/sil | admin |
| `/api/projects` | GET, POST | Proje listele/oluştur (kendi şirketi) | company |
| `/api/projects/:id` | GET, PATCH, DELETE | Proje detay | company |
| `/api/projects/:id/units` | GET, POST | Envanter listele/toplu ekle | company |
| `/api/units/:id` | GET, PATCH | Birim güncelle | company |
| `/api/units/:id/lock` | POST | **Presentation lock al** (Durable Object) | company/agent |
| `/api/units/:id/unlock` | POST | Lock bırak | company/agent |
| `/api/units/:id/heartbeat` | POST | Lock süresini uzat | company/agent |
| `/api/leads` | GET, POST | Lead listele/oluştur | company |
| `/api/leads/:id` | GET, PATCH | Lead detay/güncelle | company |
| `/api/approvals` | GET, POST | Onay talebi listele/oluştur | company |
| `/api/approvals/:id/decide` | POST | Onayla/reddet | company_owner |
| `/api/audit-log` | GET | Denetim kaydı (salt okunur) | admin/owner |

Tüm `/api/*` (auth hariç) `Authorization: Bearer <JWT>` bekler; JWT içindeki `company_id` + `role` her sorguyu otomatik filtreler.

### 3.3 Henüz eklenmeyen (3. parti hesap gerektirir)
`/api/whatsapp/*` (Meta Business hesabı), `/api/payments/*` (iyzico/PayTR/Stripe hesabı), `/api/crm/*` (HubSpot/Salesforce/Zoho API anahtarı), `/api/contracts/*` (e-imza sağlayıcı hesabı — örn. Yousign/DocuSign), `/api/presentation-providers/*` (Cureviz/3D sağlayıcı hesabı).

---

## 4. UI MAP

| Ekran | Durum | Bu oturumda |
|---|---|---|
| Ana sayfa (index.html) | Var, canlı | Değişmedi (bugün sabah düzeltilen logo/footer/z-index hariç) |
| Müşteri AI Agent widget'ı | Var, canlı | Değişmedi (bugün sabah eklenen "Görüşmeye Katıl" + altyazı hariç) |
| Admin paneli (admin.html) | Bu sabah prototip (localStorage) | **Gerçek API'ye bağlandı** |
| Şirket portalı (portal.html) | Bu sabah prototip (localStorage) | **Gerçek API'ye bağlandı** |
| Company AI Assistant (yönetici sesli asistanı) | PRD'de tarif edilmiş (`exec-assistant/index.html` — repoda YOK) | Bu oturumda kapsam dışı, Faz 8 |
| Mobil uygulama | Hiç yok | Bu oturumda kapsam dışı, Faz 4 (ayrı proje) |
| Sunum modu (PDF/PPT/3D) | Yok | Faz 13 |
| Harita/lokasyon | Yok | Faz 9 (proje formuna lat/lng/ada/parsel alanları bu oturumda şemaya eklendi, harita UI'ı değil) |

---

## 5. MISSING FEATURES LİSTESİ (84 maddeye göre, öncelik sırasıyla)

**Bu oturumda kapatıldı:**
- Gerçek veritabanı (D1) ✅
- Gerçek authentication (JWT + hash'lenmiş parola) ✅
- Tenant isolation (her sorguda company_id) ✅
- Company/Project/Unit CRUD ✅
- **Presentation Lock + race condition koruması (Durable Object)** ✅ — promptun en kritik/en çok vurguladığı madde (33-35)
- Audit log (temel) ✅
- Approval Engine (temel — talep oluştur/onayla, çok seviyeli değil) ✅ (basit versiyon)
- Lead/CRM (dahili, minimal) ✅

**Açık — 3. parti hesap/karar gerektiriyor:**
- WhatsApp Business API entegrasyonu (Meta Business hesabı sizin adınıza açılmalı)
- Ödeme sağlayıcı (iyzico/PayTR/Stripe — hesap + KYC gerekir)
- Harici CRM/ERP bağlantısı (HubSpot/Salesforce/Zoho — API anahtarı gerekir)
- E-imza (Yousign/DocuSign benzeri — hesap gerekir)
- 3D/Cureviz sunum sağlayıcı (hesap + embed URL gerekir)
- Native mobil uygulama (ayrı proje: React Native/Expo + Apple $99/yıl + Google $25 tek seferlik geliştirici hesabı gerekir — bu oturumda YAZILAMAZ, ayrı bir çalışma akışı gerektirir)
- MFA/biyometrik kimlik doğrulama (mobil uygulamayla birlikte gelir)
- Gerçek dosya depolama (Cloudflare R2 bucket — `wrangler r2 bucket create` sizin çalıştırmanız gerekir)

---

## 6. 20 FAZLIK YOL HARİTASI (promptun 82. maddesindeki sıraya göre, gerçekçi kapsamla)

| Faz | İçerik | Durum |
|---|---|---|
| 1 | Mevcut sistem analizi | ✅ Bu doküman |
| 2 | Design System | ✅ Zaten vardı (docs/DESIGN_SYSTEM_ANALYSIS.md), bu oturumda admin/portal'da yeniden kullanıldı |
| 3 | Company Portal (gerçek backend) | ✅ Bu oturumda — D1 + Worker + admin.html/portal.html entegrasyonu |
| 4 | Mobile Application | ⏳ Ayrı proje — app store hesapları + React Native/Expo kurulumu gerekir |
| 5 | Project Management | ✅ Temel CRUD bu oturumda; ada/parsel/pafta/koordinat alanları şemada var, UI formu genişletilecek |
| 6 | Document Management | 🟡 Şema hazır (documents tablosu), gerçek dosya yükleme R2 bucket'ı sizin açmanızı bekliyor |
| 7 | Knowledge Base (izole, company_id filtreli) | 🟡 Şema hazır; agent-core'un RAG'e bağlanması Faz 7b |
| 8 | Company AI Assistant (sesli yönetici asistanı) | ⏳ PRD'de tarif edilmiş prototip yok, ayrı geliştirme |
| 9 | Inventory Engine | ✅ units tablosu + status enum bu oturumda |
| 10 | Presentation Lock | ✅ **Bu oturumda tamamlandı — Durable Object ile gerçek dağıtık kilit** |
| 11 | Realtime Engine (WebSocket/SSE ile canlı senkronizasyon) | ⏳ Faz 11b, Durable Object altyapısı hazır, event yayını eklenecek |
| 12 | CRM/ERP | ⏳ Provider-agnostic arayüz tasarımı bu dokümanda var, gerçek bağlantı sizin API anahtarınızı bekliyor |
| 13 | 3D Presentation | ⏳ Sizin Cureviz/3D sağlayıcı hesabınızı bekliyor |
| 14 | Approval Engine | ✅ Temel versiyon bu oturumda |
| 15 | Payment | ⏳ Ödeme sağlayıcı hesabınızı bekliyor |
| 16 | Contract | ⏳ E-imza sağlayıcı hesabınızı bekliyor |
| 17 | Website Agent | ✅ Zaten canlı (bugün sabah düzeltmeler yapıldı) |
| 18 | Mobile AI | ⏳ Faz 4 ile birlikte |
| 19 | Security Hardening | 🟡 JWT+hash+tenant isolation bu oturumda; RBAC ayrıntılı roller, rate limiting, CSRF token Faz 19b |
| 20 | Production Testing | 🟡 Bu oturumda manuel API testleri; otomatik test suite Faz 20b |

**Lejant:** ✅ tamamlandı · 🟡 temel/kısmi tamamlandı, derinleştirme gerekiyor · ⏳ sizin hesap/kararınızı bekliyor

---

## 7. ZERO-TRUST AI PRENSİBİ (promptun 56. maddesi) — Bu Oturumda Nasıl Korundu

`agent-core`'daki LLM sağlayıcıları (FaqSalesBrainProvider, OpenAIProvider, AnthropicProvider) hâlâ yalnızca `{replyText, emotion, intent}` üretiyor — `intent` alanı `orchestrator.js` içinde yalnızca `console.info` ile loglanıyor, HİÇBİR veritabanı yazma işlemine bağlanmıyor (kod içi yorum bunu açıkça belirtiyor). Yeni `worker-portal` API'si de aynı prensiple tasarlandı: LLM asla doğrudan `/api/units/:id/lock` veya `/api/approvals/:id/decide` çağıramaz — bu uçlar yalnızca kimlik doğrulanmış (JWT'li) bir insan/portal isteğiyle tetiklenir. Agent'ın "daireyi kilitle" demesi ile gerçek kilit isteği arasına, ileride, ayrı bir yetkilendirme katmanı (Business Rules Engine) eklenecek — bu oturumda o katman henüz yazılmadı, sadece mimari buna izin verecek şekilde ayrıldı.

---

## 8. SONUÇ

Bu oturumda VERALIQ, "istemci taraflı demo" seviyesinden "gerçek çok kiracılı backend'i olan bir platform" seviyesine geçti: gerçek veritabanı, gerçek kimlik doğrulama, gerçek envanter durumu ve — promptun en çok vurguladığı — gerçek, race-condition korumalı **Presentation Lock** sistemi kuruldu. Geri kalan 84 maddenin büyük kısmı (WhatsApp, ödeme, CRM, mobil uygulama, 3D, e-imza) sizin sağlayacağınız hesaplar/kararlar olmadan gerçek (fake olmayan) şekilde bağlanamaz — bu doküman her biri için net bir sonraki adım tanımlıyor.
