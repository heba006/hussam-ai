# Hussam-Ai — إعادة تشغيل المنصة مع رابط عام مؤقت
# شغّل: powershell -ExecutionPolicy Bypass -File publish.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$rt   = Join-Path $env:LOCALAPPDATA 'Temp\hussam-deploy'
$node = Join-Path $rt 'node-v26.13.1-win-x64\node.exe'
$cf   = Join-Path $rt 'cloudflared.exe'
$out  = Join-Path $rt 'tunnel-out.log'
$err  = Join-Path $rt 'tunnel-err.log'

foreach ($f in @($node, $cf)) {
  if (-not (Test-Path $f)) { throw "ملف التشغيل مفقود: $f — أعد تثبيت بيئة النشر أولاً." }
}

# شغّل الخادم إذا لم يكن يعمل
if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden
}

# شغّل نفق Cloudflare إذا لم يكن يعمل
if (-not (Get-Process -Name cloudflared -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $cf `
    -ArgumentList 'tunnel --url http://localhost:3000 --no-autoupdate' `
    -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden
}

# انتظر الرابط ثم احفظه وافتحه
$url = $null
for ($i = 0; $i -lt 45; $i++) {
  $text = (Get-Content $out, $err -Raw -ErrorAction SilentlyContinue) -join "`n"
  $m = [regex]::Match($text, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
  if ($m.Success) { $url = $m.Value; break }
  Start-Sleep -Seconds 1
}

if (-not $url) { throw 'لم يتم الحصول على الرابط. تحقق من اتصال الإنترنت ثم أعد المحاولة.' }
$linkFile = Join-Path $root 'public-link.txt'
$url | Set-Content -Path $linkFile -Encoding UTF8
Write-Host "رابط المنصة: $url"
Write-Host "محفوظ أيضاً في: $linkFile"
Start-Process $url
