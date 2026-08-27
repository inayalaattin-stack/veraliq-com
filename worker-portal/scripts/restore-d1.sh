#!/usr/bin/env bash
# VERALIQ D1 restore script.
#
# DİKKAT: hedef veritabanının verisini DEĞİŞTİRİR/ÜZERİNE YAZAR. Canlı
# (production) veritabanında ASLA doğrudan test etmeyin — önce ayrı, boş bir
# test veritabanı oluşturup oraya restore edin:
#
#   npx wrangler d1 create veraliq-portal-db-restore-test
#   bash scripts/restore-d1.sh backups/veraliq-portal-db-XXXXXXXX-XXXXXX.sql veraliq-portal-db-restore-test
#   npx wrangler d1 execute veraliq-portal-db-restore-test --remote --command "SELECT COUNT(*) FROM companies;"
#   npx wrangler d1 execute veraliq-portal-db-restore-test --remote --command "SELECT COUNT(*) FROM units;"
#   (satır sayıları yedek alınan andaki ile eşleşiyor mu kontrol edin)
#
# Bu adım BACKUP_AND_RESTORE.md'de "restore testi" olarak tarif edilen
# adımdır — yalnızca "yedek dosyası var" demek yeterli değildir, gerçekten
# geri yüklenebildiği DOĞRULANMALIDIR.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_FILE="${1:?Kullanım: restore-d1.sh <backup.sql> [database-adi]}"
DB_NAME="${2:-veraliq-portal-db}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "HATA: $BACKUP_FILE bulunamadı" >&2
  exit 1
fi

if [ -f "$BACKUP_FILE.sha256" ] && command -v sha256sum >/dev/null 2>&1; then
  echo "Bütünlük kontrol ediliyor..."
  sha256sum -c "$BACKUP_FILE.sha256"
fi

echo "UYARI: bu işlem '$DB_NAME' adlı D1 veritabanının verisini geri yükleyecek."
read -r -p "Devam etmek istediğinize emin misiniz? (evet/hayır): " CONFIRM
if [ "$CONFIRM" != "evet" ]; then
  echo "İptal edildi."
  exit 1
fi

npx wrangler d1 execute "$DB_NAME" --remote --file="$BACKUP_FILE"

echo "Restore tamamlandı. Doğrulama önerisi:"
echo "  npx wrangler d1 execute $DB_NAME --remote --command \"SELECT COUNT(*) FROM companies;\""
echo "  npx wrangler d1 execute $DB_NAME --remote --command \"SELECT COUNT(*) FROM units;\""
