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

-- ===========================================================================
-- YAPILANDIRILMIŞ MÜŞTERİ + GÖRÜŞME HAFIZASI (2026-08-27 eklendi)
--
-- İmparator'ın "VERALIQ — AI Asistan Mimarisi, Veri Bağımsızlığı, Yedekleme
-- ve Güvenlik Master Promptu" (madde 3-5, 38-39, 61-62): VERALIQ'ın verisi
-- hiçbir zaman tek bir AI/avatar/ses sağlayıcısına bağlı olmamalı — müşteri
-- hafızası ve görüşme geçmişi/özeti PROVIDER'DAN BAĞIMSIZ, VERALIQ'ın kendi
-- veritabanında tutulmalı. Bu beş tablo bunu karşılar: bir görüşme
-- Anam/Spatius/başka bir avatarla başlasa bile, transkript ve özet burada
-- kalır — provider değişse bile hiçbir şey kaybolmaz.
--
-- BU DOSYA (schema.sql) tek doğruluk kaynağı olmaya devam ediyor (fresh
-- kurulumlar için `wrangler d1 execute --file=schema.sql` hâlâ çalışır,
-- `CREATE TABLE IF NOT EXISTS` sayesinde var olan bir veritabanına karşı
-- YENİDEN çalıştırmak da güvenlidir — mevcut tabloları ETKİLEMEZ, yalnızca
-- eksik olanları ekler). Ayrıca aynı içerik, migration disiplinini
-- BAŞLATMAK için worker-portal/migrations/0001_conversation_memory.sql'e de
-- kopyalandı — bkz. docs/DATABASE_SCHEMA.md "Migration disiplini".
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- customers — leads'ten daha zengin, kalıcı müşteri kaydı. Bir lead
-- kalifiye olduğunda bugün için `leads.notes`/`leads.ai_summary` alanına
-- customer id'si not olarak yazılabilir; ayrı bir `leads.customer_id` foreign
-- key sütunu BİLEREK eklenmedi — SQLite'ta ALTER TABLE ADD COLUMN, CREATE
-- TABLE IF NOT EXISTS gibi güvenle tekrar çalıştırılamıyor (var olan bir
-- veritabanına ikinci kez uygulanırsa "duplicate column" hatası verir), bu
-- yüzden gerçek bir migration dosyası (worker-portal/migrations/) ile,
-- tek seferlik olarak eklenmesi daha doğru — sonraki bir turun konusu.
-- Provider bağımsız: hangi avatar/LLM sağlayıcısı değişirse değişsin bu
-- satır aynı kalır.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
  phone          TEXT,
  email          TEXT,
  budget         REAL,
  preferences    TEXT NOT NULL DEFAULT '',   -- serbest metin/JSON — örn. '{"oda":"2+1","kat":"yüksek"}'
  sales_status   TEXT NOT NULL DEFAULT 'new', -- 'new'|'qualified'|'negotiating'|'won'|'lost'
  consent_status TEXT NOT NULL DEFAULT 'unknown', -- 'unknown'|'given'|'declined' (KVKK/GDPR)
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);

-- ---------------------------------------------------------------------------
-- customer_interests — bir müşterinin ilgilendiği proje/birimler (çoktan
-- çoğa). "previous_presentations"/"interested_units" alanlarının karşılığı.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_interests (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  unit_id     TEXT REFERENCES units(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_interests_customer ON customer_interests(customer_id);

-- ---------------------------------------------------------------------------
-- conversations — bir görüşme OTURUMU (provider bağımsız kimlik). `provider`
-- sütunu hangi avatar/LLM sağlayıcısının bu görüşmeyi yürüttüğünü kaydeder
-- (madde 20-21: provider migration/audit izlenebilirliği) ama bu sütun
-- yalnızca BİLGİ amaçlıdır — customer_id/lead_id gibi kimlikler provider
-- değişse bile SABİT kalır.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  lead_id       TEXT REFERENCES leads(id) ON DELETE SET NULL,
  agent_type    TEXT NOT NULL DEFAULT 'AI',   -- 'AI' | 'HUMAN'
  agent_persona TEXT NOT NULL DEFAULT '',     -- örn. 'Elif Kaya', 'Şirket Yönetim Asistanı'
  provider      TEXT NOT NULL DEFAULT '',     -- örn. 'spatius', 'anam', 'mock' (agent-core/config.js)
  channel       TEXT NOT NULL DEFAULT 'web',  -- 'web'|'portal'|'admin'|'whatsapp'
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_conversations_company ON conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);

-- ---------------------------------------------------------------------------
-- conversation_messages — GERÇEK transkript. orchestrator.js'in bugün yalnızca
-- tarayıcı belleğinde (this.history) tuttuğu satırların kalıcı karşılığı.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,   -- 'customer' | 'agent'
  text            TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conv_messages_conversation ON conversation_messages(conversation_id);

-- ---------------------------------------------------------------------------
-- conversation_summaries — uzun görüşmelerden çıkarılan yapılandırılmış özet
-- (madde 39: özet/ihtiyaç/bütçe/ilgi/itiraz/sonraki adım).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  summary         TEXT NOT NULL DEFAULT '',
  customer_need   TEXT NOT NULL DEFAULT '',
  budget          REAL,
  interest        TEXT NOT NULL DEFAULT '',
  objection       TEXT NOT NULL DEFAULT '',
  next_step       TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conv_summaries_conversation ON conversation_summaries(conversation_id);
