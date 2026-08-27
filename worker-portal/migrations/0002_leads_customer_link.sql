-- worker-portal/migrations/0002_leads_customer_link.sql
--
-- leads.customer_id — leads (eski, dahili minimal CRM) ile customers (yeni,
-- provider-bağımsız yapılandırılmış müşteri kaydı, bkz. migration 0001)
-- arasındaki eksik bağlantı. DATABASE_SCHEMA.md'de daha önce dürüstçe
-- işaretlenmiş bir eksikti ("bu tablo çoklu-ilişkili customer memory
-- şemasının yalnızca bir kısmını karşılıyor").
--
-- ⚠️ ÖNEMLİ — BU DOSYA TEK SEFERLİK BİR ALTER TABLE'DIR, schema.sql'deki
-- diğer bloklar gibi `CREATE TABLE IF NOT EXISTS` DEĞİLDİR. SQLite
-- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` SÖZ DİZİMİNİ DESTEKLEMEZ — bu
-- yüzden bu dosyayı bir veritabanına İKİNCİ KEZ çalıştırmak "duplicate column
-- name" hatasıyla GÜVENLİ ŞEKİLDE BAŞARISIZ OLUR (veriyi bozmaz, yalnızca
-- hata verir) — bu kabul edilebilir/beklenen bir davranıştır, migration'ları
-- yalnızca BİR KEZ uygulayın. Yeni (fresh) kurulumlar bu sütunu zaten
-- schema.sql'in leads tanımının İÇİNDE buluyor, bu dosyaya ihtiyaç duymuyor.
--
-- VAR OLAN bir veritabanına uygulamak için (yalnızca BİR KEZ):
--
--   npx wrangler d1 execute veraliq-portal-db --remote --file=migrations/0002_leads_customer_link.sql
--
-- Uygulamadan önce ÖNERİLEN: bir yedek alın (bkz. scripts/backup-d1.sh) —
-- bu, herhangi bir ALTER TABLE öncesi genel bir iyi pratiktir, bu migration
-- özelinde bilinen bir risk olduğu için değil.

ALTER TABLE leads ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_customer ON leads(customer_id);
