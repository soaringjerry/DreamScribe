#!/bin/bash
# Start DreamScribe Backend Server

echo "Starting DreamScribe Backend Server..."
echo "=================================="

cd backend

# Check if go.mod exists
if [ ! -f "go.mod" ]; then
    echo "Error: go.mod not found in backend directory"
    exit 1
fi

# Run the server
echo "Running backend server on http://localhost:8080"
echo "WebSocket endpoint: ws://localhost:8080/ws/transcribe"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

go run ./cmd/server/main.go