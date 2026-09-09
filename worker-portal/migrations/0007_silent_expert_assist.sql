-- worker-portal/migrations/0007_silent_expert_assist.sql
--
-- Silent Expert Assist — 1. uygulama turu (bkz. repo kökündeki
-- SILENT-EXPERT-ASSIST-DESIGN.md, kullanıcı onaylı tasarım §3, §13).
-- WebSocket/DO canlı push VE portal notification UI/PWA/push BU MİGRATION'IN
-- KAPSAMINDA DEĞİL — yalnızca veri modeli.
--
-- GÜVENLİ TEKRAR ÇALIŞTIRMA: Bu dosyadaki her ifade `CREATE TABLE IF NOT
-- EXISTS` / `CREATE INDEX IF NOT EXISTS` kullanıyor — `ALTER TABLE ADD
-- COLUMN` YOK. Var olan bir veritabanına karşı güvenle tekrar
-- çalıştırılabilir (0004/0006 ile AYNI disiplin).
--
-- UYGULAMA NOTU: `expert_queries.topic`, tasarım dokümanındaki ilk taslakta
-- YOKTU — uygulama sırasında eklendi, çünkü scope_type='topic' olan bir
-- expert_group_member'ın hangi sorguya eşleşeceğini belirlemek için sorunun
-- KENDİSİNİN de bir topic taşıması gerekiyordu (aksi halde topic-scope hiç
-- eşleşmezdi). Tasarımın ilkesini bozmuyor, yalnızca eksik bir alanı
-- tamamlıyor.

CREATE TABLE IF NOT EXISTS expert_groups (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expert_groups_company ON expert_groups(company_id);

CREATE TABLE IF NOT EXISTS expert_group_members (
  id                TEXT PRIMARY KEY,
  expert_group_id   TEXT NOT NULL REFERENCES expert_groups(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type        TEXT NOT NULL DEFAULT 'company',
  scope_project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  scope_topic       TEXT,
  approval_limit    REAL,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(expert_group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_expert_members_group ON expert_group_members(expert_group_id);
CREATE INDEX IF NOT EXISTS idx_expert_members_user ON expert_group_members(user_id);

CREATE TABLE IF NOT EXISTS expert_queries (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id           TEXT REFERENCES customers(id) ON DELETE SET NULL,
  project_id            TEXT REFERENCES projects(id) ON DELETE SET NULL,
  unit_id               TEXT REFERENCES units(id) ON DELETE SET NULL,
  expert_group_id       TEXT NOT NULL REFERENCES expert_groups(id),
  question_text         TEXT NOT NULL,
  category              TEXT NOT NULL DEFAULT 'info',
  topic                 TEXT,
  required_valid_answers INTEGER NOT NULL DEFAULT 1,
  sent_to               TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',
  accepted_answer_id    TEXT,
  timeout_at            TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at           TEXT
);
CREATE INDEX IF NOT EXISTS idx_expert_queries_company ON expert_queries(company_id);
CREATE INDEX IF NOT EXISTS idx_expert_queries_conversation ON expert_queries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_expert_queries_status ON expert_queries(status);

CREATE TABLE IF NOT EXISTS expert_answers (
  id                TEXT PRIMARY KEY,
  expert_query_id   TEXT NOT NULL REFERENCES expert_queries(id) ON DELETE CASCADE,
  answered_by       TEXT NOT NULL REFERENCES users(id),
  answer_text       TEXT NOT NULL,
  attachment_doc_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  result            TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expert_answers_query ON expert_answers(expert_query_id);

CREATE TABLE IF NOT EXISTS conversation_memories (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id           TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  key_type              TEXT NOT NULL,
  key                   TEXT NOT NULL,
  value                 TEXT NOT NULL,
  source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at            TEXT
);
CREATE INDEX IF NOT EXISTS idx_conv_memories_customer ON conversation_memories(company_id, customer_id);

CREATE TABLE IF NOT EXISTS company_knowledge_candidates (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_expert_answer_id TEXT NOT NULL REFERENCES expert_answers(id),
  question_text           TEXT NOT NULL,
  answer_text             TEXT NOT NULL,
  scope                   TEXT NOT NULL DEFAULT 'this_conversation',
  source_reference        TEXT,
  valid_until             TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending_review',
  answered_by             TEXT NOT NULL REFERENCES users(id),
  approved_by             TEXT REFERENCES users(id),
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_candidates_company ON company_knowledge_candidates(company_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_candidates_status ON company_knowledge_candidates(status);

-- push_subscriptions: tasarım dokümanında ADI GEÇMİYOR (spesifikasyonun 6
-- tablosuna dahil değil) ama Web Push için ZORUNLU — bkz. tasarım §3'teki
-- açık not. 2. uygulama turunda (PWA/Web Push) kullanılacak, bu turda
-- şema hazırlanıyor.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh_key  TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, endpoint)
);
