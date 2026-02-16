"""Kiosk API routes - MJPEG stream and WebSocket events."""
import asyncio
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from ..core.face import engine
from ..core.models import KioskStatusResponse
from ..kiosk.state import kiosk_state

router = APIRouter(prefix="/kiosk", tags=["kiosk"])
logger = logging.getLogger(__name__)


async def generate_mjpeg():
    """Generator for MJPEG stream."""
    boundary = b"--frame\r\n"
    
    while True:
        frame = kiosk_state.get_frame()
        
        if frame is not None:
            yield (
                boundary +
                b"Content-Type: image/jpeg\r\n" +
                f"Content-Length: {len(frame)}\r\n\r\n".encode() +
                frame +
                b"\r\n"
            )
        
        # Control frame rate for streaming
        await asyncio.sleep(1.0 / 15)  # ~15 FPS for stream


@router.get("/stream")
async def mjpeg_stream():
    """
    MJPEG video stream endpoint.
    Use this in an <img> tag: <img src="/api/kiosk/stream">
    """
    return StreamingResponse(
        generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/frame")
async def get_current_frame():
    """Get the current frame as a single JPEG image."""
    frame = kiosk_state.get_frame()
    
    if frame is None:
        return StreamingResponse(
            iter([b""]),
            media_type="image/jpeg",
            status_code=503,
        )
    
    return StreamingResponse(
        iter([frame]),
        media_type="image/jpeg",
    )


@router.get("/status", response_model=KioskStatusResponse)
async def get_kiosk_status():
    """Get the current kiosk status."""
    return KioskStatusResponse(
        running=kiosk_state.running,
        camera_connected=kiosk_state.camera_connected,
        fps=round(kiosk_state.fps, 1),
        frame_count=kiosk_state.frame_count,
        people_count=len(engine.people),
        cuda_error=engine.cuda_error,
    )


@router.websocket("/ws")
async def kiosk_websocket(websocket: WebSocket):
    """
    WebSocket for real-time recognition events.
    
    Sends messages in the format:
    {
        "type": "recognition",
        "faces": [...],
        "themes_played": [...],
        "timestamp": 1234567890.123,
        "process_time_ms": 85.2
    }
    """
    await websocket.accept()
    logger.info("Kiosk WebSocket client connected")
    
    try:
        # Send initial status
        await websocket.send_json({
            "type": "status",
            "running": kiosk_state.running,
            "camera_connected": kiosk_state.camera_connected,
            "people_count": len(engine.people),
        })
        
        while True:
            # Wait for recognition events
            try:
                event = await asyncio.wait_for(
                    kiosk_state.get_event(),
                    timeout=5.0
                )
                
                await websocket.send_json({
                    "type": "recognition",
                    "faces": event.faces,
                    "themes_played": event.themes_played,
                    "timestamp": event.timestamp,
                    "process_time_ms": event.process_time_ms,
                })
                
            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({
                    "type": "heartbeat",
                    "timestamp": time.time(),
                    "running": kiosk_state.running,
                    "camera_connected": kiosk_state.camera_connected,
                    "fps": round(kiosk_state.fps, 1),
                })
                
    except WebSocketDisconnect:
        logger.info("Kiosk WebSocket client disconnected")
    except Exception as exc:
        logger.warning("Kiosk WebSocket error: %s", exc)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass

