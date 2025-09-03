#!/usr/bin/env bash
set -euo pipefail

# One-click installer/updater for DreamScribe using Docker Compose.
# - Downloads latest compose files from GitHub
# - Ensures a production config exists (creates from example if missing)
# - Optionally sets PCAS address/event type
# - Pulls latest GHCR image and starts containers

REPO_RAW_BASE="https://raw.githubusercontent.com/soaringjerry/DreamScribe/main"

INSTALL_DIR="${INSTALL_DIR:-/opt/dreamscribe}"
DEV="false"
HTTP_PORT="${HTTP_PORT:-8080}"
PCAS_ADDRESS="${PCAS_ADDRESS:-}"
EVENT_TYPE="${EVENT_TYPE:-}"

usage() {
  cat <<EOF
Usage: install-or-update.sh [--dir PATH] [--dev] [--port N] [--pcas HOST:PORT] [--event-type TYPE]

Options:
  --dir PATH         Install directory (default: /opt/dreamscribe)
  --dev              Enable auto-update via Watchtower overlay
  --port N           Host port to expose (default: 8080)
  --pcas HOST:PORT   Set pcas.address in config
  --event-type TYPE  Set pcas.eventType in config

Environment overrides:
  INSTALL_DIR, PCAS_ADDRESS, EVENT_TYPE

Examples:
  sudo bash -c "$(curl -fsSL $REPO_RAW_BASE/scripts/install-or-update.sh)" -- --dir /opt/dreamscribe --pcas localhost:50051
  PCAS_ADDRESS=10.0.0.5:9090 HTTP_PORT=18080 bash install-or-update.sh --dev
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      INSTALL_DIR="$2"; shift 2;;
    --dev)
      DEV="true"; shift;;
    --port)
      HTTP_PORT="$2"; shift 2;;
    --pcas)
      PCAS_ADDRESS="$2"; shift 2;;
    --event-type)
      EVENT_TYPE="$2"; shift 2;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown option: $1" >&2; usage; exit 1;;
  esac
done

echo "Installing/Updating DreamScribe into: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/configs"

echo "Downloading compose files..."
curl -fsSL "$REPO_RAW_BASE/docker-compose.yml" -o "$INSTALL_DIR/docker-compose.yml"
curl -fsSL "$REPO_RAW_BASE/docker-compose.dev.yml" -o "$INSTALL_DIR/docker-compose.dev.yml" || true

CONFIG_PROD="$INSTALL_DIR/configs/config.production.yaml"
if [[ ! -f "$CONFIG_PROD" ]]; then
  echo "Creating production config from example..."
  curl -fsSL "$REPO_RAW_BASE/configs/config.example.yaml" -o "$CONFIG_PROD"
fi

patch_yaml_value() {
  local key="$1" value="$2" file="$3"
  if command -v yq >/dev/null 2>&1; then
    tmp=$(mktemp)
    yq e ".$key = \"$value\"" "$file" > "$tmp" && mv "$tmp" "$file"
  else
    # sed fallback for simple key: value pairs under pcas:
    # Assumes lines like: key: "..."
    sed -i.bak -E "s|(${key}: \").*(\")|\\1${value}\\2|" "$file" || true
  fi
}

if [[ -n "$PCAS_ADDRESS" ]]; then
  if [[ "$PCAS_ADDRESS" != *:* ]]; then
    echo "Warning: --pcas provided without port. Defaulting to :50051" >&2
    PCAS_ADDRESS="$PCAS_ADDRESS:50051"
  fi
  echo "Setting pcas.address=$PCAS_ADDRESS"
  patch_yaml_value "pcas.address" "$PCAS_ADDRESS" "$CONFIG_PROD"
fi

if [[ -n "$EVENT_TYPE" ]]; then
  echo "Setting pcas.eventType=$EVENT_TYPE"
  patch_yaml_value "pcas.eventType" "$EVENT_TYPE" "$CONFIG_PROD"
fi

echo "Pulling latest image and starting containers..."
pushd "$INSTALL_DIR" >/dev/null
# Write .env for compose variable substitution
echo "HTTP_PORT=$HTTP_PORT" > .env
if [[ "$DEV" == "true" && -f "docker-compose.dev.yml" ]]; then
  docker compose -f docker-compose.yml -f docker-compose.dev.yml pull
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
else
  docker compose -f docker-compose.yml pull
  docker compose -f docker-compose.yml up -d
fi
popd >/dev/null

echo "Success. DreamScribe is up. Visit: http://localhost:8080"
