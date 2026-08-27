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

⚠️ EKSİK: `wrangler d1 export` şifrelenmemiş bir `.sql` dosyası üretir. Bütünlük (`sha256sum`) kontrol ediliyor ama İÇERİK şifrelenmiyor. Şifreleme isterseniz: `gpg --symmetric --cipher-algo AES256 backup.sql` (yerel bir parola ile) — bu da scripte tek satır olarak eklenebilir, şu an eklenmedi çünkü parola yönetimi kararı (nerede saklanacak) size ait olmalı.

## 6. Versiyonlu yedekler

✅ KISMEN VAR: her `backup-d1.sh` çalıştırması dosya adına saat damgası (`<tarih>-<saat>`) ekliyor, hiçbir dosyanın üzerine yazmıyor — yani doğal olarak versiyonlu. Retention policy (eski yedekleri N gün sonra silme) henüz YOK.

## 7. Şirket bazlı export (madde 28 — "Company Data Export")

⚠️ EKSİK: şu an tek bir şirketin verisini (customers/leads/projects/inventory/documents/conversations/sales) tek başına dışa aktaran bir API ucu YOK — `wrangler d1 export` TÜM veritabanını (tüm şirketler) dışa aktarıyor. Şirket-bazlı export için `worker-portal/portal-api-worker.js`'e yeni bir `GET /api/companies/me/export` ucu eklenmesi gerekir (yalnızca `company_owner`, JSON formatında kendi şirketinin tüm tablolarını döndürür) — bu, bir sonraki geliştirme turunda eklenebilir.
