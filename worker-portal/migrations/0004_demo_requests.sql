-- 0004_demo_requests.sql
--
-- Faz 4 (VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md) — gerçek demo talebi
-- akışı. Önceden index.html'deki demo formu yalnızca bir `mailto:` linki
-- açıyordu (bkz. script.js'in eski "honest fallback" yorumu) — hiçbir kayıt
-- sunucu tarafında tutulmuyordu. Bu tablo, VERALIQ'in KENDİ ticari demo
-- taleplerini tutar; tenant şirketlerin kendi emlak lead'lerini tutan
-- `leads` tablosundan kasıtlı olarak AYRIDIR (bkz. schema.sql'deki tablo
-- yorumu).
--
-- GÜVENLİ TEKRAR ÇALIŞTIRMA: `CREATE TABLE IF NOT EXISTS` kullanıldığı için
-- (SQLite'ın ADD COLUMN'un aksine) bu migration güvenle birden çok kez
-- çalıştırılabilir.

CREATE TABLE IF NOT EXISTS demo_requests (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  company           TEXT NOT NULL,
  phone             TEXT NOT NULL,
  email             TEXT NOT NULL,
  company_type      TEXT NOT NULL DEFAULT '',
  volume            TEXT NOT NULL DEFAULT '',
  source            TEXT NOT NULL DEFAULT 'website',
  status            TEXT NOT NULL DEFAULT 'new',
  owner_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes             TEXT NOT NULL DEFAULT '',
  consent_version   TEXT NOT NULL DEFAULT '',
  consent_timestamp TEXT,
  ip                TEXT NOT NULL DEFAULT '',
  user_agent        TEXT NOT NULL DEFAULT '',
  notified_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON demo_requests(status);
CREATE INDEX IF NOT EXISTS idx_demo_requests_created ON demo_requests(created_at);
