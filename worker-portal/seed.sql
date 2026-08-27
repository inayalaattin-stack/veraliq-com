-- worker-portal/seed.sql
--
-- Test/başlangıç verisi: VERALIQ admin kullanıcısı + "ABC İnşaat" örnek
-- şirketi (İmparator'un bu sabahki isteği: "abc inşaat gibi bir şirket ekle
-- ve kullanıcı adı şifre belirle, örnek bir proje ekleyeceğiz").
--
-- Parola hash'leri worker-portal/auth.js'deki AYNI PBKDF2-SHA256 (100.000
-- iterasyon) algoritmasıyla, Node.js crypto.pbkdf2Sync kullanılarak ÖNCEDEN
-- üretildi (Web Crypto ile Node crypto, aynı standart PBKDF2-HMAC-SHA256
-- çıktısını üretir — bu nedenle worker çalışma zamanında da doğrulanabilir).
--
-- GİRİŞ BİLGİLERİ (yalnızca test/demo amaçlı — canlıya geçmeden önce MUTLAKA
-- değiştirin, bkz. worker-portal/README.md "Parola değiştirme" bölümü):
--   VERALIQ Admin  -> admin@veraliq.com          / Veraliq!Admin2026
--   ABC İnşaat     -> abcinsaat@veraliq.com      / Abc12345!

INSERT INTO users (id, company_id, email, password_hash, role, name, created_at)
VALUES ('usr_wfwakaizadkw', NULL, 'admin@veraliq.com',
        'pbkdf2$100000$-Ie6qA0nu8_M_0oHAFDT4A$r2v9ui55rtRNDQBCCKD9m_qJqw4DaH6zbNdtJADRNJU',
        'veraliq_admin', 'VERALIQ Admin', datetime('now'));

INSERT INTO companies (id, name, slug, plan, status, remove_branding, created_at)
VALUES ('co_swo61xr4midp', 'ABC İnşaat', 'abc-insaat', 'trial', 'active', 0, datetime('now'));

INSERT INTO users (id, company_id, email, password_hash, role, name, created_at)
VALUES ('usr_1g8iaottj7yd', 'co_swo61xr4midp', 'abcinsaat@veraliq.com',
        'pbkdf2$100000$JQjRxt9Daeqq-HWIERuBmg$33cTXWqV8gVYPG-R5dK68CodWNsbQkHXWFEWe_d2gnA',
        'company_owner', 'ABC İnşaat Yetkilisi', datetime('now'));

INSERT INTO projects (id, company_id, name, location, description, delivery_date, status, created_at, updated_at)
VALUES ('proj_udx0q7tjlgqn', 'co_swo61xr4midp', 'ABC Vadi Konutları', 'İstanbul / Başakşehir',
        'Test/demo amaçlı örnek proje.', '2027-06-01', 'selling', datetime('now'), datetime('now'));

INSERT INTO units (id, project_id, company_id, block, floor, unit_no, unit_type, gross_area, net_area, price, currency, status, created_at, updated_at) VALUES
  ('unit_zegcrxk-ziim', 'proj_udx0q7tjlgqn', 'co_swo61xr4midp', 'A', 1, 'A-101', '2+1', 115, 98, 5200000, 'TRY', 'SOLD', datetime('now'), datetime('now')),
  ('unit_8hmqi22yodjc', 'proj_udx0q7tjlgqn', 'co_swo61xr4midp', 'A', 1, 'A-102', '1+1', 75,  62, 3400000, 'TRY', 'RESERVED', datetime('now'), datetime('now')),
  ('unit_cosuiunnepxr', 'proj_udx0q7tjlgqn', 'co_swo61xr4midp', 'A', 1, 'A-103', '2+1', 115, 98, 5350000, 'TRY', 'AVAILABLE', datetime('now'), datetime('now')),
  ('unit_vw3brhv2l8ii', 'proj_udx0q7tjlgqn', 'co_swo61xr4midp', 'B', 2, 'B-201', '3+1', 145, 124,6800000, 'TRY', 'AVAILABLE', datetime('now'), datetime('now')),
  ('unit_uehszzoufmvq', 'proj_udx0q7tjlgqn', 'co_swo61xr4midp', 'B', 2, 'B-202', '2+1', 115, 98, 5250000, 'TRY', 'SOLD', datetime('now'), datetime('now'));
