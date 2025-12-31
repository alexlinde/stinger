"""Shared kiosk state for frame buffer and recognition events."""
import asyncio
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class RecognitionEvent:
    """A recognition event to broadcast to WebSocket clients."""
    faces: list[dict]
    themes_played: list[dict]
    timestamp: float
    process_time_ms: float


@dataclass
class KioskState:
    """Thread-safe shared state for the kiosk."""
    
    # Current frame with overlays drawn (JPEG bytes)
    _current_frame: Optional[bytes] = None
    _frame_lock: threading.Lock = field(default_factory=threading.Lock)
    
    # Latest recognition result
    _latest_faces: list[dict] = field(default_factory=list)
    _latest_lock: threading.Lock = field(default_factory=threading.Lock)
    
    # Event queue for WebSocket broadcast
    _event_queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=100))
    
    # Stats
    _frame_count: int = 0
    _fps: float = 0.0
    _last_fps_time: float = field(default_factory=time.time)
    _fps_frame_count: int = 0
    
    # Status
    _running: bool = False
    _camera_connected: bool = False
    
    def set_frame(self, frame_bytes: bytes) -> None:
        """Update the current frame (thread-safe)."""
        with self._frame_lock:
            self._current_frame = frame_bytes
            self._frame_count += 1
            self._fps_frame_count += 1
            
            # Update FPS every second
            now = time.time()
            elapsed = now - self._last_fps_time
            if elapsed >= 1.0:
                self._fps = self._fps_frame_count / elapsed
                self._fps_frame_count = 0
                self._last_fps_time = now
    
    def get_frame(self) -> Optional[bytes]:
        """Get the current frame (thread-safe)."""
        with self._frame_lock:
            return self._current_frame
    
    def set_faces(self, faces: list[dict]) -> None:
        """Update the latest face recognition results (thread-safe)."""
        with self._latest_lock:
            self._latest_faces = faces.copy()
    
    def get_faces(self) -> list[dict]:
        """Get the latest face recognition results (thread-safe)."""
        with self._latest_lock:
            return self._latest_faces.copy()
    
    def push_event(self, event: RecognitionEvent) -> None:
        """Push a recognition event to the queue (non-blocking)."""
        try:
            self._event_queue.put_nowait(event)
        except asyncio.QueueFull:
            # Drop oldest event and add new one
            try:
                self._event_queue.get_nowait()
                self._event_queue.put_nowait(event)
            except asyncio.QueueEmpty:
                pass
    
    async def get_event(self) -> RecognitionEvent:
        """Wait for and return the next recognition event."""
        return await self._event_queue.get()
    
    def get_event_nowait(self) -> Optional[RecognitionEvent]:
        """Get an event without waiting, returns None if queue is empty."""
        try:
            return self._event_queue.get_nowait()
        except asyncio.QueueEmpty:
            return None
    
    @property
    def frame_count(self) -> int:
        with self._frame_lock:
            return self._frame_count
    
    @property
    def fps(self) -> float:
        with self._frame_lock:
            # If no recent update, calculate current FPS
            now = time.time()
            elapsed = now - self._last_fps_time
            if elapsed > 0 and self._fps_frame_count > 0:
                return self._fps_frame_count / elapsed
            return self._fps
    
    @property
    def running(self) -> bool:
        return self._running
    
    @running.setter
    def running(self, value: bool) -> None:
        self._running = value
    
    @property
    def camera_connected(self) -> bool:
        return self._camera_connected
    
    @camera_connected.setter
    def camera_connected(self, value: bool) -> None:
        self._camera_connected = value


# Global kiosk state instance
kiosk_state = KioskState()

