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

## Eksik olan (henüz tablo YOK)

- `conversations` / `conversation_summaries` — provider-bağımsız görüşme geçmişi (bkz. PROJECT_ARCHITECTURE.md §4).
- `customers` (ayrı, `leads`'ten daha zengin bir tablo — budget/preferences/interested_units/consent_status gibi).
- `payments`, `contracts` — ödeme planı ve sözleşme kayıtları (portal.html'in Payments/Contracts ekranları şu an `units` tablosundaki status'a bakıyor, ayrı bir finansal kayıt tutmuyor).
- `tasks` — 65 maddelik promptun 47. maddesindeki "AI önerdiği işler task olarak oluşturulsun" isteği için.

## Migration disiplini (65 maddelik promptun 56. maddesi)

Şu ana kadar şema hiç migration dosyası olmadan tek `schema.sql` (`CREATE TABLE IF NOT EXISTS`) ile yönetildi — çünkü proje henüz canlı üretim verisi taşımıyordu (yalnızca seed/test verisi). **Gerçek müşteri verisi girmeye başladığı andan itibaren** bu değişmeli: yeni alan/tablo eklemek için `worker-portal/migrations/NNN_description.sql` dosyaları oluşturulmalı ve `wrangler d1 migrations apply` ile uygulanmalı — `schema.sql`'i doğrudan elle değiştirip yeniden çalıştırmak canlıda veri kaybına yol açabilir.
