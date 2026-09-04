-- worker-portal/migrations/0003_contract_risk_lock.sql
--
-- Modül 8 — İç Sözleşme & Vade Risk Kilidi (SPK kapsamı dışı: hiçbir fiyat
-- tahmini/yatırım tavsiyesi üretmez, yalnızca şirketin ZATEN imzaladığı
-- sözleşmelerdeki tarih/rakamların birbiriyle ve units.net_area ile
-- tutarlılığını denetler). Bkz. Veraliq Compliance & Cost tasarım raporu §09.
--
-- Bu dosya yalnızca `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT
-- EXISTS` içerir — 0002'nin aksine bir ALTER TABLE DEĞİLDİR, dolayısıyla
-- güvenle birden fazla kez çalıştırılabilir (idempotent).
--
-- Uygulamak için (kendi bilgisayarınızdan):
--
--   npx wrangler d1 execute veraliq-portal-db --remote --file=worker-portal/migrations/0003_contract_risk_lock.sql
--
-- Flag kontrolü GEREKLİ: bu tablolara yazan/okuyan worker route'ları henüz
-- portal-api-worker.js'e eklenmedi (bkz. tasarım raporu §13) — bu migration
-- yalnızca şemayı hazırlar, route'lar ayrı bir PR'da gelecek.

CREATE TABLE IF NOT EXISTS internal_contracts (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  unit_id               TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  contract_price        REAL NOT NULL,
  price_lock_date       TEXT NOT NULL,          -- fiyat sabitleme tarihi
  price_lock_expires_at TEXT,                   -- vade — sonrasında fiyat şirket politikasına göre yeniden değerlendirilir
  payment_schedule      TEXT NOT NULL,          -- JSON dizi: [{"due_at":"...","amount":...,"paid":0}]
  metraj_m2             REAL NOT NULL,          -- sözleşmede yazan net metrekare (units.net_area ile kıyaslanır)
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_internal_contracts_company ON internal_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_internal_contracts_unit ON internal_contracts(unit_id);

CREATE TABLE IF NOT EXISTS contract_risk_flags (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id   TEXT NOT NULL REFERENCES internal_contracts(id) ON DELETE CASCADE,
  flag_type     TEXT NOT NULL,             -- 'vade_yaklasiyor' | 'metraj_uyumsuz' | 'odeme_gecikmesi' | 'fiyat_kilidi_doldu'
  severity      TEXT NOT NULL,             -- 'bilgi' | 'dikkat' | 'kritik'
  detail        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'reviewed' | 'resolved'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contract_risk_flags_company ON contract_risk_flags(company_id);
CREATE INDEX IF NOT EXISTS idx_contract_risk_flags_contract ON contract_risk_flags(contract_id);

CREATE TABLE IF NOT EXISTS company_addons (
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  addon_key     TEXT NOT NULL,   -- 'compliance_cost' | 'punch_list' | 'contract_risk_lock'
                                  -- ('title_bureaucracy' ve 'market_intel' kasıtlı olarak yok — hukuki risk
                                  -- gerekçesiyle 04.09.2026'da tamamen iptal edildi, bkz. tasarım raporu §08/§10)
  active        INTEGER NOT NULL DEFAULT 1,
  activated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (company_id, addon_key)
);
