#!/bin/bash
#
# Stinger Setup Script for Ubuntu/Debian Linux
# This script installs all dependencies and sets up the Stinger service
#

set -e

INSTALL_DIR="/opt/stinger"
STINGER_USER="stinger"
SERVICE_WAS_RUNNING=false

echo "=========================================="
echo "  Stinger Face Recognition Setup"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo ./setup.sh"
    exit 1
fi

# Check if service is already running and stop it
if systemctl is-active --quiet stinger 2>/dev/null; then
    echo "Stopping existing stinger service..."
    systemctl stop stinger
    SERVICE_WAS_RUNNING=true
fi

echo "[1/8] Installing system dependencies..."
apt-get update
apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    cmake \
    libopencv-dev \
    python3-opencv \
    libsdl2-dev \
    libsdl2-mixer-2.0-0 \
    nodejs \
    npm \
    git

echo ""
echo "[2/8] Creating stinger user..."
if ! id "$STINGER_USER" &>/dev/null; then
    useradd --system --create-home --shell /bin/bash "$STINGER_USER"
fi
# Add user to video and audio groups
usermod -a -G video,audio "$STINGER_USER"

echo ""
echo "[3/8] Creating installation directory..."
mkdir -p "$INSTALL_DIR"
chown "$STINGER_USER:$STINGER_USER" "$INSTALL_DIR"

echo ""
echo "[4/8] Copying application files..."
# Copy backend (preserve existing data and .env)
if [ -d "$INSTALL_DIR/backend/data" ]; then
    echo "  Preserving existing data directory..."
    mv "$INSTALL_DIR/backend/data" "$INSTALL_DIR/data_backup"
fi
if [ -f "$INSTALL_DIR/backend/.env" ]; then
    echo "  Preserving existing .env file..."
    cp "$INSTALL_DIR/backend/.env" "$INSTALL_DIR/env_backup"
fi

cp -r backend "$INSTALL_DIR/"
cp -r frontend "$INSTALL_DIR/"
cp deploy/systemd/stinger.service /etc/systemd/system/

# Create data directory if it doesn't exist
mkdir -p "$INSTALL_DIR/backend/data/people"
chown -R "$STINGER_USER:$STINGER_USER" "$INSTALL_DIR"

echo ""
echo "[5/8] Setting up Python virtual environment..."
sudo -u "$STINGER_USER" python3 -m venv "$INSTALL_DIR/venv"
sudo -u "$STINGER_USER" "$INSTALL_DIR/venv/bin/pip" install --upgrade pip wheel

echo ""
echo "[6/8] Installing Python dependencies..."
sudo -u "$STINGER_USER" "$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/backend/requirements.txt"

echo ""
echo "[7/8] Building frontend..."
cd "$INSTALL_DIR/frontend"
sudo -u "$STINGER_USER" npm install
sudo -u "$STINGER_USER" npm run build
# Copy built files to static directory for FastAPI to serve
mkdir -p "$INSTALL_DIR/backend/static"
cp -r "$INSTALL_DIR/frontend/dist/"* "$INSTALL_DIR/backend/static/"
chown -R "$STINGER_USER:$STINGER_USER" "$INSTALL_DIR/backend/static"

echo ""
echo "[8/8] Installing systemd service..."
systemctl daemon-reload
systemctl enable stinger

# Restart service if it was running before
if [ "$SERVICE_WAS_RUNNING" = true ]; then
    echo ""
    echo "Restarting stinger service..."
    systemctl start stinger
fi

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
if [ "$SERVICE_WAS_RUNNING" = true ]; then
    echo "Stinger service has been restarted."
else
    echo "To start Stinger:"
    echo "  sudo systemctl start stinger"
fi
echo ""
echo "To view logs:"
echo "  sudo journalctl -u stinger -f"
echo ""
echo "Management interface will be available at:"
echo "  http://localhost:8000"
echo ""
echo "Configuration can be done via environment variables in:"
echo "  /opt/stinger/backend/.env"
echo ""
echo "Example .env file:"
echo "  CAMERA_DEVICE=0"
echo "  CAMERA_WIDTH=1280"
echo "  CAMERA_HEIGHT=720"
echo "  KIOSK_ENABLED=true"
echo ""

