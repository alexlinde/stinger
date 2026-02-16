# Stinger

Local face recognition system with theme song playback. Designed to run on a dedicated Linux machine with a USB webcam and speakers.

## Features

- **Live Face Recognition**: Real-time face detection and matching via USB webcam
- **Theme Song Playback**: Plays a unique theme song when a person is recognized (with configurable cooldown)
- **Web Management Interface**: Add people, upload photos, set theme songs, and configure settings
- **Live Camera Feed**: View the webcam feed with face detection overlays from any browser on the local network
- **Camera Masks**: Exclude regions from face recognition (e.g., TVs, windows, posters)
- **Runtime Settings**: Adjust recognition thresholds and options without restarting the server

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Linux Machine                        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │          FastAPI Application (Port 8000)          │ │
│  │                                                   │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │ │
│  │  │ REST API    │  │ MJPEG Stream│  │ WebSocket │ │ │
│  │  │ (People,    │  │ /kiosk/     │  │ /kiosk/ws │ │ │
│  │  │  Photos,    │  │  stream     │  │           │ │ │
│  │  │  Themes)    │  │             │  │           │ │ │
│  │  └─────────────┘  └─────────────┘  └───────────┘ │ │
│  │                                                   │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │         Background Kiosk Loop               │ │ │
│  │  │  Camera Capture → Face Recognition →        │ │ │
│  │  │  Audio Playback → Frame Streaming           │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────┘ │
│                         │                               │
│              ┌──────────┴──────────┐                   │
│              ▼                      ▼                   │
│        ┌──────────┐          ┌──────────┐              │
│        │USB Webcam│          │ Speakers │              │
│        └──────────┘          └──────────┘              │
└─────────────────────────────────────────────────────────┘
                         ▲
                         │ Network
                         ▼
┌─────────────────────────────────────────────────────────┐
│               Management Browser                        │
│  - Add/manage people and photos                         │
│  - Upload theme songs                                   │
│  - View live camera feed                                │
│  - Configure settings and camera masks                  │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
stinger/
├── backend/
│   ├── app/
│   │   ├── api/           # REST API routes
│   │   ├── core/          # Face recognition, config
│   │   ├── kiosk/         # Camera, audio, streaming
│   │   └── main.py        # FastAPI app
│   ├── data/
│   │   ├── people/        # Photos and themes
│   │   └── runtime_settings.json  # Runtime settings
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/         # React pages
│   │   │   ├── LiveView   # Live camera feed
│   │   │   ├── PeopleList # People gallery
│   │   │   ├── Settings   # Settings management
│   │   │   └── ...
│   │   └── ...
│   └── package.json
└── deploy/
    ├── systemd/           # Service file
    └── scripts/           # Setup scripts
```

## Quick Start (Development)

### Prerequisites

- Python 3.10+
- Node.js 20+
- USB Webcam
- Speakers (for audio playback)

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create data directory
mkdir -p data/people

# Run the server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

### Access the App

- **Management UI**: http://localhost:5173
- **Live View**: http://localhost:5173/live
- **API Docs**: http://localhost:8000/docs

## Production Deployment

### Automated Setup (Ubuntu/Debian)

```bash
# Clone the repository
git clone https://github.com/yourusername/stinger.git
cd stinger

# Run the setup script (CPU only)
sudo ./deploy/scripts/setup.sh

# OR with NVIDIA GPU support (requires drivers installed first)
sudo ./deploy/scripts/setup.sh --cuda
```

### Start the Service

```bash
# Start Stinger
sudo systemctl start stinger

# View logs
sudo journalctl -u stinger -f

# Enable on boot
sudo systemctl enable stinger
```

### Configuration

Stinger uses two types of settings:

- **Config Settings** (`.env` file): Read-only settings that require a server restart to change. These include hardware configuration like camera device and resolution.
- **Runtime Settings** (`data/runtime_settings.json`): Editable settings that can be changed via the web UI without restarting the server. These include recognition thresholds, camera masks, and display options.

#### Config Settings (`.env`)

Create `/opt/stinger/backend/.env`:

```bash
# Camera hardware (requires restart)
CAMERA_DEVICE=0
CAMERA_WIDTH=1280
CAMERA_HEIGHT=720

# Server
HOST=0.0.0.0
PORT=8000
DEBUG=false
```

#### Runtime Settings (Web UI)

The following settings can be changed in the Settings page without restarting:

| Setting | Default | Description |
|---------|---------|-------------|
| `detection_score_threshold` | 0.5 | Minimum confidence for face detection |
| `embedding_distance_threshold` | 0.6 | Max distance for face matching (lower = stricter) |
| `upscale_factor` | 1.5 | Image upscale factor for retry detection |
| `audio_cooldown_seconds` | 30.0 | Cooldown between theme plays for same person |
| `camera_fps` | 15 | Frame rate for video streaming |
| `recognition_interval_ms` | 200 | Interval between recognition attempts |
| `low_power_mode` | false | Enable adaptive performance for slow hardware |
| `mirror_feed` | true | Mirror the camera feed horizontally |
| `kiosk_enabled` | true | Enable/disable the kiosk recognition loop |
| `camera_masks` | "" | JSON string of mask regions (use UI to edit) |

### Low Power Mode (Slow Hardware)

For Raspberry Pi or other low-powered devices:

1. **Set lower resolution in `.env`** (requires restart):
```bash
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
```

2. **Enable Low Power Mode in the Settings page** (no restart needed):
   - Set `low_power_mode` to `true`
   - Increase `recognition_interval_ms` to 500 or higher
   - Lower `camera_fps` to 10

With Low Power Mode enabled, the system will:
- Automatically increase recognition interval if processing is slow
- Decrease interval when system has spare capacity
- Log performance stats every 30 seconds

### GPU Acceleration (CUDA)

For significantly faster face recognition, you can use an NVIDIA GPU with CUDA support. This is recommended for:

- Processing higher resolution video (1080p+)
- Lower latency recognition
- Running multiple concurrent streams
- Reducing CPU load

#### Supported Hardware

- NVIDIA GPUs with CUDA Compute Capability 6.0+ (Pascal and newer)
- Examples: GTX 1060+, RTX series, Tesla P4/T4/V100, Quadro series

#### CUDA Setup

**1. Install NVIDIA Drivers (if not already installed):**

```bash
# Check if drivers are installed
nvidia-smi

# If not installed, install appropriate driver
sudo apt install nvidia-driver-535  # Check NVIDIA's site for recommended version
sudo reboot
```

**2. Run setup with CUDA flag:**

```bash
sudo ./deploy/scripts/setup.sh --cuda
```

This will:
- Verify NVIDIA drivers are present
- Install `onnxruntime-gpu` instead of the CPU-only version
- Configure InsightFace to use the GPU

**3. Verify GPU is being used:**

```bash
# Watch GPU utilization while Stinger is running
watch -n 1 nvidia-smi

# Check which processes are using the GPU
nvidia-smi --query-compute-apps=pid,name,used_memory --format=csv
```

You should see a Python process using GPU memory when Stinger is running.

#### Switching Between CPU and GPU

To switch an existing installation:

```bash
# Switch to GPU
cd /opt/stinger
source venv/bin/activate
pip uninstall onnxruntime
pip install onnxruntime-gpu
sudo systemctl restart stinger

# Switch to CPU
cd /opt/stinger
source venv/bin/activate
pip uninstall onnxruntime-gpu
pip install onnxruntime
sudo systemctl restart stinger
```

#### Development Setup with CUDA

For development, manually install the GPU package:

```bash
cd backend
source venv/bin/activate
pip uninstall onnxruntime
pip install onnxruntime-gpu
```

Verify CUDA is available:

```python
import onnxruntime
print(onnxruntime.get_available_providers())
# Should include 'CUDAExecutionProvider' if GPU is available
```

## Camera Masks

Camera masks allow you to exclude specific regions of the camera feed from face recognition. This is useful for:

- Blocking out TVs or monitors that might show faces
- Excluding windows where passersby might trigger false recognitions
- Ignoring posters, photos, or artwork with faces

### Using the Mask Editor

1. Go to the **Settings** page or **Live View** page
2. Click **Edit Masks** to open the mask editor
3. Draw rectangles by clicking and dragging on the video feed
4. Drag masks to reposition them, or use corner handles to resize
5. Click the delete button (×) to remove a mask
6. Click **Save Masks** to apply changes

Masked regions appear as semi-transparent white overlays on the live feed and are excluded from face detection processing.

## Adding People

1. Open the management interface at http://your-server:8000
2. Click "Add Person" and enter a name
3. Upload face photos (at least one clear frontal photo)
4. Optionally set a preview photo for the gallery
5. Optionally upload a theme song (MP3, WAV, or M4A)

## API Endpoints

### People

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/people` | List all people |
| POST | `/api/people` | Create a person |
| GET | `/api/people/{name}` | Get person details |
| DELETE | `/api/people/{name}` | Delete a person |
| POST | `/api/people/{name}/photos` | Upload a photo |
| DELETE | `/api/people/{name}/photos/{id}` | Delete a photo |
| PUT | `/api/people/{name}/preview` | Set preview photo |
| PUT | `/api/people/{name}/theme` | Upload theme |
| DELETE | `/api/people/{name}/theme` | Delete theme |

### Kiosk

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/kiosk/stream` | MJPEG video stream |
| GET | `/api/kiosk/status` | Kiosk status |
| WS | `/api/kiosk/ws` | Recognition events |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get all settings (config + runtime) |
| PATCH | `/api/settings` | Update runtime settings |

## Recognition Tuning

All recognition settings can be adjusted in real-time via the Settings page:

- **Distance Threshold** (`embedding_distance_threshold`): Lower values (e.g., 0.5) are stricter, higher values (e.g., 0.7) are more lenient
- **Detection Threshold** (`detection_score_threshold`): Minimum confidence for detecting a face (0.0 - 1.0)
- **More Photos = Better**: Add 3-5 photos per person for best results
- **Photo Quality**: Use well-lit, frontal face photos
- **Camera Masks**: Use masks to exclude problem areas that cause false positives

## Troubleshooting

### Camera not working
- Check USB connection: `lsusb`
- Verify permissions: user must be in `video` group
- Test with: `v4l2-ctl --list-devices`

### Audio not playing
- Check audio output: `aplay -l`
- Verify permissions: user must be in `audio` group
- Test with: `speaker-test -t wav`

### Recognition too slow / laggy video feed
- Enable **Low Power Mode** in Settings for adaptive performance
- Reduce resolution in `.env`: `CAMERA_WIDTH=640`, `CAMERA_HEIGHT=480` (requires restart)
- Reduce FPS in Settings: lower `camera_fps` to 10
- Increase `recognition_interval_ms` in Settings (default 200ms, try 500-1000ms)
- Check logs for performance stats: `sudo journalctl -u stinger -f`
- Consider using GPU acceleration (CUDA) on supported hardware

### GPU not being used
- Verify NVIDIA drivers: `nvidia-smi` should show your GPU
- Check onnxruntime-gpu is installed: `pip show onnxruntime-gpu`
- If only `onnxruntime` is installed, reinstall with `--cuda` flag or manually switch:

```bash
pip uninstall onnxruntime && pip install onnxruntime-gpu
```

- Verify CUDA providers are available:

```bash
python3 -c "import onnxruntime; print(onnxruntime.get_available_providers())"
```

Should include `CUDAExecutionProvider`

### CUDA works interactively but not as a service

If `python3 -c "import onnxruntime; print(onnxruntime.get_available_providers())"` shows `CUDAExecutionProvider` but the service logs show errors like `libcublasLt.so.12: cannot open shared object file`, the systemd service can't find the CUDA runtime libraries.

**1. Install the CUDA toolkit runtime libraries** (provides cuBLAS, cuDNN, etc.):

```bash
sudo apt install nvidia-cuda-toolkit
```

**2. Ensure the service file has the CUDA library path.** The included `stinger.service` already sets `LD_LIBRARY_PATH` but if you've customised it, verify:

```ini
Environment=LD_LIBRARY_PATH=/usr/local/cuda/lib64:/usr/lib/x86_64-linux-gnu
```

**3. Reload and restart:**

```bash
sudo systemctl daemon-reload
sudo systemctl restart stinger
```

**4. Verify in the logs:**

```bash
sudo journalctl -u stinger -f
```

The `provider_bridge_ort.cc` CUDA errors should be gone.

### CUDA out of memory errors
- The Tesla P4 has 8GB VRAM which is plenty for face recognition
- If you see OOM errors, check for other processes using GPU: `nvidia-smi`
- Reduce camera resolution if needed
