#!/usr/bin/env bash
# Veraliq — 3-2-1 backup template
#
# Real 3-2-1 backup: 3 copies of data, on 2 different storage media/
# providers, with 1 copy off-site (different region/provider than
# production). This script is a STARTING TEMPLATE — you must fill in
# your own bucket names/credentials and schedule it yourself (cron,
# GitHub Actions cron, or your host's scheduled jobs). It does not run
# on its own; nothing runs "forever without intervention" — someone on
# your team owns this job and gets alerted if it fails.
#
# Required environment variables (set as CI/CD or server secrets —
# never commit real credentials to this file or to git):
#   SOURCE_DIR            path or DB dump to back up
#   R2_BUCKET             Cloudflare R2 bucket name   (copy 1 - cloud A)
#   S3_BUCKET             AWS S3 bucket name           (copy 2 - cloud B, off-site region)
#   BACKUP_ENCRYPTION_KEY 32-byte key for AES-256 encryption at rest

set -euo pipefail

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
ARCHIVE_NAME="veraliq-backup-${TIMESTAMP}.tar.gz"
ENCRYPTED_NAME="${ARCHIVE_NAME}.enc"

: "${SOURCE_DIR:?Set SOURCE_DIR}"
: "${R2_BUCKET:?Set R2_BUCKET}"
: "${S3_BUCKET:?Set S3_BUCKET}"
: "${BACKUP_ENCRYPTION_KEY:?Set BACKUP_ENCRYPTION_KEY}"

echo "[1/5] Archiving ${SOURCE_DIR} ..."
tar -czf "/tmp/${ARCHIVE_NAME}" -C "${SOURCE_DIR}" .

echo "[2/5] Encrypting with AES-256 ..."
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "/tmp/${ARCHIVE_NAME}" \
  -out "/tmp/${ENCRYPTED_NAME}" \
  -pass "pass:${BACKUP_ENCRYPTION_KEY}"

echo "[3/5] Uploading copy A (Cloudflare R2) ..."
# Requires: wrangler or rclone configured with R2 credentials
rclone copy "/tmp/${ENCRYPTED_NAME}" "r2:${R2_BUCKET}/backups/"

echo "[4/5] Uploading copy B (AWS S3, off-site region) ..."
# Requires: aws-cli configured with a role scoped only to this bucket
aws s3 cp "/tmp/${ENCRYPTED_NAME}" "s3://${S3_BUCKET}/backups/"

echo "[5/5] Cleaning up local temp files ..."
rm -f "/tmp/${ARCHIVE_NAME}" "/tmp/${ENCRYPTED_NAME}"

echo "Backup complete: ${ENCRYPTED_NAME}"
echo "Copy 3 (production/live data) remains on the primary system by definition."
echo "Reminder: test restoring from a backup on a real schedule — an untested backup is not a backup."
