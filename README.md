# Stinger

Local face recognition system with theme song playback. Designed to run on a dedicated Linux machine with a USB webcam and speakers.

## Features

- **Live Face Recognition**: Real-time face detection and matching via USB webcam
- **Theme Song Playback**: Plays a unique theme song when a person is recognized (with 30-second cooldown)
- **Web Management Interface**: Add people, upload photos, set theme songs
- **Live Camera Feed**: View the webcam feed with face detection overlays from any browser on the local network

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
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/         # React pages
│   │   │   ├── LiveView   # Live camera feed
│   │   │   ├── PeopleList # People gallery
│   │   │   └── ...
│   │   └── ...
│   └── package.json
├── data/
│   └── people/            # Photos and themes
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

# Run the setup script
sudo ./deploy/scripts/setup.sh
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

Create `/opt/stinger/backend/.env`:

```bash
# Camera
CAMERA_DEVICE=0
CAMERA_WIDTH=1280
CAMERA_HEIGHT=720
CAMERA_FPS=15

# Kiosk
KIOSK_ENABLED=true
RECOGNITION_INTERVAL_MS=200

# Face Recognition
EMBEDDING_DISTANCE_THRESHOLD=0.6
AUDIO_COOLDOWN_SECONDS=30.0
```

## Adding People

1. Open the management interface at http://your-server:8000
2. Click "Add Person" and enter a name
3. Upload face photos (at least one clear frontal photo)
4. Optionally set a preview photo for the gallery
5. Optionally upload a theme song (MP3, WAV, or M4A)

## API Endpoints

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
| GET | `/api/kiosk/stream` | MJPEG video stream |
| GET | `/api/kiosk/status` | Kiosk status |
| WS | `/api/kiosk/ws` | Recognition events |

## Recognition Tuning

- **Distance Threshold**: Lower values (e.g., 0.5) are stricter, higher values (e.g., 0.7) are more lenient
- **More Photos = Better**: Add 3-5 photos per person for best results
- **Photo Quality**: Use well-lit, frontal face photos

## Troubleshooting

### Camera not working
- Check USB connection: `lsusb`
- Verify permissions: user must be in `video` group
- Test with: `v4l2-ctl --list-devices`

### Audio not playing
- Check audio output: `aplay -l`
- Verify permissions: user must be in `audio` group
- Test with: `speaker-test -t wav`

### Recognition too slow
- Increase `RECOGNITION_INTERVAL_MS` (default 200ms)
- Use a more powerful machine
- Consider using GPU acceleration (CUDA)

## License

MIT License

