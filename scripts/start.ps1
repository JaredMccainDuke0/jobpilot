$ErrorActionPreference = "Stop"
if (-not (Test-Path .env)) { throw "Missing .env. Run .\scripts\install.ps1 first." }
npm run dev
