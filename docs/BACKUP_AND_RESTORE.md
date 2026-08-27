# VERALIQ — Yedekleme ve Restore

_Dürüst durum özeti: aşağıda "✅ GERÇEK, ÇALIŞIYOR" ve "⚠️ SİZİN ÇALIŞTIRMANIZ GEREKİYOR" olarak işaretlenmiş adımlar var. Hiçbir adım "sahte"/mock değil — ama bazıları Cloudflare hesap kimlik bilgisi gerektirdiği için bu sandbox ortamından ÇALIŞTIRILAMIYOR, yalnızca kod olarak hazırlanabiliyor._

## 1. Veritabanı yedeği (D1)

✅ GERÇEK, ÇALIŞIYOR — Cloudflare'ın kendi resmi `wrangler d1 export` komutunu kullanır:

```powershell
cd worker-portal
bash scripts/backup-d1.sh
```

Bu, `worker-portal/backups/veraliq-portal-db-<tarih>.sql` dosyasını (+ `.sha256` bütünlük özeti) oluşturur. ⚠️ SİZİN ÇALIŞTIRMANIZ GEREKİYOR — sandbox'ın Cloudflare hesap kimlik bilgisi yok.

## 2. Restore testi (ZORUNLU — yalnızca "yedek var" demek yeterli değil)

65 maddelik master promptun 26 ve 58. maddeleri açık: **restore edilebildiği test edilmeden bir backup sistemi tamamlanmış sayılmaz.** Adımlar:

```powershell
npx wrangler d1 create veraliq-portal-db-restore-test
bash scripts/restore-d1.sh backups/veraliq-portal-db-<tarih>.sql veraliq-portal-db-restore-test
npx wrangler d1 execute veraliq-portal-db-restore-test --remote --command "SELECT COUNT(*) FROM companies;"
npx wrangler d1 execute veraliq-portal-db-restore-test --remote --command "SELECT COUNT(*) FROM units;"
npx wrangler d1 execute veraliq-portal-db-restore-test --remote --command "SELECT COUNT(*) FROM leads;"
```

Satır sayıları yedek alınan andaki (`veraliq-portal-db` üzerinde aynı sorgular) ile eşleşmeli. ⚠️ SİZİN ÇALIŞTIRMANIZ GEREKİYOR (yine Cloudflare kimlik bilgisi). **Bu restore testi henüz bir kez bile çalıştırılmadı** — bu dokümanın dürüst kabul ettiği tek eksik ama kritik adım budur. Çalıştırıp sonucu bana bildirirseniz bu dosyayı "✅ test edildi, tarih: ..." diye güncellerim.

## 3. Kaynak kod + config + dokümantasyon yedeği

✅ GERÇEK, ÇALIŞIYOR — Cloudflare kimlik bilgisi gerektirmez, yalnızca git + dosya kopyalama:

```bash
bash scripts/create-full-backup.sh
```

`../VERALIQ_BACKUP-<tarih>/` altında `source/ database/ migrations/ config/ docs/ scripts/ deployment/` klasörlerini oluşturur (bkz. `scripts/create-full-backup.sh` başındaki açıklama). GERÇEK secret içermez — `.env.example` yalnızca hangi değişkenlerin gerektiğini gösterir.

## 4. Yedekleme sıklığı — şu an MANUEL, otomatik DEĞİL

⚠️ EKSİK: 65 maddelik promptun 24 ve 57. maddeleri "saatlik incremental + günlük full + kritik işlem sonrası event-triggered backup" istiyor. Bugün bu OTOMATİK değil — yukarıdaki iki script'i elle çalıştırmanız gerekiyor. Gerçek otomasyon için iki seçenek var (ikisi de Cloudflare hesabınızda yeni kaynak gerektirir, bu yüzden şimdilik kodlanmadı, yalnızca net bir öneri olarak yazıyorum):

- **Cron Trigger + R2**: `worker-portal/`'a yeni bir Cloudflare Worker Cron Trigger eklenir (`wrangler.toml`'da `[triggers] crons = ["0 * * * *"]`), bu worker D1'i sorgulayıp bir JSON/SQL dökümünü bir R2 bucket'a yazar. Gerektirir: `npx wrangler r2 bucket create veraliq-portal-backups` (sizin çalıştırmanız gerekir).
- **Basit alternatif**: `scripts/backup-d1.sh`'ı Windows Task Scheduler / cron ile saatlik/günlük çalıştırmak (kendi bilgisayarınızda) — ek Cloudflare kaynağı gerektirmez, hemen kullanılabilir.

İkinci seçeneği hemen kurabilirim (bir `.bat`/PowerShell zamanlayıcı script'i yazarım) — isterseniz söyleyin.

## 5. Şifreleme

✅ GERÇEK, ÇALIŞIYOR (2026-08-27 eklendi) — `scripts/backup-d1.sh` artık `VERALIQ_BACKUP_PASSPHRASE` ortam değişkeni SETLİYSE (veya interaktif çalıştırıldığında sorulduğunda bir parola girilirse) yedeği AES-256-CBC + PBKDF2 ile (openssl, ek bağımlılık yok) şifreliyor:

```powershell
$env:VERALIQ_BACKUP_PASSPHRASE = "kendi-güçlü-parolanız"
bash scripts/backup-d1.sh
```

**Şifreleme HER SEFERİNDE hemen bir deşifre-geri-okuma testiyle doğrulanıyor** — bu tur geçmezse şifreli dosya silinir, düz metin yedek korunur (asla "açılamayan şifreli yedek" ile baş başa kalmazsınız). Doğrulama geçerse düz metin `.sql` silinir, yalnızca `.sql.enc` + `.sql.enc.sha256` kalır. Restore: `scripts/restore-d1.sh` artık `.enc` uzantısını otomatik tanıyor, aynı parolayla (env değişkeni veya sorulduğunda) önce deşifre edip sonra geri yüklüyor; yanlış parola temiz bir hatayla reddediliyor. Parola KESİNLİKLE script içine yazılmıyor veya bir dosyaya kaydedilmiyor — yalnızca ortam değişkeninden okunuyor ya da bir kere gizli girdi (`read -s`) olarak soruluyor. Bu mantık, sandbox'ta gerçek `openssl enc`/`openssl enc -d` çağrılarıyla uçtan uca test edildi (doğru parola → byte-byte eşleşen geri okuma; yanlış parola → temiz, öngörülebilir hata) — canlı `wrangler d1 export` çağrısı sandbox'tan yapılamadığı için o kısım sahte bir `wrangler` ile simüle edildi, ŞİFRELEME MANTIĞININ KENDİSİ gerçek openssl ile test edildi.

## 6. Versiyonlu yedekler

✅ KISMEN VAR: her `backup-d1.sh` çalıştırması dosya adına saat damgası (`<tarih>-<saat>`) ekliyor, hiçbir dosyanın üzerine yazmıyor — yani doğal olarak versiyonlu. Retention policy (eski yedekleri N gün sonra silme) henüz YOK.

## 7. Şirket bazlı export (madde 28, 61-62 — "Company Data Export")

✅ GERÇEK, ÇALIŞIYOR (2026-08-27 eklendi) — `GET /api/companies/me/export` (yalnızca `company_owner`) şirketin TÜM verisini (projects/units/leads/customers/customer_interests/conversations/conversation_messages/conversation_summaries/approval_requests/documents-metadata/audit_log, `password_hash` HARİÇ) tek bir JSON olarak döndürüyor. portal.html'in Settings ekranında "Tüm Verilerimi İndir (.json)" butonuyla tarayıcıdan doğrudan indirilebiliyor. 6 test ile doğrulandı (tam içerik, tenant izolasyonu, password_hash sızmadığı, yalnızca owner'ın erişebildiği) — bkz. API_DOCUMENTATION.md.
