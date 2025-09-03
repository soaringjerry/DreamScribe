#!/usr/bin/env bash
set -euo pipefail

DEV_MODE=${1:-}

echo "Starting DreamScribe via Docker Compose..."

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
REPO_ROOT="$SCRIPT_DIR"
cd "$REPO_ROOT"

CONFIG_DIR="$REPO_ROOT/configs"
PROD_CONFIG="$CONFIG_DIR/config.production.yaml"
EXAMPLE_CONFIG="$CONFIG_DIR/config.example.yaml"

if [ ! -f "$PROD_CONFIG" ]; then
  echo "configs/config.production.yaml not found. Creating from example..."
  if [ ! -f "$EXAMPLE_CONFIG" ]; then
    echo "Example config not found at $EXAMPLE_CONFIG" >&2
    exit 1
  fi
  cp "$EXAMPLE_CONFIG" "$PROD_CONFIG"
  echo "Please edit configs/config.production.yaml to set your PCAS address."
fi

if [ "$DEV_MODE" = "--dev" ]; then
  echo "Dev mode enabled: watchtower auto-update is active."
  docker compose -f docker-compose.yml -f docker-compose.dev.yml pull
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
else
  docker compose -f docker-compose.yml pull
  docker compose -f docker-compose.yml up -d
fi

echo "DreamScribe is up. Visit http://localhost:8080"
