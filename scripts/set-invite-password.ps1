$ErrorActionPreference = "Stop"
$secure = Read-Host "New invitation password" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
if ($plain.Length -lt 10) { throw "Invitation password must contain at least 10 characters." }
$sha = [Security.Cryptography.SHA256]::Create()
try { $hash = [Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($plain))).ToLowerInvariant() } finally { $sha.Dispose(); $plain = $null }
$content = Get-Content .env -ErrorAction Stop
$line = "JOBPILOT_INVITE_PASSWORD_HASH=`"$hash`""
if ($content -match '^JOBPILOT_INVITE_PASSWORD_HASH=') { $content = $content -replace '^JOBPILOT_INVITE_PASSWORD_HASH=.*$', $line } else { $content += $line }
if ($content -notmatch '^JOBPILOT_SESSION_SECRET=') {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $content += "JOBPILOT_SESSION_SECRET=`"$([Convert]::ToHexString($bytes).ToLowerInvariant())`""
}
$content | Set-Content -Encoding utf8 .env
Write-Host "Invitation password updated. Restart JobPilot."
