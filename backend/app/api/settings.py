"""Settings API endpoints."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.config import settings, runtime_settings_manager, RuntimeSettings

router = APIRouter(prefix="/settings", tags=["settings"])


class ConfigSettingsResponse(BaseModel):
    """Read-only configuration settings (require restart to change)."""
    
    host: str = Field(description="Server bind address")
    port: int = Field(description="Server port")
    debug: bool = Field(description="Debug/verbose logging enabled")
    data_dir: str = Field(description="Data storage directory path")
    insightface_model: str = Field(description="InsightFace model name")
    camera_device: int = Field(description="Camera device index")
    camera_width: int = Field(description="Camera resolution width")
    camera_height: int = Field(description="Camera resolution height")


class RuntimeSettingsResponse(BaseModel):
    """Runtime settings that can be changed without restart."""
    
    detection_score_threshold: float = Field(description="Face detection confidence threshold (0.0-1.0)")
    embedding_distance_threshold: float = Field(description="Face matching distance threshold (lower = stricter)")
    upscale_factor: float = Field(description="Image upscale factor for better detection")
    audio_cooldown_seconds: float = Field(description="Seconds between theme plays for same person")
    camera_fps: int = Field(description="Target frames per second")
    camera_masks: str = Field(description="JSON string of mask rectangles with normalized coordinates")
    mirror_feed: bool = Field(description="Mirror/flip the video feed horizontally")
    kiosk_enabled: bool = Field(description="Enable automatic face recognition")
    recognition_interval_ms: int = Field(description="Milliseconds between recognition attempts")
    low_power_mode: bool = Field(description="Enable adaptive performance for slower hardware")


class AllSettingsResponse(BaseModel):
    """Combined response with both config and runtime settings."""
    
    config: ConfigSettingsResponse = Field(description="Read-only configuration settings")
    runtime: RuntimeSettingsResponse = Field(description="Editable runtime settings")


class RuntimeSettingsUpdate(BaseModel):
    """Partial update model for runtime settings."""
    
    detection_score_threshold: Optional[float] = None
    embedding_distance_threshold: Optional[float] = None
    upscale_factor: Optional[float] = None
    audio_cooldown_seconds: Optional[float] = None
    camera_fps: Optional[int] = None
    camera_masks: Optional[str] = None
    mirror_feed: Optional[bool] = None
    kiosk_enabled: Optional[bool] = None
    recognition_interval_ms: Optional[int] = None
    low_power_mode: Optional[bool] = None


def get_config_settings() -> ConfigSettingsResponse:
    """Get read-only configuration settings."""
    return ConfigSettingsResponse(
        host=settings.host,
        port=settings.port,
        debug=settings.debug,
        data_dir=str(settings.data_dir),
        insightface_model=settings.insightface_model,
        camera_device=settings.camera_device,
        camera_width=settings.camera_width,
        camera_height=settings.camera_height,
    )


def get_runtime_settings() -> RuntimeSettingsResponse:
    """Get current runtime settings."""
    rs = runtime_settings_manager.get()
    return RuntimeSettingsResponse(
        detection_score_threshold=rs.detection_score_threshold,
        embedding_distance_threshold=rs.embedding_distance_threshold,
        upscale_factor=rs.upscale_factor,
        audio_cooldown_seconds=rs.audio_cooldown_seconds,
        camera_fps=rs.camera_fps,
        camera_masks=rs.camera_masks,
        mirror_feed=rs.mirror_feed,
        kiosk_enabled=rs.kiosk_enabled,
        recognition_interval_ms=rs.recognition_interval_ms,
        low_power_mode=rs.low_power_mode,
    )


@router.get("", response_model=AllSettingsResponse)
async def get_settings():
    """
    Get all settings.
    
    Returns both read-only configuration settings and editable runtime settings.
    """
    return AllSettingsResponse(
        config=get_config_settings(),
        runtime=get_runtime_settings(),
    )


@router.put("", response_model=RuntimeSettingsResponse)
async def update_settings(update: RuntimeSettingsUpdate):
    """
    Update runtime settings.
    
    Only runtime settings can be updated via this endpoint.
    Changes take effect immediately without requiring a server restart.
    """
    # Filter to only non-None values
    update_dict = update.model_dump(exclude_none=True)
    
    if not update_dict:
        # No updates provided, return current settings
        return get_runtime_settings()
    
    try:
        # Update and save runtime settings
        runtime_settings_manager.update(**update_dict)
        return get_runtime_settings()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {e}")

