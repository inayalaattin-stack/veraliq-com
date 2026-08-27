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
| GET | `/api/companies/me/export` | **yalnızca owner** | Şirketin TÜM verisinin (projeler/birimler/lead/müşteri/görüşme/onay/audit) tek JSON'da dışa aktarımı — madde 61-62, `password_hash` DAHİL EDİLMEZ, portal.html Settings ekranında "Tüm Verilerimi İndir" butonu |
| GET | `/api/team` | owner/staff (tüm rol tier'leri) | Kendi şirketinin kullanıcı listesi |
| POST | `/api/team` | owner | Yeni üye davet eder — body'de opsiyonel `role` (2026-08-27 eklendi): `company_staff` (varsayılan), `company_manager`, `company_sales_manager`, `company_sales_agent`, `company_viewer`. Tanınmayan/eksik değer sessizce `company_staff`'a düşer |
| DELETE | `/api/team/:id` | owner | Kaldırır (owner kaldırılamaz) |

## RBAC — Genişletilmiş roller (2026-08-27 eklendi, 65 maddelik master prompt)

`company_owner` ve `company_staff`'a ek olarak 4 yeni rol tanımlandı: `company_manager`, `company_sales_manager`, `company_sales_agent`, `company_viewer`. Tasarım gereği **geriye dönük tam uyumlu** — mevcut owner/staff davranışı hiç değişmedi (105 testte doğrulandı, sıfır regresyon).

- **Tier eşlemesi**: `requireAuth()` içinde `COMPANY_ROLE_BASE_TIER` bu 4 yeni rolü `'company_staff'` tier'ine eşliyor. Yani `allowedRoles: ['company_owner','company_staff']` ile korunan HER uç, ek kod değişikliği olmadan bu 4 yeni role de otomatik açılıyor (dokümandaki "owner/staff" tüm satırlar bu tier'i kapsar).
- **`company_viewer` özel kısıtı — gerçekten uygulanıyor**: `requireAuth()` içinde doğrudan, rol `company_viewer` VE HTTP metodu `GET` değilse istek 401 ile reddediliyor — bu route bazlı değil, merkezi ve atlanamaz bir kontrol.
- **Genişletilmiş yetkiler route-bazlı, asla örtük değil**: Şu an tek örnek `company_manager`'ın `/api/approvals/:id` (onay/red) uçlarına owner ile birlikte erişebilmesi — bu route'un `allowedRoles` listesine açıkça eklendi, tier eşlemesinden otomatik gelmedi.
- **Bilinen basitleştirme (dürüstçe belirtiliyor)**: `company_sales_agent` şu an `company_staff` ile birebir aynı erişime sahip (satır bazlı "yalnızca kendi lead'lerini görsün" kısıtı YOK) — 65 maddelik promptun ima ettiği daha ince taneli "temsilci yalnızca kendi müşterilerini görür" davranışı bu pass'te kapsam dışı bırakıldı, ayrı bir iterasyon gerektiriyor.
- **portal.html**: Ekip davet formunda rol seçici (`<select id="ntRole">`) eklendi; ekip listesi artık her rolü kendi Türkçe etiketiyle gösteriyor (`ROLE_LABELS`), eskiden tüm yeni roller "Personel" olarak yanlış gösteriliyordu.
- **Test kapsamı**: 14 yeni test — davet ile her rolün atanabildiği, geçersiz rolün `company_staff`'a düştüğü, `company_sales_agent`'ın staff-tier erişimine sahip olduğu, `company_viewer`'ın GET yapabilip POST/PATCH'te 401 aldığı, `company_manager`/`company_sales_agent`'ın owner-only uçlara (export, davet) erişemediği, `company_sales_agent`'ın onay talebi oluşturup karar VEREMEDİĞİ, `company_manager`'ın karar VEREBİLDİĞİ.

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

Not (güncellendi): bu uçlar artık `agent-core/orchestrator.js` tarafından `agent-core/conversation-logger.js` üzerinden **portal.html**'de otomatik çağrılıyor (company_owner/company_staff JWT'si backend'in beklediği rol+company_id ile eşleştiği için). **admin.html bilinçli olarak bağlanmadı** (veraliq_admin'in company_id'si yok/rolü uymuyor) ve **index.html henüz bağlanmadı** (sıradaki adım) — bkz. PROJECT_ARCHITECTURE.md §4.

## Lead / Onay / Audit

| Method | Path | Rol | Açıklama |
|---|---|---|---|
| GET/POST | `/api/leads` | owner/staff | POST artık opsiyonel `customer_id` kabul ediyor (başka şirkete aitse sessizce null kalır) |
| PATCH | `/api/leads/:id` | owner/staff | `customer_id` ile bağlama/kaldırma (geçersiz id → 400) |
| GET/POST | `/api/approvals` | owner/staff tier (POST dahil, 2026-08-27: yeni rollerin hepsi talep oluşturabilir) | |
| PATCH | `/api/approvals/:id` | owner **veya** `company_manager` (2026-08-27 genişletildi) | `{status}` onay/red kararı |
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
