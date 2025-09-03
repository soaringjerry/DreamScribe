param(
  [string]$Dir = "$HOME/dreamscribe",
  [switch]$Dev,
  [int]$Port = 8080,
  [string]$PCASAddress = "",
  [string]$EventType = ""
)

$ErrorActionPreference = 'Stop'

function Download-File {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$true)][string]$OutFile
  )
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $OutFile
}

$Base = 'https://raw.githubusercontent.com/soaringjerry/DreamScribe/main'

Write-Host "Installing/Updating DreamScribe into: $Dir" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Dir 'configs') | Out-Null

Write-Host 'Downloading compose files...' -ForegroundColor Cyan
Download-File -Url "$Base/docker-compose.yml" -OutFile (Join-Path $Dir 'docker-compose.yml')
try { Download-File -Url "$Base/docker-compose.dev.yml" -OutFile (Join-Path $Dir 'docker-compose.dev.yml') } catch {}

$Config = Join-Path $Dir 'configs/config.production.yaml'
if (-not (Test-Path $Config)) {
  Write-Host 'Creating production config from example...' -ForegroundColor Yellow
  Download-File -Url "$Base/configs/config.example.yaml" -OutFile $Config
}

if ($PCASAddress) {
  if ($PCASAddress -notmatch ':') {
    Write-Warning 'PCAS address missing port. Defaulting to :50051'
    $PCASAddress = "$PCASAddress:50051"
  }
  Write-Host "Setting pcas.address=$PCASAddress" -ForegroundColor Green
  (Get-Content $Config) -replace 'address:\s*".*"', "address: \"$PCASAddress\"" | Set-Content $Config -Encoding UTF8
}
if ($EventType) {
  Write-Host "Setting pcas.eventType=$EventType" -ForegroundColor Green
  (Get-Content $Config) -replace 'eventType:\s*".*"', "eventType: \"$EventType\"" | Set-Content $Config -Encoding UTF8
}

Push-Location $Dir
# Write .env for compose variable substitution
Set-Content -Path (Join-Path $Dir '.env') -Value "HTTP_PORT=$Port" -Encoding UTF8
if ($Dev -and (Test-Path (Join-Path $Dir 'docker-compose.dev.yml'))) {
  docker compose -f docker-compose.yml -f docker-compose.dev.yml pull
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
} else {
  docker compose -f docker-compose.yml pull
  docker compose -f docker-compose.yml up -d
}
Pop-Location

Write-Host 'Success. DreamScribe is up. Visit: http://localhost:8080' -ForegroundColor Cyan
