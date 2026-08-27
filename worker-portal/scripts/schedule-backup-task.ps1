# worker-portal/scripts/schedule-backup-task.ps1
#
# TEK SEFERLİK KURULUM script'i — VERALIQ D1 yedeklerini kendi bilgisayarınızda
# (Windows Task Scheduler ile) OTOMATİK/ZAMANLANMIŞ hale getirir (65 maddelik
# master promptun 24, 27, 57. maddeleri: "saatlik/günlük otomatik yedekleme").
#
# NEDEN BU SCRIPT SANDBOX'TAN ÇALIŞTIRILAMIYOR / SİZİN ÇALIŞTIRMANIZ GEREKİYOR:
# Bu, gerçek Windows Task Scheduler'a ve SİZİN Cloudflare oturumunuza
# (wrangler login) ihtiyaç duyar — ikisi de yalnızca sizin kendi
# bilgisayarınızda, kendi PowerShell oturumunuzda mevcut. Ayrıca yedek
# şifreleme parolanızı YALNIZCA SİZ girmelisiniz — bu script, parolayı
# sizin bilgisayarınızda Windows DPAPI ile (yalnızca SİZİN Windows
# hesabınız çözebilir, başka hiçbir kullanıcı/bilgisayar okuyamaz) şifreli
# olarak saklar; parola hiçbir zaman düz metin olarak diske yazılmaz, hiçbir
# zaman bu kod içine gömülmez, hiçbir zaman bana (Claude'a) gönderilmez.
#
# KULLANIM (kendi PowerShell'inizden, veraliq-com\worker-portal\scripts\ içinden):
#   .\schedule-backup-task.ps1
#
# Ne yapar:
#   1. Git for Windows'un bash.exe'sini bulur (backup-d1.sh'i çalıştırmak için).
#   2. Yedeklerin nereye yazılacağını sorar (varsayılan: worker-portal\backups).
#   3. Yedeği şifrelemek isteyip istemediğinizi sorar — isterseniz parolanızı
#      GİZLİ olarak (ekranda görünmeden) sorar ve DPAPI ile şifreli olarak
#      %USERPROFILE%\.veraliq\backup-passphrase.dat dosyasına yazar (yalnızca
#      sizin Windows hesabınız bu dosyayı okuyabilir — icacls ile kısıtlanır).
#   4. Ne sıklıkla çalışacağını sorar (varsayılan: her gün saat 03:00).
#   5. Bir Windows Scheduled Task kaydeder — bu task, run-scheduled-backup.ps1'i
#      çalıştırır (o da backup-d1.sh'i çağırır ve eski yedekleri temizler).
#
# Not: Task, "yalnızca siz oturum açtığınızda" çalışacak şekilde kaydedilir —
# bilgisayarınız kapalıyken veya siz oturum açmamışken ÇALIŞMAZ (bu, Windows
# hesap şifrenizi bu script'e/Task Scheduler'a saklamamak için bilinçli bir
# tercih — "her zaman çalışsın" istiyorsanız Task Scheduler arayüzünden elle
# "Run whether user is logged on or not" seçeneğini işaretleyip kendi Windows
# şifrenizi Windows'un kendi diyaloğuna girebilirsiniz, bu script bunu sizin
# adınıza YAPMAZ).

$ErrorActionPreference = 'Stop'

Write-Host "=== VERALIQ — Otomatik D1 Yedekleme Kurulumu ===" -ForegroundColor Cyan
Write-Host ""

# 1) Git Bash'i bul
$bashCandidates = @(
  (Get-Command bash.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
  "$env:ProgramFiles\Git\bin\bash.exe",
  "${env:ProgramFiles(x86)}\Git\bin\bash.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

if (-not $bashCandidates) {
  Write-Host "HATA: Git Bash (bash.exe) bulunamadı. Git for Windows kurulu olmalı (zaten 'git' komutlarını çalıştırdığınız için muhtemelen kuruludur)." -ForegroundColor Red
  Write-Host "Git for Windows'u https://git-scm.com/download/win adresinden kurup tekrar deneyin." -ForegroundColor Red
  exit 1
}
$bashPath = $bashCandidates[0]
Write-Host "Bulundu: $bashPath" -ForegroundColor Green

# 2) Yedek klasörü
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$defaultBackupDir = Join-Path $repoRoot "worker-portal\backups"
$backupDir = Read-Host "Yedeklerin yazılacağı klasör [varsayılan: $defaultBackupDir]"
if ([string]::IsNullOrWhiteSpace($backupDir)) { $backupDir = $defaultBackupDir }
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Write-Host "Yedek klasörü: $backupDir" -ForegroundColor Green

# 3) Şifreleme parolası (opsiyonel, DPAPI ile şifreli saklanır)
$configDir = Join-Path $env:USERPROFILE ".veraliq"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$passFile = Join-Path $configDir "backup-passphrase.dat"

$wantsEncryption = Read-Host "Yedekleri şifrelemek ister misiniz? (önerilir) (E/h)"
if ($wantsEncryption -ne 'h' -and $wantsEncryption -ne 'H') {
  $securePass = Read-Host "Şifreleme parolanızı girin (ekranda görünmeyecek)" -AsSecureString
  # DPAPI ile şifrele (varsayılan: yalnızca BU KULLANICI + BU MAKİNE çözebilir).
  # Parola hiçbir zaman düz metin olarak diske yazılmaz.
  $encrypted = ConvertFrom-SecureString $securePass
  Set-Content -Path $passFile -Value $encrypted -Encoding ASCII
  # Dosya izinlerini yalnızca mevcut kullanıcıyla sınırla.
  icacls $passFile /inheritance:r | Out-Null
  icacls $passFile /grant:r "$($env:USERNAME):(R)" | Out-Null
  Write-Host "Parola şifreli olarak kaydedildi: $passFile (yalnızca sizin Windows hesabınız okuyabilir)" -ForegroundColor Green
} else {
  if (Test-Path $passFile) { Remove-Item $passFile -Force }
  Write-Host "Yedekler ŞİFRESİZ olacak (istediğiniz zaman bu script'i tekrar çalıştırıp şifreleme ekleyebilirsiniz)." -ForegroundColor Yellow
}

# 4) Sıklık
Write-Host ""
Write-Host "Ne sıklıkla yedek alınsın?"
Write-Host "  1) Her gün (varsayılan, saat 03:00)"
Write-Host "  2) Her 6 saatte bir"
Write-Host "  3) Her saat başı"
$freqChoice = Read-Host "Seçiminiz [1]"
if ([string]::IsNullOrWhiteSpace($freqChoice)) { $freqChoice = '1' }

$runScript = Join-Path $PSScriptRoot "run-scheduled-backup.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runScript`" -BashPath `"$bashPath`" -BackupDir `"$backupDir`" -RepoRoot `"$repoRoot`" -PassFile `"$passFile`""

switch ($freqChoice) {
  '2' { $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration ([TimeSpan]::MaxValue) }
  '3' { $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration ([TimeSpan]::MaxValue) }
  default { $trigger = New-ScheduledTaskTrigger -Daily -At 3am }
}

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName "VERALIQ D1 Backup" -Action $action -Trigger $trigger -Settings $settings -Description "VERALIQ D1 veritabanının otomatik yedeği (worker-portal/scripts/backup-d1.sh üzerinden)." -Force | Out-Null

Write-Host ""
Write-Host "✓ Zamanlanmış görev kaydedildi: 'VERALIQ D1 Backup' (Task Scheduler'da görünür)." -ForegroundColor Green
Write-Host "  Not: yalnızca siz Windows'ta oturum açtığınızda çalışır." -ForegroundColor Yellow
Write-Host "  Log dosyası: $backupDir\backup-log.txt"
Write-Host ""
Write-Host "Hemen bir deneme çalıştırması yapmak için:"
Write-Host "  Start-ScheduledTask -TaskName 'VERALIQ D1 Backup'"
