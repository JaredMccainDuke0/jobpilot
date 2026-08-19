$ErrorActionPreference = "Stop"
if (-not (Test-Path .env)) {
  $dataDirectory = Join-Path $env:LOCALAPPDATA "JobPilot"
  New-Item -ItemType Directory -Force -Path $dataDirectory | Out-Null
  $databasePath = (Join-Path $dataDirectory "jobpilot.db").Replace("\", "/")
  @(
    "DATABASE_URL=`"file:$databasePath`""
    "JOBPILOT_MODEL_REASONING=`"none`""
  ) | Set-Content -Encoding utf8 .env
}
npm install
npm run db:push
npm run db:seed
Write-Host "JobPilot installed. Run .\scripts\start.ps1"
