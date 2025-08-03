# DreamScribe

An intelligent real-time voice transcription and knowledge capture application built on the PCAS ecosystem.

## Overview

DreamScribe is a modern web application that combines real-time speech-to-text capabilities with intelligent knowledge extraction. Built with a microservices architecture, it features a Go backend and React frontend, designed to seamlessly integrate with the PCAS (Personal Context and Awareness System) service bus.

## Core Features

- **Real-time Voice Transcription**: Convert speech to text with low latency using advanced speech recognition
- **WebSocket Communication**: Achieve minimal delay through efficient bidirectional streaming
- **Intelligent Endpoint**: Automatically transform transcribed text into structured "memory" events
- **PCAS Integration**: Connect to the PCAS service bus via gRPC for comprehensive context awareness
- **Single-Image Deployment**: Deploy the entire application stack with one Docker container

## Tech Stack

### Backend
- **Language**: Go
- **Web Framework**: Gin
- **WebSocket**: Gorilla WebSocket
- **RPC**: gRPC
- **Speech Recognition**: Speechmatics API

### Frontend
- **Framework**: React
- **Language**: TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand
- **Styling**: Tailwind CSS

### Infrastructure
- **Containerization**: Docker
- **CI/CD**: GitHub Actions
- **Container Registry**: GitHub Container Registry (GHCR)

## Local Development Guide

### Prerequisites

- Go 1.22 or higher
- Node.js 20 or higher
- A running PCAS instance (optional for basic functionality)

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/soaringjerry/DreamScribe.git
   cd DreamScribe
   ```

2. **Configure the application**
   ```bash
   cp configs/config.example.yaml configs/config.local.yaml
   # Edit config.local.yaml to match your environment
   ```

3. **Start the backend**
   ```bash
   cd backend
   CONFIG_PATH=../configs/config.local.yaml go run ./cmd/server/main.go
   ```

4. **Start the frontend** (in a new terminal)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. **Access the application**
   
   Open your browser and navigate to `http://localhost:5173`

### Development Workflow

- Backend API runs on `http://localhost:8080`
- Frontend development server runs on `http://localhost:5173` with hot module replacement
- WebSocket endpoint is available at `ws://localhost:8080/ws/transcribe`

## Docker Deployment Guide

### Prerequisites

- Docker installed on your system
- A running PCAS instance (if using PCAS integration)
- A production configuration file

### Quick Start with Docker

1. **Pull the latest image**
   ```bash
   docker pull ghcr.io/soaringjerry/dreamscribe:latest
   ```

2. **Prepare your configuration**
   ```bash
   # Create a production configuration from the example
   cp configs/config.example.yaml configs/config.production.yaml
   
   # Edit the configuration file
   nano configs/config.production.yaml
   # Update at minimum:
   # - pcas.address: your PCAS server address
   # - server.host: 0.0.0.0 (for Docker)
   ```

3. **Run the container**
   ```bash
   docker run -d \
     --name dreamscribe \
     -p 8080:8080 \
     -v $(pwd)/configs/config.production.yaml:/app/config.yaml \
     ghcr.io/soaringjerry/dreamscribe:latest
   ```

4. **Access the application**
   
   Navigate to `http://localhost:8080` in your browser

### Building from Source

If you want to build the Docker image locally:

```bash
# Build the image
docker build -t dreamscribe:local .

# Run with your local image
docker run -d \
  --name dreamscribe \
  -p 8080:8080 \
  -v $(pwd)/configs/config.production.yaml:/app/config.yaml \
  dreamscribe:local
```

### Docker Compose (Optional)

For a more complex deployment with additional services:

```yaml
version: '3.8'

services:
  dreamscribe:
    image: ghcr.io/soaringjerry/dreamscribe:latest
    ports:
      - "8080:8080"
    volumes:
      - ./configs/config.production.yaml:/app/config.yaml
    environment:
      - LOG_LEVEL=info
    restart: unless-stopped
```

## Configuration

The application uses YAML configuration files. Key configuration options include:

```yaml
server:
  host: "0.0.0.0"  # Use 0.0.0.0 for Docker deployments
  port: "8080"

pcas:
  address: "localhost:50051"  # Your PCAS server address
  eventType: "capability.streaming.transcribe.v1"

user:
  id: "default-user"  # User identifier for PCAS events
```

## API Documentation

### WebSocket Endpoint

**URL**: `ws://localhost:8080/ws/transcribe`

**Message Format**:
```json
{
  "audio": "base64_encoded_audio_data",
  "sampleRate": 16000
}
```

**Response Format**:
```json
{
  "transcript": "transcribed text",
  "confidence": 0.95,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with the PCAS ecosystem in mind
- Powered by Speechmatics for speech recognition
- Inspired by the need for seamless voice-to-knowledge capture

## Support

For issues, questions, or contributions, please:
- Open an issue on [GitHub](https://github.com/soaringjerry/DreamScribe/issues)
- Check existing documentation and issues first
- Provide detailed information about your environment and the problem

---

Made with ❤️ by the DreamScribe team