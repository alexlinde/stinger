"""Main kiosk loop for face recognition and audio playback."""
import asyncio
import logging
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from ..core.config import settings
from ..core.face import engine
from .camera import Camera, create_camera
from .audio import play_theme
from .state import kiosk_state, RecognitionEvent

logger = logging.getLogger(__name__)


def draw_face_overlays(frame: np.ndarray, faces: list[dict]) -> np.ndarray:
    """Draw face bounding boxes and labels on the frame."""
    result = frame.copy()
    
    for face in faces:
        box = face["box"]
        x, y, w, h = box["x"], box["y"], box["width"], box["height"]
        is_match = face["is_match"]
        name = face["name"]
        
        # Color based on match status
        color = (136, 255, 0) if is_match else (68, 68, 255)  # BGR: green or red
        
        # Draw bounding box
        cv2.rectangle(result, (x, y), (x + w, y + h), color, 2)
        
        # Draw corner brackets for style
        bracket_len = min(w, h) // 6
        thickness = 3
        
        # Top-left
        cv2.line(result, (x, y), (x + bracket_len, y), color, thickness)
        cv2.line(result, (x, y), (x, y + bracket_len), color, thickness)
        
        # Top-right
        cv2.line(result, (x + w, y), (x + w - bracket_len, y), color, thickness)
        cv2.line(result, (x + w, y), (x + w, y + bracket_len), color, thickness)
        
        # Bottom-left
        cv2.line(result, (x, y + h), (x + bracket_len, y + h), color, thickness)
        cv2.line(result, (x, y + h), (x, y + h - bracket_len), color, thickness)
        
        # Bottom-right
        cv2.line(result, (x + w, y + h), (x + w - bracket_len, y + h), color, thickness)
        cv2.line(result, (x + w, y + h), (x + w, y + h - bracket_len), color, thickness)
        
        # Draw name label
        label = name if is_match else "Unknown"
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        font_thickness = 2
        
        (text_w, text_h), baseline = cv2.getTextSize(label, font, font_scale, font_thickness)
        
        # Label background
        label_y = y + h + 5
        cv2.rectangle(
            result,
            (x, label_y),
            (x + text_w + 10, label_y + text_h + 10),
            (0, 0, 0),
            -1
        )
        
        # Label text
        cv2.putText(
            result,
            label,
            (x + 5, label_y + text_h + 3),
            font,
            font_scale,
            color,
            font_thickness
        )
    
    return result


def frame_to_jpeg(frame: np.ndarray, quality: int = 80) -> bytes:
    """Convert a frame to JPEG bytes."""
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
    _, buffer = cv2.imencode(".jpg", frame, encode_params)
    return buffer.tobytes()


def run_recognition_sync(frame: np.ndarray) -> tuple[list[dict], list[dict], float]:
    """Run face recognition synchronously (for thread pool)."""
    start = time.time()
    faces, themes = engine.recognize_frame(frame)
    process_time_ms = (time.time() - start) * 1000
    return faces, themes, process_time_ms


async def kiosk_loop() -> None:
    """
    Main kiosk loop that runs continuously.
    - Captures frames from the camera
    - Runs face recognition (non-blocking)
    - Plays theme audio
    - Updates shared state for streaming
    - Adapts to hardware performance (low_power_mode)
    """
    logger.info("Starting kiosk loop")
    kiosk_state.running = True
    
    camera = create_camera()
    
    # Try to open camera
    if not camera.open():
        logger.error("Failed to open camera, kiosk will retry...")
    
    kiosk_state.camera_connected = camera.is_connected()
    
    # Adaptive recognition interval (can increase if hardware is slow)
    recognition_interval = settings.recognition_interval_ms / 1000.0
    min_interval = settings.min_recognition_interval_ms / 1000.0
    max_interval = settings.max_recognition_interval_ms / 1000.0
    target_process_time = settings.target_process_time_ms / 1000.0
    
    last_recognition_time = 0.0
    recognition_task: Optional[asyncio.Task] = None
    pending_frame: Optional[np.ndarray] = None
    
    # Performance tracking
    recent_process_times: list[float] = []
    frame_count = 0
    last_fps_log_time = time.time()
    
    if settings.low_power_mode:
        logger.info("Low power mode enabled - adaptive performance active")
    
    try:
        while kiosk_state.running:
            loop_start = time.time()
            frame_count += 1
            
            # Ensure camera is connected
            if not camera.is_connected():
                kiosk_state.camera_connected = False
                logger.warning("Camera disconnected, attempting reconnect...")
                if camera.reconnect():
                    kiosk_state.camera_connected = True
                else:
                    await asyncio.sleep(5.0)
                    continue
            
            # Capture frame
            frame = camera.read()
            
            if frame is None:
                kiosk_state.camera_connected = False
                await asyncio.sleep(0.1)
                continue
            
            kiosk_state.camera_connected = True
            
            # Check if recognition task completed
            if recognition_task is not None and recognition_task.done():
                try:
                    faces, themes_to_play, process_time_ms = recognition_task.result()
                    process_time_sec = process_time_ms / 1000.0
                    
                    # Track processing times for adaptive interval
                    recent_process_times.append(process_time_sec)
                    if len(recent_process_times) > 10:
                        recent_process_times.pop(0)
                    
                    # Adaptive recognition interval (low power mode)
                    if settings.low_power_mode and recent_process_times:
                        avg_process_time = sum(recent_process_times) / len(recent_process_times)
                        
                        if avg_process_time > target_process_time:
                            # Processing is slow - increase interval
                            recognition_interval = min(
                                max_interval,
                                recognition_interval * 1.2
                            )
                        elif avg_process_time < target_process_time * 0.5:
                            # Processing is fast - decrease interval
                            recognition_interval = max(
                                min_interval,
                                recognition_interval * 0.9
                            )
                    
                    # Update faces in state
                    kiosk_state.set_faces(faces)
                    
                    # Play theme audio
                    for theme in themes_to_play:
                        theme_path = Path(theme["path"])
                        if theme_path.exists():
                            play_theme(theme_path)
                    
                    # Push event for WebSocket clients
                    if faces:
                        event = RecognitionEvent(
                            faces=faces,
                            themes_played=themes_to_play,
                            timestamp=time.time(),
                            process_time_ms=process_time_ms,
                        )
                        kiosk_state.push_event(event)
                except Exception as exc:
                    logger.error("Recognition error: %s", exc)
                
                recognition_task = None
            
            # Start new recognition if it's time and no recognition is running
            now = time.time()
            should_recognize = (now - last_recognition_time) >= recognition_interval
            
            if should_recognize and engine.is_initialized and recognition_task is None:
                last_recognition_time = now
                pending_frame = frame.copy()
                recognition_task = asyncio.create_task(
                    asyncio.to_thread(run_recognition_sync, pending_frame)
                )
            
            # Use cached faces for overlay
            faces = kiosk_state.get_faces()
            
            # Draw overlays on frame
            if faces:
                frame = draw_face_overlays(frame, faces)
            
            # Convert to JPEG and update state
            jpeg_bytes = frame_to_jpeg(frame)
            kiosk_state.set_frame(jpeg_bytes)
            
            # Log FPS periodically (every 30 seconds)
            if settings.low_power_mode and (now - last_fps_log_time) >= 30.0:
                elapsed_log = now - last_fps_log_time
                fps = frame_count / elapsed_log
                avg_proc = (sum(recent_process_times) / len(recent_process_times) * 1000) if recent_process_times else 0
                logger.info(
                    "Performance: %.1f FPS, avg recognition: %.0fms, interval: %.0fms",
                    fps, avg_proc, recognition_interval * 1000
                )
                frame_count = 0
                last_fps_log_time = now
            
            # Calculate sleep time to maintain target FPS
            elapsed = time.time() - loop_start
            target_interval = 1.0 / settings.camera_fps
            sleep_time = max(0.001, target_interval - elapsed)
            await asyncio.sleep(sleep_time)
            
    except asyncio.CancelledError:
        logger.info("Kiosk loop cancelled")
    except Exception as exc:
        logger.exception("Kiosk loop error: %s", exc)
    finally:
        # Cancel pending recognition task
        if recognition_task is not None and not recognition_task.done():
            recognition_task.cancel()
            try:
                await recognition_task
            except asyncio.CancelledError:
                pass
        
        camera.close()
        kiosk_state.running = False
        kiosk_state.camera_connected = False
        logger.info("Kiosk loop stopped")


async def start_kiosk() -> asyncio.Task:
    """Start the kiosk loop as a background task."""
    if not settings.kiosk_enabled:
        logger.info("Kiosk is disabled in settings")
        return None
    
    task = asyncio.create_task(kiosk_loop())
    return task


def stop_kiosk() -> None:
    """Signal the kiosk loop to stop."""
    kiosk_state.running = False

