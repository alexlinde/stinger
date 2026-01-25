"""Application configuration."""
import json
import logging
import threading
from pathlib import Path
from typing import Optional

from pydantic import BaseModel
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables / .env file.
    These are read-only at runtime and require a server restart to change.
    """
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # Paths
    data_dir: Path = Path("data")
    
    # InsightFace model
    insightface_model: str = "buffalo_l"
    
    # Camera hardware settings (require restart to change camera)
    camera_device: int = 0
    camera_width: int = 1280
    camera_height: int = 720
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore extra env vars (e.g., runtime settings in .env)
    
    @property
    def people_dir(self) -> Path:
        """Derived path for people directory."""
        return self.data_dir / "people"
    
    @property
    def runtime_settings_path(self) -> Path:
        """Path to the runtime settings JSON file."""
        return self.data_dir / "runtime_settings.json"


class RuntimeSettings(BaseModel):
    """
    Runtime settings that can be changed without restarting the server.
    Stored in a JSON file and hot-reloaded when changed.
    """
    
    # Face recognition thresholds
    detection_score_threshold: float = 0.5
    embedding_distance_threshold: float = 0.6
    upscale_factor: float = 1.5
    
    # Audio
    audio_cooldown_seconds: float = 30.0
    
    # Camera runtime settings
    camera_fps: int = 15
    camera_masks: str = ""  # JSON string of mask rectangles
    mirror_feed: bool = False  # Mirror/flip the video feed horizontally
    
    # Kiosk behavior
    kiosk_enabled: bool = True
    recognition_interval_ms: int = 200
    
    # Performance - low_power_mode enables adaptive intervals
    low_power_mode: bool = False
    
    @property
    def min_recognition_interval_ms(self) -> int:
        """Minimum interval when adaptive (auto-calculated)."""
        if self.low_power_mode:
            return max(50, int(self.recognition_interval_ms * 0.5))
        return self.recognition_interval_ms
    
    @property
    def max_recognition_interval_ms(self) -> int:
        """Maximum interval when adaptive (auto-calculated)."""
        if self.low_power_mode:
            return min(2000, int(self.recognition_interval_ms * 5))
        return self.recognition_interval_ms
    
    @property
    def target_process_time_ms(self) -> int:
        """Target process time before throttling (auto-calculated)."""
        if self.low_power_mode:
            return max(100, int(self.recognition_interval_ms * 0.75))
        return 150
    
    @property
    def skip_upscale_retry(self) -> bool:
        """Whether to skip upscale retry (auto-set based on low_power_mode)."""
        return self.low_power_mode


class RuntimeSettingsManager:
    """
    Thread-safe manager for runtime settings with hot-reload support.
    """
    
    def __init__(self, settings_path: Path):
        self._path = settings_path
        self._settings: RuntimeSettings = RuntimeSettings()
        self._lock = threading.RLock()
        self._load()
    
    def _load(self) -> None:
        """Load settings from JSON file."""
        with self._lock:
            if self._path.exists():
                try:
                    with open(self._path, "r") as f:
                        data = json.load(f)
                    self._settings = RuntimeSettings(**data)
                    logger.info("Loaded runtime settings from %s", self._path)
                except Exception as e:
                    logger.warning("Failed to load runtime settings: %s, using defaults", e)
                    self._settings = RuntimeSettings()
            else:
                logger.info("No runtime settings file found, using defaults")
                self._settings = RuntimeSettings()
                # Save defaults to create the file
                self._save_internal()
    
    def _save_internal(self) -> None:
        """Internal save without lock (caller must hold lock)."""
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with open(self._path, "w") as f:
                json.dump(self._settings.model_dump(), f, indent=2)
            logger.info("Saved runtime settings to %s", self._path)
        except Exception as e:
            logger.error("Failed to save runtime settings: %s", e)
            raise
    
    def reload(self) -> RuntimeSettings:
        """Reload settings from disk."""
        self._load()
        return self._settings
    
    def save(self, new_settings: RuntimeSettings) -> None:
        """Save new settings to disk and update in-memory copy."""
        with self._lock:
            self._settings = new_settings
            self._save_internal()
    
    def update(self, **kwargs) -> RuntimeSettings:
        """Update specific settings and save."""
        with self._lock:
            current_dict = self._settings.model_dump()
            current_dict.update(kwargs)
            self._settings = RuntimeSettings(**current_dict)
            self._save_internal()
            return self._settings
    
    def get(self) -> RuntimeSettings:
        """Get current settings (thread-safe read)."""
        with self._lock:
            return self._settings


# Global instances
settings = Settings()

# Ensure directories exist
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.people_dir.mkdir(parents=True, exist_ok=True)

# Initialize runtime settings manager
runtime_settings_manager = RuntimeSettingsManager(settings.runtime_settings_path)


def get_runtime_settings() -> RuntimeSettings:
    """Get the current runtime settings."""
    return runtime_settings_manager.get()

