param(
  [string]$Dir = "$HOME/dreamscribe",
  [switch]$Dev,
  [int]$Port = 8080,
  [string]$PCASAddress = "",
  [string]$EventType = "",
  [string]$TranslateType = "",
  [string]$SummarizeType = "",
  [string]$ChatType = "",
  [string]$UserId = "default-user",
  [string]$AdminToken = "",
  [switch]$Interactive,
  [switch]$Update
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

function Write-ConfigYaml {
  param(
    [string]$Path,
    [string]$Addr,
    [string]$ET,
    [string]$TrET,
    [string]$SmET,
    [string]$ChET,
    [string]$Uid
  )
  $yaml = @"
server:
  host: "0.0.0.0"
  port: "8080"
pcas:
  address: "$Addr"
  eventType: "${ET}"
  translateEventType: "${TrET}"
  summarizeEventType: "${SmET}"
  chatEventType: "${ChET}"
user:
  id: "${Uid}"
"@
  Set-Content -Path $Path -Value $yaml -Encoding UTF8
}

if ($Interactive -and -not $Update) {
  $modify = 'N'
  if (Test-Path $Config) {
    $modify = Read-Host "Detected existing config at $Config. Modify it? (y/N)"
  } else {
    $modify = 'Y'
  }
  if ($modify -match '^[Yy]') {
    Write-Host 'Running interactive configuration wizard...' -ForegroundColor Cyan
    if (-not $PCASAddress) { $PCASAddress = Read-Host 'PCAS address (host:port) [localhost:50051]' ; if (-not $PCASAddress) { $PCASAddress = 'localhost:50051' } }
    if (-not $EventType) { $EventType = Read-Host 'Transcribe eventType [capability.streaming.transcribe.v1]' ; if (-not $EventType) { $EventType = 'capability.streaming.transcribe.v1' } }
    if (-not $TranslateType) { $TranslateType = Read-Host 'Translate eventType [capability.streaming.translate.v1]' ; if (-not $TranslateType) { $TranslateType = 'capability.streaming.translate.v1' } }
    if (-not $SummarizeType) { $SummarizeType = Read-Host 'Summarize eventType [capability.streaming.summarize.v1]' ; if (-not $SummarizeType) { $SummarizeType = 'capability.streaming.summarize.v1' } }
    if (-not $ChatType) { $ChatType = Read-Host 'Chat eventType [capability.streaming.chat.v1]' ; if (-not $ChatType) { $ChatType = 'capability.streaming.chat.v1' } }
    $uidIn = Read-Host ("User ID [{0}]" -f $UserId)
    if ($uidIn) { $UserId = $uidIn }
    $portIn = Read-Host ("Host HTTP port to expose [{0}]" -f $Port)
    if ($portIn) { $Port = [int]$portIn }
    $admIn = Read-Host ("PCAS admin token (optional) [{0}]" -f $AdminToken)
    if ($admIn) { $AdminToken = $admIn }
    Write-Host ('Writing config to {0} ...' -f $Config) -ForegroundColor Yellow
    Write-ConfigYaml -Path $Config -Addr $PCASAddress -ET $EventType -TrET $TranslateType -SmET $SummarizeType -ChET $ChatType -Uid $UserId
  } else {
    Write-Host ("Keeping existing configuration file: {0}" -f $Config) -ForegroundColor Cyan
  }
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
if ($TranslateType) {
  Write-Host "Setting pcas.translateEventType=$TranslateType" -ForegroundColor Green
  (Get-Content $Config) -replace 'translateEventType:\s*".*"', "translateEventType: \"$TranslateType\"" | Set-Content $Config -Encoding UTF8
}
if ($SummarizeType) {
  Write-Host "Setting pcas.summarizeEventType=$SummarizeType" -ForegroundColor Green
  (Get-Content $Config) -replace 'summarizeEventType:\s*".*"', "summarizeEventType: \"$SummarizeType\"" | Set-Content $Config -Encoding UTF8
}
if ($ChatType) {
  Write-Host "Setting pcas.chatEventType=$ChatType" -ForegroundColor Green
  (Get-Content $Config) -replace 'chatEventType:\s*".*"', "chatEventType: \"$ChatType\"" | Set-Content $Config -Encoding UTF8
}
if ($UserId) {
  Write-Host "Setting user.id=$UserId" -ForegroundColor Green
  (Get-Content $Config) -replace 'id:\s*".*"', "id: \"$UserId\"" | Set-Content $Config -Encoding UTF8
}

Push-Location $Dir
# Write .env for compose variable substitution
$envFile = (Join-Path $Dir '.env')
if ((Test-Path $envFile) -and -not $PSBoundParameters.ContainsKey('Port') -and -not $PSBoundParameters.ContainsKey('AdminToken')) {
  Write-Host 'Preserving existing .env' -ForegroundColor Cyan
} else {
  "HTTP_PORT=$Port" | Set-Content -Path $envFile -Encoding UTF8
  if ($AdminToken) {
    Add-Content -Path $envFile -Value "PCAS_ADMIN_TOKEN=$AdminToken"
  }
}
$forceRecreate = $false
if ($PSBoundParameters.ContainsKey('AdminToken') -or $PSBoundParameters.ContainsKey('Port')) { $forceRecreate = $true }

if ($Dev -and (Test-Path (Join-Path $Dir 'docker-compose.dev.yml'))) {
  docker compose -f docker-compose.yml -f docker-compose.dev.yml pull
  if ($Update -or $forceRecreate) { docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans }
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --remove-orphans
} else {
  docker compose -f docker-compose.yml pull
  if ($Update -or $forceRecreate) { docker compose -f docker-compose.yml down --remove-orphans }
  docker compose -f docker-compose.yml up -d --remove-orphans
}
Pop-Location

$portVal = $Port
Write-Host ("Success. DreamScribe is up. Visit: http://localhost:{0}" -f $portVal) -ForegroundColor Cyan
