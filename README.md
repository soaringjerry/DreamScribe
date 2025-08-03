# DreamScribe: Your Real-Time AI Learning Companion

**Slogan**: More than just transcription, it's the encoding of memory.

DreamScribe is an intelligent, real-time voice transcription and knowledge-assistance application built for the [PCAS (Personal Central AI System)](https://example.com/pcas-whitepaper) ecosystem.

Its ultimate vision is to become an indispensable **personal AI learning companion** for every lifelong learner. It actively assists during a class or meeting by understanding the conversation, providing timely hints, linking to relevant historical knowledge, and connecting to key background materials—**without giving away the answer**, thus stimulating active thinking.

To dive deep into the core concepts, design philosophy, and grand vision of this project, please read our 📄 **[Project Vision & Philosophy](docs/VISION.md)** (Chinese).

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
- Docker
- A running instance of PCAS
- A production configuration file `configs/config.production.yaml`

### Pull & Run from GHCR
```bash
# 1. Pull the latest image
docker pull ghcr.io/soaringjerry/dreamscribe:latest

# 2. Prepare the production config file
# cp configs/config.example.yaml configs/config.production.yaml
# nano configs/config.production.yaml  <-- Modify pcas.address

# 3. Run the container
docker run -d \
  --name dreamscribe \
  -p 8080:8080 \
  -v $(pwd)/configs/config.production.yaml:/app/config.yaml \
  ghcr.io/soaringjerry/dreamscribe:latest
```
- **Access**: The application will be available at `http://localhost:8080`.