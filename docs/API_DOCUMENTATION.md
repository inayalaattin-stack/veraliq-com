# VERALIQ — worker-portal API Dokümantasyonu

Base URL (canlı): `https://veraliq-portal-api.veraliq-com.workers.dev`
Kaynak: `worker-portal/portal-api-worker.js`. Tüm yanıtlar JSON. Auth: `Authorization: Bearer <JWT>` (auth uçları hariç).

## Auth

| Method | Path | Rol | Açıklama |
|---|---|---|---|
| POST | `/api/auth/admin/login` | — | `{email, password}` → `{token}` (veraliq_admin) |
| POST | `/api/auth/company/login` | — | `{email, password}` → `{token, user, company}` |
| POST | `/api/auth/change-password` | herhangi | `{current_password, new_password}` (min 8 karakter) |

## Şirket kendi kendine yönetim

| Method | Path | Rol | Açıklama |
|---|---|---|---|
| GET/PATCH | `/api/companies/me` | owner/staff | Kendi şirket bilgisi; PATCH yalnızca `name` (plan/status admin-only) |
| GET | `/api/team` | owner/staff | Kendi şirketinin kullanıcı listesi |
| POST | `/api/team` | owner | Yeni `company_staff` davet eder |
| DELETE | `/api/team/:id` | owner | Kaldırır (owner kaldırılamaz) |

## Projeler / Envanter

| Method | Path | Rol | Açıklama |
|---|---|---|---|
| GET/POST | `/api/projects` | owner/staff/admin | admin `?company_id=` zorunlu |
| GET | `/api/projects/:id` | owner/staff/admin | Cross-tenant erişim 403 |
| PATCH/DELETE | `/api/projects/:id` | owner/staff/admin | |
| GET | `/api/projects/:id/units` | owner/staff/admin | |
| GET | `/api/units` | owner/staff/admin | Tüm projeler genelinde, `?status=` filtresi |
| PATCH | `/api/units/:id` | owner/staff/admin | `{status}` — yalnızca `ALLOWED_TRANSITIONS`'a uyan geçişler kabul edilir (400 aksi halde) |
| POST/GET | `/api/units/:id/lock` | — (Durable Object) | Sunum kilidi — bkz. presentation-lock-do.js |

## Dashboard / AI Assistant (şirkete özel)

| Method | Path | Rol | Açıklama |
|---|---|---|---|
| GET | `/api/dashboard` | owner/staff | Toplam lead/satış/ciro/onay istatistikleri |
| POST | `/api/assistant/query` | owner/staff | `{question}` → `{answer}` — deterministik, `answerAssistantQuery()` |

## Müşteri + Görüşme Hafızası (provider-bağımsız, 2026-08-27 eklendi)

| Method | Path | Rol | Açıklama |
|---|---|---|---|
| GET/POST | `/api/customers` | owner/staff | |
| GET/PATCH | `/api/customers/:id` | owner/staff | GET; interests + conversation geçmişi dahil |
| POST | `/api/customers/:id/interests` | owner/staff | `{project_id?, unit_id?}` |
| GET/POST | `/api/conversations` | owner/staff (GET), owner/staff **veya** agent-key (POST) | POST: canlı ajan (widget) `X-Agent-Key` ile başlatabilir — presentation-lock ile aynı desen |
| GET | `/api/conversations/:id` | owner/staff/admin | mesajlar + son özet dahil |
| POST | `/api/conversations/:id/messages` | owner/staff veya agent-key | `{role, text}` |
| POST | `/api/conversations/:id/end` | owner/staff veya agent-key | |
| POST | `/api/conversations/:id/summary` | owner/staff veya agent-key | `{summary, customer_need, budget, interest, objection, next_step}` |

⚠️ Not: bu uçlar HAZIR ve test edilmiş, ama `agent-core/orchestrator.js` henüz bunları otomatik ÇAĞIRMIYOR — bkz. PROJECT_ARCHITECTURE.md §4.

## Lead / Onay / Audit

| Method | Path | Rol | Açıklama |
|---|---|---|---|
| GET/POST | `/api/leads` | owner/staff | |
| PATCH | `/api/leads/:id` | owner/staff | |
| GET/POST | `/api/approvals` | owner/staff (POST) | |
| PATCH | `/api/approvals/:id` | owner | `{status}` onay/red kararı |
| GET | `/api/audit-log` | owner/admin | owner kendi şirketi, admin tümü (son 200) |

## VERALIQ Admin (yalnızca `veraliq_admin`)

| Method | Path | Açıklama |
|---|---|---|
| GET/POST | `/api/companies` | Şirket listesi / yeni şirket+owner oluşturma |
| GET/PATCH/DELETE | `/api/companies/:id` | Detay (+projeler) / plan-durum güncelleme / silme |
| GET | `/api/admin/users` | Platform genelinde TÜM kullanıcılar (+ şirket adı) |
| GET | `/api/admin/projects` | Platform genelinde TÜM projeler (+ şirket adı) |
| GET | `/api/admin/stats` | Platform-geneli özet: şirket/kullanıcı/proje/birim/satış/ciro/onay/AI-vs-insan sunum + plan dağılımı |
| POST | `/api/admin/assistant/query` | `{question}` → `{answer}` — platform-geneli, `answerAdminAssistantQuery()` |

## Herkese açık

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/health` | `{ok, db, worker, time}` — auth gerektirmez, D1 canlılık kontrolü |

## Hata formatı

Tüm hatalar `{"error": "kod"}` (bazen `detail`/`data` eklenir) + uygun HTTP status (400/401/403/404/409/500) döner. Bilinen kodlar: `missing_fields`, `invalid_credentials`, `slug_taken`, `email_taken`, `unauthorized`, `forbidden`, `not_found`, `no_fields`, `cannot_remove_owner`, `password_too_short`, `company_id_required`, `internal_error`.

## CORS

Yalnızca `https://veraliq.com` ve `https://www.veraliq.com` origin'lerine izin verilir (`ALLOWED_ORIGINS`, `corsHeaders()`). Başka bir origin'den gelen istek CORS hatası alır.
