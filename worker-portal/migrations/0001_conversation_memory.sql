-- worker-portal/migrations/0001_conversation_memory.sql
--
-- İLK migration dosyası — worker-portal/docs (DATABASE_SCHEMA.md) 'de
-- duyurulan migration disiplininin başlangıcı. Bu dosyanın içeriği
-- schema.sql'e de (tek doğruluk kaynağı, fresh kurulumlar için) AYNEN
-- kopyalandı. VAR OLAN bir veritabanına uygulamak için:
--
--   npx wrangler d1 execute veraliq-portal-db --remote --file=migrations/0001_conversation_memory.sql
--
-- CREATE TABLE IF NOT EXISTS kullanıldığı için güvenle tekrar çalıştırılabilir.

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
