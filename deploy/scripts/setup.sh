#!/bin/bash
#
# Stinger Setup Script for Ubuntu/Debian Linux
# This script installs all dependencies and sets up the Stinger service
#
# Usage:
#   sudo ./setup.sh          # CPU-only installation
#   sudo ./setup.sh --cuda   # Install with NVIDIA CUDA GPU support
#

set -e

INSTALL_DIR="/opt/stinger"
STINGER_USER="stinger"
SERVICE_WAS_RUNNING=false
USE_CUDA=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --cuda)
            USE_CUDA=true
            shift
            ;;
        --help|-h)
            echo "Usage: sudo ./setup.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --cuda    Install with NVIDIA CUDA GPU support"
            echo "  --help    Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "=========================================="
echo "  Stinger Face Recognition Setup"
echo "=========================================="
echo ""
if [ "$USE_CUDA" = true ]; then
    echo "Mode: GPU (CUDA)"
else
    echo "Mode: CPU only"
fi
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo ./setup.sh"
    exit 1
fi

# If CUDA mode, verify NVIDIA drivers are installed
if [ "$USE_CUDA" = true ]; then
    if ! command -v nvidia-smi &> /dev/null; then
        echo "ERROR: NVIDIA drivers not found."
        echo ""
        echo "Please install NVIDIA drivers first:"
        echo "  sudo apt install nvidia-driver-535  # or appropriate version"
        echo "  sudo reboot"
        echo ""
        echo "Then run this script again with --cuda"
        exit 1
    fi
    echo "NVIDIA GPU detected:"
    nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
    echo ""
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

# Install GPU or CPU version of onnxruntime
if [ "$USE_CUDA" = true ]; then
    echo ""
    echo "Installing CUDA support (onnxruntime-gpu + CUDA runtime libraries)..."
    sudo -u "$STINGER_USER" "$INSTALL_DIR/venv/bin/pip" uninstall -y onnxruntime 2>/dev/null || true
    sudo -u "$STINGER_USER" "$INSTALL_DIR/venv/bin/pip" install \
        onnxruntime-gpu \
        nvidia-cublas-cu12 \
        nvidia-cudnn-cu12 \
        nvidia-cufft-cu12 \
        nvidia-curand-cu12
else
    echo "Using CPU-only onnxruntime (use --cuda flag for GPU support)"
fi

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

# Configure CUDA library path in the service file if using GPU
if [ "$USE_CUDA" = true ]; then
    SITE_PKGS=$("$INSTALL_DIR/venv/bin/python3" -c "import site; print(site.getsitepackages()[0])")
    CUDA_LD_PATH="${SITE_PKGS}/nvidia/cublas/lib"
    CUDA_LD_PATH="${CUDA_LD_PATH}:${SITE_PKGS}/nvidia/cudnn/lib"
    CUDA_LD_PATH="${CUDA_LD_PATH}:${SITE_PKGS}/nvidia/cufft/lib"
    CUDA_LD_PATH="${CUDA_LD_PATH}:${SITE_PKGS}/nvidia/curand/lib"
    CUDA_LD_PATH="${CUDA_LD_PATH}:/usr/local/cuda/lib64:/usr/lib/x86_64-linux-gnu"

    # Uncomment and set the LD_LIBRARY_PATH line in the service file
    sed -i "s|# Environment=LD_LIBRARY_PATH=|Environment=LD_LIBRARY_PATH=${CUDA_LD_PATH}|" /etc/systemd/system/stinger.service
    echo "Configured CUDA library path for systemd service"

    # Set USE_CUDA=true in the .env file
    ENV_FILE="$INSTALL_DIR/backend/.env"
    if [ -f "$ENV_FILE" ]; then
        if grep -q "^USE_CUDA=" "$ENV_FILE"; then
            sed -i "s|^USE_CUDA=.*|USE_CUDA=true|" "$ENV_FILE"
        else
            echo "" >> "$ENV_FILE"
            echo "# GPU acceleration" >> "$ENV_FILE"
            echo "USE_CUDA=true" >> "$ENV_FILE"
        fi
    else
        echo "# GPU acceleration" > "$ENV_FILE"
        echo "USE_CUDA=true" >> "$ENV_FILE"
    fi
    chown "$STINGER_USER:$STINGER_USER" "$ENV_FILE"
    echo "Set USE_CUDA=true in $ENV_FILE"
fi

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
if [ "$USE_CUDA" = true ]; then
    echo "Mode: GPU (CUDA enabled)"
else
    echo "Mode: CPU only"
    echo ""
    echo "To enable GPU acceleration, reinstall with:"
    echo "  sudo ./deploy/scripts/setup.sh --cuda"
fi
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
if [ "$USE_CUDA" = true ]; then
    echo "To verify GPU is being used:"
    echo "  watch -n 1 nvidia-smi"
    echo ""
fi
echo "Configuration can be done via environment variables in:"
echo "  /opt/stinger/backend/.env"
echo ""
echo "Example .env file:"
echo "  CAMERA_DEVICE=0"
echo "  CAMERA_WIDTH=1280"
echo "  CAMERA_HEIGHT=720"
echo "  KIOSK_ENABLED=true"
echo ""

