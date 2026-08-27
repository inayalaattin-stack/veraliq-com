# worker-portal/scripts/run-scheduled-backup.ps1
#
# Windows Task Scheduler tarafından çağrılan asıl yedekleme script'i (bkz.
# schedule-backup-task.ps1 — bu dosyayı ELLE ÇALIŞTIRMANIZA gerek yok, kurulum
# script'i onu sizin için zamanlar). Şunları yapar:
#   1. (varsa) DPAPI ile şifrelenmiş yedek parolasını çözer — YALNIZCA bu
#      process'in belleğinde, hiçbir zaman diske/log'a yazılmaz.
#   2. worker-portal/scripts/backup-d1.sh'i Git Bash üzerinden çalıştırır.
#   3. Sonucu (başarı/hata) $BackupDir\backup-log.txt'e zaman damgasıyla ekler
#      — böylece "yedek gerçekten alınıyor mu" sessizce belirsiz kalmaz.
#   4. Retention: $BackupDir içindeki $RetentionDays'ten (varsayılan 30) eski
#      yedek dosyalarını siler (65 maddelik promptun "versiyonlu yedekler"
#      maddesi — sınırsız birikmesin).
param(
  [Parameter(Mandatory=$true)][string]$BashPath,
  [Parameter(Mandatory=$true)][string]$BackupDir,
  [Parameter(Mandatory=$true)][string]$RepoRoot,
  [string]$PassFile = "",
  [int]$RetentionDays = 30
)

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$logFile = Join-Path $BackupDir "backup-log.txt"
function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $logFile -Value $line
}

Log "Yedekleme başlatıldı."

try {
  $env:VERALIQ_BACKUP_PASSPHRASE = $null
  if ($PassFile -and (Test-Path $PassFile)) {
    $encrypted = Get-Content -Path $PassFile -Raw
    $secure = ConvertTo-SecureString $encrypted
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
      $env:VERALIQ_BACKUP_PASSPHRASE = $plain
    } finally {
      [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    Log "Şifreleme parolası çözüldü (yalnızca bellekte, diske yazılmadı)."
  } else {
    Log "Parola dosyası yok — yedek ŞİFRESİZ alınacak."
  }

  $worktreePortal = Join-Path $RepoRoot "worker-portal"
  # backup-d1.sh zaten "$(dirname "$0")/.." ile worker-portal'a cd ediyor —
  # burada doğrudan scripts/backup-d1.sh yolunu bash'e veriyoruz.
  $scriptPath = Join-Path $worktreePortal "scripts\backup-d1.sh"

  # -lc (login shell + komut) kullanıyoruz ki .bash_profile/.bashrc'deki PATH
  # (node/npx/openssl için) yüklensin. POSIX tek-tırnak kaçışı (' -> '\'')
  # ile yol içindeki olası boşluk/tek-tırnak karakterlerine karşı güvenli.
  $escScript = $scriptPath -replace "'", "'\''"
  $escDir = $BackupDir -replace "'", "'\''"
  $bashCmd = "bash '$escScript' '$escDir'"
  $output = & $BashPath -lc $bashCmd 2>&1
  $exitCode = $LASTEXITCODE
  $output | ForEach-Object { Log "  $_" }

  if ($exitCode -eq 0) {
    Log "✓ Yedekleme BAŞARILI."
  } else {
    Log "✗ Yedekleme BAŞARISIZ (exit code: $exitCode)."
  }
} catch {
  Log "✗ HATA: $($_.Exception.Message)"
} finally {
  $env:VERALIQ_BACKUP_PASSPHRASE = $null
}

# Retention: eski yedekleri temizle
try {
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  $old = Get-ChildItem -Path $BackupDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^veraliq-portal-db-' -and $_.LastWriteTime -lt $cutoff }
  foreach ($f in $old) {
    Remove-Item $f.FullName -Force
    Log "Retention: $($f.Name) silindi ($RetentionDays günden eski)."
  }
} catch {
  Log "Retention temizliği sırasında hata: $($_.Exception.Message)"
}

Log "Yedekleme turu tamamlandı."
