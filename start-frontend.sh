#!/bin/bash
# Start DreamScribe Frontend Development Server

echo "Starting DreamScribe Frontend Development Server..."
echo "================================================="

cd frontend

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found in frontend directory"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Run the development server
echo ""
echo "Starting frontend development server..."
echo "The application will be available at http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev