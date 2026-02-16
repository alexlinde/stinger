"""Pydantic models for API requests and responses."""
from typing import Optional
from pydantic import BaseModel


class PersonCreate(BaseModel):
    """Request model for creating a person."""
    name: str


class PersonResponse(BaseModel):
    """Response model for a person."""
    name: str
    photo_count: int
    embedding_count: int
    has_theme: bool
    theme_filename: Optional[str] = None
    preview_url: Optional[str] = None


class PersonListResponse(BaseModel):
    """Response model for listing people."""
    people: list[PersonResponse]
    total: int


class PhotoResponse(BaseModel):
    """Response model for a photo."""
    id: str
    filename: str
    url: str
    has_embedding: bool


class PhotoListResponse(BaseModel):
    """Response model for listing photos."""
    photos: list[PhotoResponse]
    total: int


class ThemeResponse(BaseModel):
    """Response model for a theme."""
    filename: str
    url: str


class FaceBox(BaseModel):
    """A detected face bounding box."""
    x: int
    y: int
    width: int
    height: int


class FaceMatch(BaseModel):
    """A face match result."""
    box: FaceBox
    name: str
    distance: float
    is_match: bool


class ThemeToPlay(BaseModel):
    """Theme song that should be played."""
    name: str
    path: str  # Local file path instead of URL


class RecognitionResult(BaseModel):
    """Result of face recognition on a frame."""
    faces: list[FaceMatch]
    play_themes: list[ThemeToPlay]
    frame_id: Optional[int] = None
    process_time_ms: Optional[float] = None


class RecognitionRequest(BaseModel):
    """Request for one-shot recognition."""
    image_base64: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    model_loaded: bool
    people_count: int


class KioskStatusResponse(BaseModel):
    """Kiosk status response."""
    running: bool
    camera_connected: bool
    fps: float
    frame_count: int
    people_count: int
    cuda_error: Optional[str] = None

