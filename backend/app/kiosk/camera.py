"""USB webcam capture using OpenCV."""
import logging
import threading
import time
from typing import Optional

import cv2
import numpy as np

from ..core.config import settings

logger = logging.getLogger(__name__)


class Camera:
    """USB webcam capture wrapper using OpenCV."""
    
    def __init__(
        self,
        device: int = 0,
        width: int = 1280,
        height: int = 720,
        fps: int = 15,
    ):
        self.device = device
        self.width = width
        self.height = height
        self.fps = fps
        
        self._capture: Optional[cv2.VideoCapture] = None
        self._lock = threading.Lock()
        self._connected = False
    
    def open(self) -> bool:
        """Open the camera device."""
        with self._lock:
            if self._capture is not None:
                return self._connected
            
            logger.info("Opening camera device %d at %dx%d @ %d FPS", 
                       self.device, self.width, self.height, self.fps)
            
            self._capture = cv2.VideoCapture(self.device)
            
            if not self._capture.isOpened():
                logger.error("Failed to open camera device %d", self.device)
                self._capture = None
                self._connected = False
                return False
            
            # Configure camera
            self._capture.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self._capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self._capture.set(cv2.CAP_PROP_FPS, self.fps)
            
            # Set buffer size to 1 to get most recent frame
            self._capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            
            # Log actual settings
            actual_w = int(self._capture.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_h = int(self._capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = self._capture.get(cv2.CAP_PROP_FPS)
            
            logger.info("Camera opened: actual resolution %dx%d @ %.1f FPS", 
                       actual_w, actual_h, actual_fps)
            
            self._connected = True
            return True
    
    def close(self) -> None:
        """Close the camera device."""
        with self._lock:
            if self._capture is not None:
                logger.info("Closing camera device %d", self.device)
                self._capture.release()
                self._capture = None
                self._connected = False
    
    def read(self) -> Optional[np.ndarray]:
        """Read a frame from the camera. Returns None if not available."""
        with self._lock:
            if self._capture is None or not self._connected:
                return None
            
            ret, frame = self._capture.read()
            
            if not ret or frame is None:
                logger.warning("Failed to read frame from camera")
                return None
            
            return frame
    
    def is_connected(self) -> bool:
        """Check if the camera is connected and working."""
        with self._lock:
            return self._connected and self._capture is not None
    
    def reconnect(self, max_attempts: int = 3, delay: float = 1.0) -> bool:
        """Attempt to reconnect to the camera."""
        self.close()
        
        for attempt in range(max_attempts):
            logger.info("Camera reconnection attempt %d/%d", attempt + 1, max_attempts)
            if self.open():
                return True
            time.sleep(delay)
        
        logger.error("Failed to reconnect to camera after %d attempts", max_attempts)
        return False


def create_camera() -> Camera:
    """Create a camera instance from settings."""
    return Camera(
        device=settings.camera_device,
        width=settings.camera_width,
        height=settings.camera_height,
        fps=settings.camera_fps,
    )

