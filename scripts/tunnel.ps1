$ErrorActionPreference = "Stop"
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw "npx is required." }
Write-Host "JobPilot must already be running at http://localhost:3000"
Write-Host "Starting an HTTPS tunnel. Stop with Ctrl+C."
npx --yes ngrok http 3000
