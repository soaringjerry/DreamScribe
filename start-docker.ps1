param(
  [switch]$Dev
)

$ErrorActionPreference = 'Stop'

Write-Host "Starting DreamScribe via Docker Compose..." -ForegroundColor Cyan

# Ensure we're in the repo root for compose files
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '.')
Set-Location $repoRoot

# Ensure config exists
$configDir = Join-Path $repoRoot 'configs'
$prodConfig = Join-Path $configDir 'config.production.yaml'
$exampleConfig = Join-Path $configDir 'config.example.yaml'

if (-not (Test-Path $prodConfig)) {
  Write-Host "configs/config.production.yaml not found. Creating from example..." -ForegroundColor Yellow
  if (-not (Test-Path $exampleConfig)) {
    throw "Example config not found at $exampleConfig"
  }
  Copy-Item $exampleConfig $prodConfig -Force
  Write-Host "Please edit configs/config.production.yaml to set your PCAS address." -ForegroundColor Yellow
}

# Choose compose file(s)
if ($Dev) {
  Write-Host "Dev mode enabled: watchtower auto-update is active." -ForegroundColor Green
  docker compose -f docker-compose.yml -f docker-compose.dev.yml pull
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
} else {
  docker compose -f docker-compose.yml pull
  docker compose -f docker-compose.yml up -d
}

Write-Host "DreamScribe is up. Visit http://localhost:8080" -ForegroundColor Cyan
