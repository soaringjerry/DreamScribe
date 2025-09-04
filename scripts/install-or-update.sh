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
HTTP_PORT_SET="false"
PCAS_ADDRESS="${PCAS_ADDRESS:-}"
EVENT_TYPE="${EVENT_TYPE:-}"
# Optional capability-specific event types (fallback to defaults in config if empty)
TRANSLATE_EVENT_TYPE="${TRANSLATE_EVENT_TYPE:-}"
SUMMARIZE_EVENT_TYPE="${SUMMARIZE_EVENT_TYPE:-}"
CHAT_EVENT_TYPE="${CHAT_EVENT_TYPE:-}"
USER_ID="${USER_ID:-default-user}"
INTERACTIVE="false"
UPDATE_ONLY="false"

usage() {
  cat <<EOF
Usage: install-or-update.sh [--dir PATH] [--dev] [--port N] [--pcas HOST:PORT] [--event-type TYPE]
                            [--translate-type TYPE] [--summarize-type TYPE] [--chat-type TYPE]
                            [--user-id ID] [--admin-token TOKEN] [--interactive] [--update]

Options:
  --dir PATH         Install directory (default: /opt/dreamscribe)
  --dev              Enable auto-update via Watchtower overlay
  --port N           Host port to expose (default: 8080)
  --pcas HOST:PORT   Set pcas.address in config
  --event-type TYPE  Set pcas.eventType in config
  --translate-type T Set pcas.translateEventType in config
  --summarize-type T Set pcas.summarizeEventType in config
  --chat-type T      Set pcas.chatEventType in config
  --user-id ID       Set user.id in config (default: default-user)
  --admin-token T    Set PCAS_ADMIN_TOKEN env for container (optional)
  --interactive      Run interactive wizard to generate/update config
  --update           Update only: refresh compose, pull image, recreate containers; keep existing config/.env

Environment overrides:
  INSTALL_DIR, PCAS_ADDRESS, EVENT_TYPE, TRANSLATE_EVENT_TYPE, SUMMARIZE_EVENT_TYPE, CHAT_EVENT_TYPE, USER_ID, PCAS_ADMIN_TOKEN

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
      HTTP_PORT="$2"; HTTP_PORT_SET="true"; shift 2;;
    --pcas)
      PCAS_ADDRESS="$2"; shift 2;;
    --event-type)
      EVENT_TYPE="$2"; shift 2;;
    --translate-type)
      TRANSLATE_EVENT_TYPE="$2"; shift 2;;
    --summarize-type)
      SUMMARIZE_EVENT_TYPE="$2"; shift 2;;
    --chat-type)
      CHAT_EVENT_TYPE="$2"; shift 2;;
    --user-id)
      USER_ID="$2"; shift 2;;
    --admin-token)
      PCAS_ADMIN_TOKEN="$2"; shift 2;;
    --interactive|-i)
      INTERACTIVE="true"; shift;;
    --update)
      UPDATE_ONLY="true"; shift;;
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

# Helper: prompt from /dev/tty even when stdin is piped
prompt() {
  local message="$1" default="$2" var
  if [[ -t 0 ]]; then
    read -r -p "$message [$default]: " var
  else
    if [[ -e /dev/tty ]]; then
      read -r -p "$message [$default]: " var < /dev/tty
    else
      var=""
    fi
  fi
  echo "${var:-$default}"
}

write_config() {
  local path="$1"
  local server_host="0.0.0.0" server_port="8080"
  cat > "$path" <<'YAML'
server:
  host: "__SERVER_HOST__"
  port: "__SERVER_PORT__"
pcas:
  address: "__PCAS_ADDRESS__"
  eventType: "__EVENT_TYPE__"
  translateEventType: "__TRANSLATE_TYPE__"
  summarizeEventType: "__SUMMARIZE_TYPE__"
  chatEventType: "__CHAT_TYPE__"
user:
  id: "__USER_ID__"
YAML
  sed -i.bak \
    -e "s|__SERVER_HOST__|${server_host}|" \
    -e "s|__SERVER_PORT__|${server_port}|" \
    -e "s|__PCAS_ADDRESS__|${PCAS_ADDRESS}|" \
    -e "s|__EVENT_TYPE__|${EVENT_TYPE:-capability.streaming.transcribe.v1}|" \
    -e "s|__TRANSLATE_TYPE__|${TRANSLATE_EVENT_TYPE:-capability.streaming.translate.v1}|" \
    -e "s|__SUMMARIZE_TYPE__|${SUMMARIZE_EVENT_TYPE:-capability.streaming.summarize.v1}|" \
    -e "s|__CHAT_TYPE__|${CHAT_EVENT_TYPE:-capability.streaming.chat.v1}|" \
    -e "s|__USER_ID__|${USER_ID}|" "$path" || true
}

patch_yaml_value() {
  local key="$1" value="$2" file="$3"
  if command -v yq >/dev/null 2>&1; then
    tmp=$(mktemp)
    yq e ".$key = \"$value\"" "$file" > "$tmp" && mv "$tmp" "$file"
  else
    # sed fallback: replace by leaf key under assumption of unique keys in file
    # Works for lines like:   address: "..."
    local leaf
    leaf="${key##*.}"
    sed -i.bak -E "s|(^[[:space:]]*${leaf}:[[:space:]]\").*(\")|\\1${value}\\2|" "$file" || true
  fi
}

# Optional non-interactive overrides (safe to skip if not provided)
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

# Optional capability-specific overrides
if [[ -n "$TRANSLATE_EVENT_TYPE" ]]; then
  echo "Setting pcas.translateEventType=$TRANSLATE_EVENT_TYPE"
  patch_yaml_value "pcas.translateEventType" "$TRANSLATE_EVENT_TYPE" "$CONFIG_PROD"
fi
if [[ -n "$SUMMARIZE_EVENT_TYPE" ]]; then
  echo "Setting pcas.summarizeEventType=$SUMMARIZE_EVENT_TYPE"
  patch_yaml_value "pcas.summarizeEventType" "$SUMMARIZE_EVENT_TYPE" "$CONFIG_PROD"
fi
if [[ -n "$CHAT_EVENT_TYPE" ]]; then
  echo "Setting pcas.chatEventType=$CHAT_EVENT_TYPE"
  patch_yaml_value "pcas.chatEventType" "$CHAT_EVENT_TYPE" "$CONFIG_PROD"
fi

# Interactive wizard to generate/update config if requested
if [[ "$INTERACTIVE" == "true" && "$UPDATE_ONLY" != "true" ]]; then
  # If config already exists, ask whether to modify it; default: keep as-is
  if [[ -f "$CONFIG_PROD" && -s "$CONFIG_PROD" ]]; then
    keep=$(prompt "Detected existing config at $CONFIG_PROD. Keep as-is? (Y/n)" "Y")
  else
    keep="n"
  fi

  if [[ ! "$keep" =~ ^[Yy]$ ]]; then
    echo "Running interactive configuration wizard..."
    # Propose defaults from current values (best-effort)
    local_default_pcas="${PCAS_ADDRESS:-localhost:50051}"
    local_default_event="${EVENT_TYPE:-capability.streaming.transcribe.v1}"
    local_default_tr="${TRANSLATE_EVENT_TYPE:-capability.streaming.translate.v1}"
    local_default_sm="${SUMMARIZE_EVENT_TYPE:-capability.streaming.summarize.v1}"
    local_default_ch="${CHAT_EVENT_TYPE:-capability.streaming.chat.v1}"
    local_default_uid="${USER_ID:-default-user}"
    local_default_port="${HTTP_PORT:-8080}"
    local_default_admin="${PCAS_ADMIN_TOKEN:-}"

    PCAS_ADDRESS=$(prompt "PCAS address (host:port)" "$local_default_pcas")
    EVENT_TYPE=$(prompt "Transcribe eventType" "$local_default_event")
    TRANSLATE_EVENT_TYPE=$(prompt "Translate eventType" "$local_default_tr")
    SUMMARIZE_EVENT_TYPE=$(prompt "Summarize eventType" "$local_default_sm")
    CHAT_EVENT_TYPE=$(prompt "Chat eventType" "$local_default_ch")
    USER_ID=$(prompt "User ID" "$local_default_uid")
    HTTP_PORT=$(prompt "Host HTTP port to expose" "$local_default_port")
    PCAS_ADMIN_TOKEN=$(prompt "PCAS admin token (optional)" "$local_default_admin")

    echo "\nWriting config to $CONFIG_PROD ..."
    write_config "$CONFIG_PROD"
  else
    echo "Keeping existing configuration file: $CONFIG_PROD"
  fi
fi

echo "Pulling latest image and starting containers..."
pushd "$INSTALL_DIR" >/dev/null
# Write .env for compose variable substitution.
# Preserve existing .env if present and not explicitly changing values (works for both update and non-interactive runs).
if [[ -f .env && "$HTTP_PORT_SET" != "true" && -z "${PCAS_ADMIN_TOKEN:-}" ]]; then
  echo "Preserving existing .env"
else
  {
    echo "HTTP_PORT=$HTTP_PORT"
    if [[ -n "${PCAS_ADMIN_TOKEN:-}" ]]; then
      echo "PCAS_ADMIN_TOKEN=$PCAS_ADMIN_TOKEN"
    fi
  } > .env
fi
FORCE_RECREATE="false"
# If admin token provided or interactive config changed port, force recreate to inject new env
if [[ -n "${PCAS_ADMIN_TOKEN:-}" || "$HTTP_PORT_SET" == "true" ]]; then
  FORCE_RECREATE="true"
fi

if [[ "$DEV" == "true" && -f "docker-compose.dev.yml" ]]; then
  docker compose -f docker-compose.yml -f docker-compose.dev.yml pull
  if [[ "$UPDATE_ONLY" == "true" || "$FORCE_RECREATE" == "true" ]]; then
    docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans || true
  fi
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --remove-orphans
else
  docker compose -f docker-compose.yml pull
  if [[ "$UPDATE_ONLY" == "true" || "$FORCE_RECREATE" == "true" ]]; then
    docker compose -f docker-compose.yml down --remove-orphans || true
  fi
  docker compose -f docker-compose.yml up -d --remove-orphans
fi
popd >/dev/null

echo "Success. DreamScribe is up. Visit: http://localhost:$HTTP_PORT"
