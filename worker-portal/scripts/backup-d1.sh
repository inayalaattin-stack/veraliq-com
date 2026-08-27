#!/usr/bin/env bash
# VERALIQ D1 backup script — GERÇEK yedekleme, `wrangler d1 export` kullanır
# (Cloudflare'ın kendi, resmi export mekanizması — üçüncü parti/sahte bir
# "backup" değil). Bu sandbox ortamının Cloudflare hesap kimlik bilgisi YOK,
# bu yüzden bu script yalnızca SİZİN kendi bilgisayarınızdan çalıştırılabilir
# (bkz. docs/BACKUP_AND_RESTORE.md).
#
# ŞİFRELEME (2026-08-27 eklendi, 65 maddelik master promptun yedekleme
# mimarisi maddesi): `VERALIQ_BACKUP_PASSPHRASE` ortam değişkeni SETLİYSE,
# yedek AES-256-CBC + PBKDF2 ile (openssl, üçüncü parti bağımlılık yok, her
# Linux/macOS/WSL'de hazır bulunur) şifrelenir ve şifreleme HEMEN bir
# deşifre-geri-okuma turuyla doğrulanır — "şifreledim" demek yetmez, GERÇEKTEN
# geri açılabildiği kanıtlanmalı (bkz. docs/BACKUP_AND_RESTORE.md'deki "asla
# doğrulanmamış bir yedeğe güvenme" ilkesi). Passphrase KESİNLİKLE bu script
# içine YAZILMAZ — yalnızca ortam değişkeninden okunur ya da (set değilse)
# `read -s` ile GİZLİ olarak terminalden bir kez sorulur.
#
# Kullanım (worker-portal/ dizininden):
#   bash scripts/backup-d1.sh                          # ./backups/ altına, ŞİFRESİZ
#   bash scripts/backup-d1.sh /d/yedekler               # başka bir klasöre
#   VERALIQ_BACKUP_PASSPHRASE='...' bash scripts/backup-d1.sh   # ŞİFRELİ (önerilen)
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

PASSPHRASE="${VERALIQ_BACKUP_PASSPHRASE:-}"
if [ -z "$PASSPHRASE" ] && [ -t 0 ]; then
  echo ""
  echo "Yedeği şifrelemek ister misiniz? (VERALIQ_BACKUP_PASSPHRASE ortam değişkeni set değil)"
  read -r -p "Şifrelemek için bir parola girin (boş bırakırsanız yedek ŞİFRESİZ kalır): " -s PASSPHRASE
  echo ""
fi

if [ -n "$PASSPHRASE" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "UYARI: openssl bulunamadı — yedek ŞİFRELENEMEDİ, düz metin (.sql) olarak kaldı." >&2
  else
    ENC_FILE="$OUT_FILE.enc"
    echo "Şifreleniyor (AES-256-CBC + PBKDF2) -> $ENC_FILE"
    openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -in "$OUT_FILE" -out "$ENC_FILE" -pass "pass:$PASSPHRASE"

    # ZORUNLU doğrulama turu: şifrelenmiş dosyayı HEMEN geri deşifre edip
    # orijinaliyle byte-byte karşılaştır. Bu geçmezse şifreli dosya SİLİNİR ve
    # düz metin yedek KORUNUR — "şifreli ama açılamayan" bir yedek, yedeğin
    # kendisinden daha tehlikelidir.
    DECRYPT_CHECK="$OUT_FILE.decrypt-check.tmp"
    if openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "$ENC_FILE" -out "$DECRYPT_CHECK" -pass "pass:$PASSPHRASE" 2>/dev/null \
       && cmp -s "$OUT_FILE" "$DECRYPT_CHECK"; then
      rm -f "$DECRYPT_CHECK"
      if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$ENC_FILE" > "$ENC_FILE.sha256"
      fi
      rm -f "$OUT_FILE" "$OUT_FILE.sha256"
      echo "✓ Şifreleme doğrulandı (deşifre-geri-okuma testi GEÇTİ) — düz metin yedek silindi."
      echo "Tamamlandı (ŞİFRELİ): $ENC_FILE"
      echo "Restore için: VERALIQ_BACKUP_PASSPHRASE='...' bash scripts/restore-d1.sh \"$ENC_FILE\" <test-veritabani-adi>"
      exit 0
    else
      rm -f "$ENC_FILE" "$ENC_FILE.sha256" "$DECRYPT_CHECK"
      echo "HATA: şifreleme doğrulama turu BAŞARISIZ — şifreli dosya güvenilmez olduğu için silindi." >&2
      echo "Düz metin yedek KORUNDU: $OUT_FILE" >&2
    fi
  fi
fi

echo "Tamamlandı: $OUT_FILE"
echo "Restore etmeyi test etmek için: bash scripts/restore-d1.sh \"$OUT_FILE\" <test-veritabani-adi>"
