# syntax=docker/dockerfile:1.7
# Multi-stage Dockerfile for DreamScribe application

# Stage 1: Build Go backend
FROM golang:1.23-alpine AS backend-builder

# Install build dependencies
RUN apk add --no-cache git

WORKDIR /app/backend

# Copy go mod files
COPY backend/go.mod backend/go.sum ./

# Download dependencies with cache mounts
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

# Copy backend source code
COPY backend/ .

# Build the backend (use build cache; keep static by disabling cgo)
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -o dreamscribe ./cmd/server

# Stage 2: Build React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies with cache
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund

# Copy frontend source code
COPY frontend/ .

# Build the frontend
RUN --mount=type=cache,target=/root/.npm \
    npm run build

# Stage 3: Final production image
FROM alpine:latest

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy backend binary from builder
COPY --from=backend-builder /app/backend/dreamscribe .

# Copy frontend build from builder
COPY --from=frontend-builder /app/frontend/dist ./static

# Copy configuration example
COPY configs/config.example.yaml ./config.example.yaml

# Expose ports
# 8080 for backend WebSocket API
# 3000 for frontend (if served separately)
EXPOSE 8080 3000

# Set environment variables
ENV STATIC_PATH=/app/static
ENV CONFIG_PATH=/app/config.yaml

# Create a volume for configuration
VOLUME ["/app/config"]

# Run the backend server (which can also serve static files)
CMD ["./dreamscribe"]
