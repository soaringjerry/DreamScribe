# DreamScribe: Your Real-Time AI Learning Companion

**Slogan**: More than just transcription, it's the encoding of memory.

DreamScribe is an intelligent, real-time voice transcription and knowledge-assistance application built for the [PCAS (Personal Central AI System)](https://example.com/pcas-whitepaper) ecosystem.

Its ultimate vision is to become an indispensable **personal AI learning companion** for every lifelong learner. It actively assists during a class or meeting by understanding the conversation, providing timely hints, linking to relevant historical knowledge, and connecting to key background materials—**without giving away the answer**, thus stimulating active thinking.

To dive deep into the core concepts, design philosophy, and grand vision of this project, please read our 📄 **[Project Vision & Philosophy](docs/VISION.md)** (Chinese).
For the upcoming UI/UX and multimodal extensions, see **[Frontend UI Design (CN)](docs/FRONTEND_UI_DESIGN_CN.md)**.

## Core Features

- **AI Learning Companion**: Acts as an active partner in learning scenarios, not just a passive recording tool.
- **Memory Encoder for PCAS**: Its core technical role is to act as a "Memory Encoder". It receives raw text streams from sensory D-Apps (like `DreamTrans`) and encodes them into structured `pcas.memory.create.v1` events for the entire PCAS ecosystem to use.
- **PCAS Native Integration**: Deeply integrated with the PCAS service bus via gRPC.
- **Single-Image Deployment**: A multi-stage Dockerfile packages the frontend UI and backend API into a single, optimized image.

## Tech Stack

- **Backend**: Go, Gin, Gorilla WebSocket, gRPC
- **Frontend**: React, TypeScript, Vite
- **CI/CD**: GitHub Actions, Docker

## Local Development Guide

### Prerequisites
- Go (Version 1.22+)
- Node.js (Version 20+)
- A running instance of PCAS

### Launch Steps
1.  **Start the Backend**:
    ```bash
    cd backend
    go run ./cmd/server/main.go
    ```
2.  **Start the Frontend**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
3.  **Access**: The application will be available at `http://localhost:5173`.

## Docker Deployment Guide

### Prerequisites
- Docker (and Docker Compose plugin)
- A running instance of PCAS

### Option A: Docker Compose (recommended)
- Prepare config:
  - `cp configs/config.example.yaml configs/config.production.yaml`
  - Edit `configs/config.production.yaml` (`pcas.address` etc.)
- Start:
  - Linux/macOS: `./start-docker.sh`
  - Windows PowerShell: `./start-docker.ps1`
- Access: `http://localhost:8080`

Dev auto-update (optional):
- Start with watchtower overlay to auto-pull latest images from GHCR:
  - Linux/macOS: `./start-docker.sh --dev`
  - Windows PowerShell: `./start-docker.ps1 -Dev`

Compose files:
- `docker-compose.yml` – main service
- `docker-compose.dev.yml` – adds Watchtower for auto-update in dev

### Option B: Plain Docker run
```bash
# 1. Pull the latest image
docker pull ghcr.io/soaringjerry/dreamscribe:latest

# 2. Prepare the production config file
cp configs/config.example.yaml configs/config.production.yaml
# edit configs/config.production.yaml  <-- set pcas.address

# 3. Run the container
docker run -d \
  --name dreamscribe \
  -p 8080:8080 \
  -v $(pwd)/configs/config.production.yaml:/app/config.yaml:ro \
  ghcr.io/soaringjerry/dreamscribe:latest
```
- Access: `http://localhost:8080`

## One-Command Deploy (Server-side)

Use a single command on your server to install or update DreamScribe. GitHub Actions is only used to build and host Docker images on GHCR.

Linux/macOS one-liner:
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/soaringjerry/DreamScribe/main/scripts/install-or-update.sh)" -- --dir /opt/dreamscribe --pcas localhost:50051 --port 18080
```

Windows PowerShell (two steps for clarity):
```powershell
iwr -UseBasicParsing https://raw.githubusercontent.com/soaringjerry/DreamScribe/main/scripts/install-or-update.ps1 -OutFile install-or-update.ps1
./install-or-update.ps1 -Dir "$HOME/dreamscribe" -PCASAddress "localhost:50051" -Port 18080
```

Options:
- `--dev` or `-Dev`: enable auto-update via Watchtower overlay
- `--dir` or `-Dir`: install directory (default Linux: `/opt/dreamscribe`, Windows: `$HOME/dreamscribe`)
- `--port` or `-Port`: host port to expose (default 8080)
- `--pcas` / `-PCASAddress`: override `pcas.address`
- `--event-type` / `-EventType`: override `pcas.eventType`
 - `--translate-type` / `-TranslateType`: override `pcas.translateEventType`
 - `--summarize-type` / `-SummarizeType`: override `pcas.summarizeEventType`
 - `--chat-type` / `-ChatType`: override `pcas.chatEventType`
 - `--user-id` / `-UserId`: set `user.id`
 - `--admin-token` / `-AdminToken`: export `PCAS_ADMIN_TOKEN` into container

What the script does:
- Downloads latest `docker-compose.yml` (+dev overlay) from GitHub
- Ensures `configs/config.production.yaml` exists (created from example if missing)
- Applies overrides if provided, then runs `docker compose pull && up -d`
 - If `--interactive` is used, guides you through config generation

Diagnostics:
- Open `http://<host>:<port>/test` for a built-in test console (WS/SSE/Chat/Admin)
- Check `GET /api/health` for PCAS readiness (per capability)

CI status:
- Build & push to GHCR: `.github/workflows/docker-build.yml` (keep as-is)
- No Action-based deployment required for one-command flow
