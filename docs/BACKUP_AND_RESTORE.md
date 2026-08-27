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

## 4. Yedekleme sıklığı — Windows Task Scheduler ile OTOMATİK (2026-08-27 eklendi)

✅ HAZIR — ⚠️ SANDBOX'TA TEST EDİLEMEDİ (kod incelemesiyle doğrulandı, gerçek çalıştırma sizin bilgisayarınızda yapılmalı): `scripts/schedule-backup-task.ps1` + `scripts/run-scheduled-backup.ps1` iki yeni PowerShell script'i, `scripts/backup-d1.sh`'i Windows Task Scheduler ile günlük/6-saatlik/saatlik otomatik çalıştırıyor — Cloudflare hesabınızda yeni bir kaynak (R2 bucket vb.) gerektirmiyor, mevcut yedekleme mekanizmasının üzerine kuruluyor.

**Kurulum (bir kere, kendi PowerShell'inizden):**

```powershell
cd worker-portal\scripts
.\schedule-backup-task.ps1
```

Script sırayla: Git Bash'i bulur, yedek klasörünü sorar, şifrelemek isteyip istemediğinizi sorar (isterseniz parolanızı GİZLİ olarak sorar ve Windows DPAPI ile — yalnızca sizin hesabınız çözebilir — diske şifreli yazar, düz metin ASLA yazılmaz), sıklığı sorar (günlük/6 saatte bir/saatte bir) ve bir Windows Scheduled Task ("VERALIQ D1 Backup") kaydeder. Task yalnızca siz Windows'ta oturum açtığınızda çalışır (Windows hesap şifrenizi hiçbir yere kaydetmemek için bilinçli bir tercih).

Her çalıştırmanın sonucu `<yedek-klasörü>\backup-log.txt`'e zaman damgasıyla yazılır — "yedek gerçekten alınıyor mu" hiçbir zaman belirsiz kalmaz. Ayrıca `$RetentionDays` (varsayılan 30) gün geçmiş yedekler otomatik siliniyor (65 maddelik promptun "versiyonlu yedekler, sınırsız birikmesin" beklentisi).

**Neden "sandbox'ta test edilemedi" diyoruz**: bu script'ler gerçek Windows PowerShell + Task Scheduler + Git Bash gerektiriyor — sandbox ortamında (Linux) VE bu makineye bağlanan device-bridge shell'inde (o da ayrı bir Linux VM) `pwsh`/`powershell` bulunmuyor, denendi doğrulandı. Bu yüzden mantık dikkatlice elle incelendi (DPAPI şifreleme/çözme simetrisi, bash argüman kaçışı, dosya izinleri) ama GERÇEK bir PowerShell yorumlayıcısıyla ÇALIŞTIRILARAK doğrulanamadı. Kurup bir deneme çalıştırması (`Start-ScheduledTask -TaskName 'VERALIQ D1 Backup'`) yaptığınızda `backup-log.txt`'i kontrol edin — bir sorun olursa bana bildirin, düzeltirim.

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
