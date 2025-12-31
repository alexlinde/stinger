#!/bin/bash
#
# Development startup script for Stinger
# Starts both the backend and frontend dev servers
#

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "Starting Stinger in development mode..."
echo "Project directory: $PROJECT_DIR"
echo ""

# Check for virtual environment
if [ ! -d "$PROJECT_DIR/backend/venv" ]; then
    echo "Creating virtual environment..."
    cd "$PROJECT_DIR/backend"
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip wheel
    pip install -r requirements.txt
else
    cd "$PROJECT_DIR/backend"
    source venv/bin/activate
fi

# Create data directory if needed
mkdir -p "$PROJECT_DIR/backend/data/people"

# Start backend in background
echo "Starting backend..."
cd "$PROJECT_DIR/backend"
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# Give backend time to start
sleep 3

# Check if node_modules exists
if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd "$PROJECT_DIR/frontend"
    npm install
fi

# Start frontend
echo "Starting frontend..."
cd "$PROJECT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=========================================="
echo "  Stinger Development Mode"
echo "=========================================="
echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Handle cleanup
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for either process to exit
wait

