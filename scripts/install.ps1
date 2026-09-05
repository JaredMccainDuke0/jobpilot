$ErrorActionPreference = "Stop"
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
}
npm ci
npm run db:push
Write-Host "JobPilot dependencies and database initialized. Configure public feeds, then run .\scripts\start.ps1"
