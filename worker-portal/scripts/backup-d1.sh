#!/usr/bin/env bash
# VERALIQ D1 backup script — GERÇEK yedekleme, `wrangler d1 export` kullanır
# (Cloudflare'ın kendi, resmi export mekanizması — üçüncü parti/sahte bir
# "backup" değil). Bu sandbox ortamının Cloudflare hesap kimlik bilgisi YOK,
# bu yüzden bu script yalnızca SİZİN kendi bilgisayarınızdan çalıştırılabilir
# (bkz. docs/BACKUP_AND_RESTORE.md).
#
# Kullanım (worker-portal/ dizininden):
#   bash scripts/backup-d1.sh                # ./backups/ altına yazar
#   bash scripts/backup-d1.sh /d/yedekler     # başka bir klasöre yazar
set -euo pipefail
cd "$(dirname "$0")/.."

TS=$(date +%Y%m%d-%H%M%S)
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/veraliq-portal-db-$TS.sql"

echo "D1 veritabanı dışa aktarılıyor -> $OUT_FILE"
npx wrangler d1 export veraliq-portal-db --remote --output "$OUT_FILE"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT_FILE" > "$OUT_FILE.sha256"
  echo "Bütünlük özeti yazıldı -> $OUT_FILE.sha256"
fi

echo "Tamamlandı: $OUT_FILE"
echo "Restore etmeyi test etmek için: bash scripts/restore-d1.sh \"$OUT_FILE\" <test-veritabani-adi>"
