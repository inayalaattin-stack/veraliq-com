-- worker-portal/schema.sql
--
-- VERALIQ Company Portal — Cloudflare D1 şeması.
--
-- TASARIM İLKESİ (Master Platform Prompt madde 55/56 — Multi-Tenant Security
-- + Zero Trust AI): her iş verisi tablosu (projects, units, documents, leads,
-- approval_requests, audit_log) bir `company_id` sütunu taşır. Hiçbir sorgu
-- worker-portal/portal-api-worker.js içinde company_id filtresi OLMADAN
-- çalıştırılmaz — bu, "Company A'nın Company B verisine asla erişememesi"
-- kuralının veritabanı seviyesindeki karşılığıdır (uygulama seviyesindeki
-- karşılığı için bkz. portal-api-worker.js'deki requireAuth() fonksiyonu).
--
-- Bu şema kasıtlı olarak KÜÇÜK ve ODAKLI tutuldu: Master Platform Prompt'un
-- 84 maddesinin tamamının veri modelini tek seferde kurmak yerine (ki bu,
-- gerçek kullanıma açılmadan yüzlerce alanı olan, hiç test edilmemiş dev bir
-- şema anlamına gelirdi), promptun kendi Faz 3/5/9/10/14 sırasına denk gelen
-- ÇEKİRDEĞİ kuruldu: Company/User/Project/Unit (envanter) + Presentation Lock
-- + Lead + Approval + Audit Log. Faz 6+ (Document içerik depolama/R2,
-- Contract, Payment, CRM sync log) ayrı migration dosyalarıyla eklenecek —
-- bkz. docs/MASTER_PLATFORM_ANALYSIS_AND_ROADMAP.md Bölüm 2.3.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- companies — her müşteri şirket (tenant) bir satır.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id            TEXT PRIMARY KEY,          -- örn. 'co_abc123' (nanoid benzeri)
  name          TEXT NOT NULL,             -- 'ABC İnşaat'
  slug          TEXT NOT NULL UNIQUE,      -- 'abc-insaat' (embed/URL için)
  plan          TEXT NOT NULL DEFAULT 'trial',   -- 'trial' | 'starter' | 'pro' | 'enterprise'
  status        TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'suspended'
  remove_branding INTEGER NOT NULL DEFAULT 0,    -- madde 78: filigran kaldırma feature flag
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- users — VERALIQ admin (company_id NULL) veya şirket kullanıcıları.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  company_id    TEXT REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = veraliq_admin
  email         TEXT NOT NULL UNIQUE,       -- GLOBAL olarak benzersiz — giriş ekranı (portal.html) hangi
                                             -- şirkete ait olduğunu sormadan yalnızca email+şifre ile
                                             -- doğrulama yapıyor (bkz. portal-api-worker.js
                                             -- /api/auth/company/login: "WHERE email = ?", company_id
                                             -- filtresi YOK). Bu yüzden email company_id'ye göre değil,
                                             -- TÜM users tablosunda benzersiz olmalı — aksi halde iki
                                             -- farklı şirket aynı email'i kullanırsa hangi şirkete ait
                                             -- olduğu belirsizleşir (ciddi bir güvenlik/doğruluk hatası
                                             -- olurdu). "Kullanıcı Adı" olarak gösterilse de teknik
                                             -- olarak bu sütun email'dir.
  password_hash TEXT NOT NULL,             -- PBKDF2-SHA256 (Web Crypto, bkz. auth.js) — düz metin ASLA
  role          TEXT NOT NULL,             -- 'veraliq_admin' | 'company_owner' | 'company_staff'
  name          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  location       TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  delivery_date  TEXT,                     -- ISO date, opsiyonel
  lat            REAL,
  lng            REAL,
  ada            TEXT,
  parsel         TEXT,
  pafta          TEXT,
  status         TEXT NOT NULL DEFAULT 'planning',  -- 'planning'|'construction'|'selling'|'completed'
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);

-- ---------------------------------------------------------------------------
-- units — bağımsız bölüm / gerçek zamanlı envanter (madde 32, 36).
-- status geçişleri: AVAILABLE -> PRESENTATION -> HOLD -> RESERVED
--                   -> DEPOSIT_PAID -> CONTRACT -> SOLD
-- Bu geçişler yalnızca portal-api-worker.js'deki state-machine fonksiyonu
-- üzerinden yapılır; UI veya LLM doğrudan status yazamaz.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS units (
  id                      TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id              TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,  -- denormalize: hızlı tenant filtresi
  block                   TEXT NOT NULL DEFAULT '',
  floor                   INTEGER,
  unit_no                 TEXT NOT NULL,
  unit_type               TEXT NOT NULL DEFAULT '',   -- '1+1','2+1',...
  gross_area              REAL,
  net_area                REAL,
  price                   REAL,
  currency                TEXT NOT NULL DEFAULT 'TRY',
  status                  TEXT NOT NULL DEFAULT 'AVAILABLE',
  assigned_agent_type     TEXT,             -- 'AI' | 'HUMAN' (madde 39)
  assigned_agent_id       TEXT,
  presentation_session_id TEXT,             -- aktif sunum oturumu id'si (Durable Object ile eşleşir)
  hold_expires_at         TEXT,
  reservation_expires_at  TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, block, unit_no)
);
CREATE INDEX IF NOT EXISTS idx_units_project ON units(project_id);
CREATE INDEX IF NOT EXISTS idx_units_company ON units(company_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);

-- ---------------------------------------------------------------------------
-- documents — yalnızca METADATA (gerçek dosya içeriği Faz 6'da R2'ye
-- taşınacak; bkz. docs/MASTER_PLATFORM_ANALYSIS_AND_ROADMAP.md §2.3).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  file_type    TEXT NOT NULL DEFAULT '',    -- 'pdf'|'pptx'|'xlsx'|'docx'|'jpg'|'png'|'mp4'...
  category     TEXT NOT NULL DEFAULT 'other', -- 'price_list'|'payment_plan'|'presentation'|'contract'|'image'|'video'|'other'
  r2_key       TEXT,                        -- Faz 6'da doldurulacak
  uploaded_by  TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id);

-- ---------------------------------------------------------------------------
-- leads — dahili minimal CRM (madde 30, 40).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name          TEXT NOT NULL DEFAULT '',
  phone         TEXT,
  email         TEXT,
  budget        REAL,
  interest      TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'website_agent',  -- madde 40: source
  assigned_to   TEXT,
  assigned_type TEXT NOT NULL DEFAULT 'AI',              -- 'AI' | 'HUMAN'
  status        TEXT NOT NULL DEFAULT 'new',             -- 'new'|'qualified'|'presentation'|'negotiating'|'won'|'lost'
  notes         TEXT NOT NULL DEFAULT '',
  ai_summary    TEXT NOT NULL DEFAULT '',    -- madde 69: agent memory -> CRM'e yapılandırılmış özet
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);

-- ---------------------------------------------------------------------------
-- approval_requests — madde 42-43: Approval Engine (temel versiyon).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_requests (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,               -- 'discount'|'payment_plan'|'reservation'|'contract'|'other'
  related_id   TEXT,                        -- ör. unit_id veya lead_id
  requested_by TEXT NOT NULL,               -- 'AI' veya user_id
  amount       REAL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'approved'|'rejected'
  approved_by  TEXT,
  approved_at  TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_approvals_company ON approval_requests(company_id);

-- ---------------------------------------------------------------------------
-- audit_log — madde 54: kritik tüm işlemler kayıt altına alınmalı.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  company_id   TEXT REFERENCES companies(id) ON DELETE CASCADE,
  user_id      TEXT,
  action       TEXT NOT NULL,               -- 'unit.status_change','approval.decide','company.create',...
  entity_type  TEXT NOT NULL,
  entity_id    TEXT,
  old_value    TEXT,                        -- JSON string
  new_value    TEXT,                        -- JSON string
  ip           TEXT,
  device       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
