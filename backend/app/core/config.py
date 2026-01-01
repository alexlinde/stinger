"""Application configuration."""
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # Paths
    data_dir: Path = Path("data")
    people_dir: Path = Path("data/people")
    
    # Face recognition
    detection_score_threshold: float = 0.5
    embedding_distance_threshold: float = 0.6
    upscale_factor: float = 1.5
    
    # Audio cooldown
    audio_cooldown_seconds: float = 30.0
    
    # InsightFace model
    insightface_model: str = "buffalo_l"
    
    # Camera settings
    camera_device: int = 0
    camera_width: int = 1280
    camera_height: int = 720
    camera_fps: int = 15
    
    # Kiosk settings
    kiosk_enabled: bool = True
    recognition_interval_ms: int = 200
    
    # Performance settings for slower hardware
    # Set to true to enable adaptive frame skipping and reduced processing
    low_power_mode: bool = False
    # Skip upscaling retry when no face detected (saves CPU)
    skip_upscale_retry: bool = False
    # Minimum recognition interval when adaptive (prevents CPU saturation)
    min_recognition_interval_ms: int = 100
    # Maximum recognition interval when adaptive (prevents laggy detection)
    max_recognition_interval_ms: int = 1000
    # Target processing time in ms - if exceeded, intervals are increased
    target_process_time_ms: int = 150
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure directories exist
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.people_dir.mkdir(parents=True, exist_ok=True)

