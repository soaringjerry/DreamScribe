#!/bin/bash
# Check DreamScribe Services Status

echo "DreamScribe Services Status Check"
echo "================================="
echo ""

# Check if backend is running
echo "1. Backend Service (Port 8080):"
if nc -z localhost 8080 2>/dev/null; then
    echo "   ✓ Backend is running on http://localhost:8080"
    echo "   ✓ WebSocket endpoint: ws://localhost:8080/ws/transcribe"
else
    echo "   ✗ Backend is NOT running"
    echo "   To start: ./start-backend.sh"
fi
echo ""

# Check if frontend is running
echo "2. Frontend Service (Port 5173):"
if nc -z localhost 5173 2>/dev/null; then
    echo "   ✓ Frontend is running on http://localhost:5173"
else
    echo "   ✗ Frontend is NOT running"
    echo "   To start: ./start-frontend.sh"
fi
echo ""

# Check if PCAS is required
echo "3. PCAS Service (Port 9090):"
if nc -z localhost 9090 2>/dev/null; then
    echo "   ✓ PCAS appears to be running on localhost:9090"
else
    echo "   ⚠  PCAS is NOT detected on localhost:9090"
    echo "   Make sure PCAS and DreamTrans are running"
fi
echo ""

# Check Go version
echo "4. Go Version:"
if command -v go &> /dev/null; then
    go_version=$(go version | awk '{print $3}')
    echo "   ✓ Go is installed: $go_version"
else
    echo "   ✗ Go is not installed"
fi
echo ""

# Check Node version
echo "5. Node.js Version:"
if command -v node &> /dev/null; then
    node_version=$(node --version)
    echo "   ✓ Node.js is installed: $node_version"
else
    echo "   ✗ Node.js is not installed"
fi
echo ""

echo "================================="
echo "Ready for E2E Testing when all services show ✓"