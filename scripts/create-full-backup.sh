#!/usr/bin/env bash
# VERALIQ tam yedek paketi oluşturucu (65 maddelik master promptun 53-54.
# maddeleri). Kaynak kod + şema + migration'lar + config örnekleri +
# dokümantasyon + backup/restore script'lerini VERALIQ_BACKUP/ altında
# TEK bir klasörde toplar. Gerçek veritabanı YEDEĞİ (D1 export) bu script'in
# kapsamı DIŞINDA — o, Cloudflare hesap kimlik bilgisi gerektirdiği için
# worker-portal/scripts/backup-d1.sh ile SİZİN kendi bilgisayarınızdan ayrıca
# alınmalı (bu script varsa onu da VERALIQ_BACKUP/database/ altına kopyalar).
#
# Kullanım (repo kök dizininden):
#   bash scripts/create-full-backup.sh [hedef-klasör]
# Varsayılan hedef: ../VERALIQ_BACKUP-<tarih> (repo'nun BİR ÜST dizini —
# repo içine yazılmıyor ki git'e yanlışlıkla eklenmesin).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"
TS=$(date +%Y%m%d-%H%M%S)
DEST="${1:-../VERALIQ_BACKUP-$TS}"

mkdir -p "$DEST"/{source,database,migrations,config,docs,scripts,backups,deployment}

echo "Kaynak kod arşivleniyor (git HEAD, .git hariç) -> $DEST/source/"
git archive --format=tar HEAD | (mkdir -p "$DEST/source" && tar -x -C "$DEST/source")

echo "Veritabanı şeması kopyalanıyor -> $DEST/database/"
cp worker-portal/schema.sql "$DEST/database/"
cp worker-portal/seed.sql "$DEST/database/" 2>/dev/null || true
if [ -d worker-portal/backups ]; then
  cp -r worker-portal/backups/* "$DEST/database/" 2>/dev/null || true
fi

if [ -d worker-portal/migrations ]; then
  cp -r worker-portal/migrations/* "$DEST/migrations/" 2>/dev/null || true
else
  echo "(henüz migration dosyası yok — bkz. docs/DATABASE_SCHEMA.md 'Migration disiplini')" > "$DEST/migrations/README.txt"
fi

echo "Config örnekleri kopyalanıyor -> $DEST/config/ (GERÇEK SECRET YOK)"
cp worker-portal/wrangler.toml "$DEST/config/"
cat > "$DEST/config/.env.example" <<'EOF'
# VERALIQ worker-portal secret ÖRNEĞİ — gerçek değerler ASLA bu dosyaya veya
# git repo'suna yazılmaz. Gerçek secret'lar yalnızca:
#   npx wrangler secret put JWT_SECRET
#   npx wrangler secret put AGENT_SHARED_SECRET
# ile Cloudflare'a girilir (bkz. docs/DEPLOYMENT.md).
JWT_SECRET=<rastgele, uzun, gizli bir metin>
AGENT_SHARED_SECRET=<JWT_SECRET'tan FARKLI, rastgele bir metin>
EOF

echo "Dokümantasyon kopyalanıyor -> $DEST/docs/"
cp docs/*.md "$DEST/docs/" 2>/dev/null || true

echo "Backup/restore script'leri kopyalanıyor -> $DEST/scripts/"
cp worker-portal/scripts/*.sh "$DEST/scripts/" 2>/dev/null || true
cp "$0" "$DEST/scripts/" 2>/dev/null || true

echo "Deployment notları kopyalanıyor -> $DEST/deployment/"
cp DEPLOY_ADIM_ADIM.md "$DEST/deployment/" 2>/dev/null || true
cp docker-compose.yml "$DEST/deployment/" 2>/dev/null || true

cat > "$DEST/README.md" <<EOF
# VERALIQ_BACKUP — $TS

Bu klasör, VERALIQ projesinin $TS itibarıyla tam bir yedeğidir:

- source/       — git HEAD anındaki tüm kaynak kod (git geçmişi HARİÇ — tam geçmiş için GitHub/origin remote'a bakın)
- database/     — şema (schema.sql) + varsa gerçek D1 export dosyaları
- migrations/   — şema migration dosyaları (henüz yoksa not dosyası)
- config/       — wrangler.toml + .env.example (GERÇEK SECRET İÇERMEZ)
- docs/         — mimari/API/deployment/backup/security dokümantasyonu
- scripts/      — backup-d1.sh / restore-d1.sh / bu script
- deployment/   — deploy adımları, docker-compose.yml

GERÇEK secret'lar (JWT_SECRET, AGENT_SHARED_SECRET) yalnızca Cloudflare
hesabınızdaki Worker secret'ları olarak var — bu yedekte YOKTUR ve
olmamalıdır. Bu yedeği geri yüklemek için docs/DEPLOYMENT.md ve
docs/BACKUP_AND_RESTORE.md'yi izleyin.
EOF

echo ""
echo "Tamamlandı: $DEST"
du -sh "$DEST" 2>/dev/null || true
