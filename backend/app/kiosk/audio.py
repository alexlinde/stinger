"""Local audio playback using pygame."""
import logging
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Pygame is initialized lazily to avoid issues on systems without audio
_pygame_initialized = False
_pygame_lock = threading.Lock()


def _ensure_pygame() -> bool:
    """Initialize pygame mixer if not already done."""
    global _pygame_initialized
    
    with _pygame_lock:
        if _pygame_initialized:
            return True
        
        try:
            import pygame
            pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=2048)
            _pygame_initialized = True
            logger.info("Pygame mixer initialized")
            return True
        except Exception as exc:
            logger.error("Failed to initialize pygame mixer: %s", exc)
            return False


class AudioPlayer:
    """Audio player for theme songs using pygame."""
    
    def __init__(self):
        self._current_channel: Optional["pygame.mixer.Channel"] = None
        self._current_path: Optional[Path] = None
        self._lock = threading.Lock()
        self._sound_cache: dict[str, "pygame.mixer.Sound"] = {}
    
    def play(self, path: Path) -> bool:
        """
        Play an audio file. Non-blocking.
        Returns True if playback started successfully.
        """
        if not _ensure_pygame():
            return False
        
        import pygame
        
        with self._lock:
            try:
                path_str = str(path)
                
                # Get or load the sound
                if path_str not in self._sound_cache:
                    logger.info("Loading audio file: %s", path)
                    sound = pygame.mixer.Sound(path_str)
                    self._sound_cache[path_str] = sound
                else:
                    sound = self._sound_cache[path_str]
                
                # Play on a new channel
                channel = sound.play()
                
                if channel is None:
                    logger.warning("No available channel to play audio")
                    return False
                
                self._current_channel = channel
                self._current_path = path
                
                logger.info("Playing audio: %s", path.name)
                return True
                
            except Exception as exc:
                logger.error("Failed to play audio %s: %s", path, exc)
                return False
    
    def stop(self) -> None:
        """Stop the currently playing audio."""
        if not _pygame_initialized:
            return
        
        with self._lock:
            if self._current_channel is not None:
                self._current_channel.stop()
                self._current_channel = None
                self._current_path = None
    
    def is_playing(self) -> bool:
        """Check if audio is currently playing."""
        if not _pygame_initialized:
            return False
        
        with self._lock:
            if self._current_channel is None:
                return False
            return self._current_channel.get_busy()
    
    def get_current(self) -> Optional[Path]:
        """Get the path of the currently playing file."""
        with self._lock:
            if self._current_channel is not None and self._current_channel.get_busy():
                return self._current_path
            return None
    
    def clear_cache(self) -> None:
        """Clear the sound cache to free memory."""
        with self._lock:
            self._sound_cache.clear()
            logger.info("Audio cache cleared")


# Global audio player instance
audio_player = AudioPlayer()


def play_theme(path: Path) -> bool:
    """Convenience function to play a theme song."""
    return audio_player.play(path)


def stop_audio() -> None:
    """Convenience function to stop audio playback."""
    audio_player.stop()

