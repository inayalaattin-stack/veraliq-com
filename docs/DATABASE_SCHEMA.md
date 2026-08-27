# VERALIQ — Veritabanı Şeması (D1 / SQLite)

_Kaynak: `worker-portal/schema.sql` (tek gerçek kaynak — bu dosya onu AÇIKLAR, tekrar tanımlamaz). Şema değiştiğinde bu dosya da güncellenmeli._

## Genel ilke

Her iş verisi tablosu bir `company_id` sütunu taşır (tek istisna: `users.company_id` NULL = VERALIQ admin). Hiçbir sorgu `portal-api-worker.js` içinde `company_id` filtresi OLMADAN çalıştırılmaz — bu, tenant izolasyonunun veritabanı seviyesindeki karşılığı. Uygulama seviyesindeki karşılığı `requireAuth()` fonksiyonudur (JWT'den `company_id`'yi okur, istemciden asla güvenmez).

## Tablolar

### `companies`
Her müşteri şirket (tenant) bir satır. `plan` (trial/starter/pro/enterprise), `status` (active/suspended), `remove_branding` (madde 78: filigran kaldırma feature flag).

### `users`
VERALIQ admin (`company_id IS NULL`, `role='veraliq_admin'`) veya şirket kullanıcıları (`role='company_owner'|'company_staff'`). `email` GLOBAL olarak benzersiz (company_id'ye göre değil) — çünkü giriş ekranı hangi şirkete ait olduğunu sormadan yalnızca email+şifre ile doğrulama yapıyor. `password_hash` PBKDF2-SHA256, düz metin ASLA tutulmuyor.

### `projects`
Bir şirketin inşaat/gayrimenkul projeleri: `name`, `location`, `ada`/`parsel`/`pafta`, `status` (planning/construction/selling/completed), `delivery_date`, `lat`/`lng`.

### `units`
Bağımsız bölüm / gerçek zamanlı envanter. `status` yalnızca belirli geçişlerle değişebilir (state machine, `portal-api-worker.js`'deki `ALLOWED_TRANSITIONS`):

```
AVAILABLE → PRESENTATION → HOLD → RESERVED → DEPOSIT_PAID → CONTRACT → SOLD
```

Geriye geçişler (AVAILABLE'a dönüş) yalnızca PRESENTATION/HOLD/RESERVED aşamalarından mümkün — SOLD/CONTRACT/DEPOSIT_PAID'den geri dönüş YOK. `assigned_agent_type` ('AI'|'HUMAN') hangi ajanın bu birimi sattığını/sunduğunu işaretler — admin.html'deki "Agents" ekranındaki AI-vs-insan istatistiği buradan (`audit_log` üzerinden) türetiliyor.

### `documents`
YALNIZCA metadata (`filename`, `file_type`, `category`, `r2_key`). Gerçek dosya İÇERİĞİ henüz depolanmıyor — `r2_key` alanı Cloudflare R2 entegrasyonu için ayrılmış ama henüz doldurulmuyor. **Bu, dürüstçe işaretlenmiş bir eksiktir.**

### `leads`
Dahili minimal CRM. `source` (website_agent/manual), `assigned_type` (AI/HUMAN), `status` (new/qualified/presentation/negotiating/won/lost), `ai_summary` (ajanın ürettiği yapılandırılmış özet metni).

**Not (65 maddelik yeni promptun 4. maddesi ile karşılaştırma)**: bu tablo, istenen tam "Customer Memory" şemasının (interested_projects/interested_units/previous_presentations/previous_conversations/consent_status/appointments gibi çoklu-ilişkili alanlar) yalnızca BİR KISMINI karşılıyor — `leads` tek bir `project_id`'ye bağlanabiliyor, çoklu proje/birim ilgisi veya geçmiş sunum/görüşme listesi ayrı tablolar olarak YOK. Bu, bir sonraki migration'ın konusu.

### `approval_requests`
Onay motoru (temel versiyon). `type` (discount/payment_plan/reservation/contract/other), `requested_by` ('AI' veya user_id), `status` (pending/approved/rejected). Yalnızca `company_owner` onaylayabilir/reddedebilir.

### `audit_log`
Kritik işlemlerin tamamı: `action`, `entity_type`/`entity_id`, `old_value`/`new_value` (JSON string), `ip`, `device`, `created_at`. AI'ın yaptığı işlemler de buraya yazılıyor (örn. `assistant.query`, `admin_assistant.query`) — 65 maddelik promptun 34. maddesindeki "AI Action Log" isteği kısmen burada karşılanıyor (soru-cevap logluyor; henüz "AI created lead" / "AI created reservation" gibi ayrı, LLM'in doğrudan tetiklediği state-changing aksiyonlar YOK çünkü LLM'e zaten böyle bir yetki verilmedi — Zero Trust AI ilkesi gereği).

## `customers` / `customer_interests` / `conversations` / `conversation_messages` / `conversation_summaries` (2026-08-27 eklendi)

Provider-bağımsız, yapılandırılmış müşteri + görüşme hafızası — 65 maddelik master promptun 3-5, 38-39. maddeleri. Kaynak: `worker-portal/migrations/0001_conversation_memory.sql` (aynı içerik `schema.sql`'e de kopyalandı — tek doğruluk kaynağı ilkesi korunuyor).

- `customers`: `leads`'ten daha zengin, kalıcı müşteri kaydı (`budget`, `preferences`, `sales_status`, `consent_status`). `leads` tablosuyla şimdilik doğrudan bir foreign-key bağı YOK (bilinçli karar — bkz. schema.sql'deki yorum: SQLite'ta `ALTER TABLE ADD COLUMN` var olan bir veritabanına güvenle tekrar uygulanamıyor).
- `customer_interests`: bir müşterinin ilgilendiği proje/birimler (çoktan-çoğa).
- `conversations`: bir görüşüm OTURUMU — `provider` sütunu hangi avatar/LLM sağlayıcısının görüşmeyi yürüttüğünü kaydeder (yalnızca bilgi amaçlı; `customer_id`/`company_id` gibi kimlikler provider değişse bile sabit kalır).
- `conversation_messages`: gerçek transkript (bugün yalnızca tarayıcı belleğinde tutulanın kalıcı karşılığı).
- `conversation_summaries`: özet/ihtiyaç/bütçe/ilgi/itiraz/sonraki-adım.

API: `POST /api/customers`, `GET /api/customers`, `GET/PATCH /api/customers/:id`, `POST /api/customers/:id/interests`, `POST /api/conversations` (JWT VEYA agent-key ile — presentation-lock ile aynı desen), `GET /api/conversations`, `GET /api/conversations/:id`, `POST /api/conversations/:id/messages`, `POST /api/conversations/:id/end`, `POST /api/conversations/:id/summary`. Hepsi test edildi (tenant izolasyonu dahil — bkz. `worker-portal/test/`).

**Güncelleme (aynı gün, ilerleyen saatler)**: bu API'ler artık `agent-core/orchestrator.js` tarafından `agent-core/conversation-logger.js` üzerinden GERÇEKTEN OTOMATİK çağrılıyor — ama yalnızca **portal.html**'de (company_owner/company_staff JWT'si backend'in beklediği rol+company_id ile eşleşiyor). **admin.html bilinçli olarak bağlanmadı** (veraliq_admin rolünün company_id'si yok, `/api/conversations` bu rolü kabul etmiyor) ve **index.html henüz bağlanmadı** (asıl hedef kullanım senaryosu budur, ama prodüksiyondaki çalışan müşteri ajanını riske atmamak için sıradaki adıma bırakıldı). Ayrıntı: PROJECT_ARCHITECTURE.md §4.

## Eksik olan (henüz tablo YOK)

- `payments`, `contracts` — ödeme planı ve sözleşme kayıtları (portal.html'in Payments/Contracts ekranları şu an `units` tablosundaki status'a bakıyor, ayrı bir finansal kayıt tutmuyor).
- `tasks` — 65 maddelik promptun 47. maddesindeki "AI önerdiği işler task olarak oluşturulsun" isteği için.

## Migration disiplini (65 maddelik promptun 56. maddesi)

Şu ana kadar şema hiç migration dosyası olmadan tek `schema.sql` (`CREATE TABLE IF NOT EXISTS`) ile yönetildi — çünkü proje henüz canlı üretim verisi taşımıyordu (yalnızca seed/test verisi). **Gerçek müşteri verisi girmeye başladığı andan itibaren** bu değişmeli: yeni alan/tablo eklemek için `worker-portal/migrations/NNN_description.sql` dosyaları oluşturulmalı ve `wrangler d1 migrations apply` ile uygulanmalı — `schema.sql`'i doğrudan elle değiştirip yeniden çalıştırmak canlıda veri kaybına yol açabilir.
