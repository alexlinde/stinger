"""People management API routes."""
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from ..core.face import engine
from ..core.models import (
    PersonCreate,
    PersonResponse,
    PersonListResponse,
    PhotoResponse,
    PhotoListResponse,
    ThemeResponse,
)
from ..core.config import settings

router = APIRouter(prefix="/people", tags=["people"])


def _get_person_response(name: str) -> PersonResponse:
    """Build a PersonResponse from a person name."""
    person = engine.people.get(name)
    if not person:
        raise HTTPException(status_code=404, detail=f"Person '{name}' not found")
    
    return PersonResponse(
        name=person.name,
        photo_count=len(person.photo_paths),
        embedding_count=len(person.embeddings),
        has_theme=person.has_theme(),
        theme_filename=person.theme_path.name if person.theme_path else None,
        preview_url=engine.get_preview_url(name),
    )


@router.get("", response_model=PersonListResponse)
async def list_people():
    """List all people in the gallery."""
    people = [_get_person_response(name) for name in sorted(engine.people.keys())]
    return PersonListResponse(people=people, total=len(people))


@router.post("", response_model=PersonResponse, status_code=201)
async def create_person(data: PersonCreate):
    """Create a new person."""
    if data.name in engine.people:
        raise HTTPException(status_code=409, detail=f"Person '{data.name}' already exists")
    
    engine.add_person(data.name)
    return _get_person_response(data.name)


@router.get("/{name}", response_model=PersonResponse)
async def get_person(name: str):
    """Get details for a specific person."""
    return _get_person_response(name)


@router.delete("/{name}", status_code=204)
async def delete_person(name: str):
    """Delete a person and all their data."""
    if not engine.delete_person(name):
        raise HTTPException(status_code=404, detail=f"Person '{name}' not found")


# Photo routes
@router.get("/{name}/photos", response_model=PhotoListResponse)
async def list_photos(name: str):
    """List all photos for a person."""
    person = engine.people.get(name)
    if not person:
        raise HTTPException(status_code=404, detail=f"Person '{name}' not found")
    
    photos = []
    for path in person.photo_paths:
        photos.append(PhotoResponse(
            id=path.name,
            filename=path.name,
            url=f"/api/people/{name}/photos/{path.name}/file",
            has_embedding=True,
        ))
    
    return PhotoListResponse(photos=photos, total=len(photos))


@router.post("/{name}/photos", response_model=PhotoResponse, status_code=201)
async def upload_photo(
    name: str,
    file: Annotated[UploadFile, File(description="Face photo to upload")],
):
    """Upload a new photo for a person."""
    if name not in engine.people:
        raise HTTPException(status_code=404, detail=f"Person '{name}' not found")
    
    # Generate unique filename
    ext = Path(file.filename or "photo.jpg").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    
    # Read file content
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    
    # Add photo (this also computes embedding)
    result = engine.add_photo(name, content, filename)
    if not result:
        raise HTTPException(status_code=400, detail="No face detected in photo")
    
    return PhotoResponse(
        id=filename,
        filename=filename,
        url=f"/api/people/{name}/photos/{filename}/file",
        has_embedding=True,
    )


@router.get("/{name}/photos/{photo_id}/file")
async def get_photo_file(name: str, photo_id: str):
    """Get the actual photo file."""
    photo_path = settings.people_dir / name / photo_id
    if not photo_path.exists():
        raise HTTPException(status_code=404, detail="Photo not found")
    
    return FileResponse(photo_path, media_type="image/jpeg")


@router.delete("/{name}/photos/{photo_id}", status_code=204)
async def delete_photo(name: str, photo_id: str):
    """Delete a photo."""
    if not engine.delete_photo(name, photo_id):
        raise HTTPException(status_code=404, detail="Photo not found")


@router.put("/{name}/preview", response_model=PersonResponse)
async def set_preview_photo(name: str, photo_id: str):
    """Set the preview photo for a person."""
    if name not in engine.people:
        raise HTTPException(status_code=404, detail=f"Person '{name}' not found")
    
    if not engine.set_preview_photo(name, photo_id):
        raise HTTPException(status_code=404, detail="Photo not found")
    
    return _get_person_response(name)


# Theme routes
@router.get("/{name}/theme", response_model=ThemeResponse)
async def get_theme(name: str):
    """Get the theme song for a person."""
    person = engine.people.get(name)
    if not person:
        raise HTTPException(status_code=404, detail=f"Person '{name}' not found")
    
    if not person.has_theme():
        raise HTTPException(status_code=404, detail="No theme set")
    
    return ThemeResponse(
        filename=person.theme_path.name if person.theme_path else "theme.mp3",
        url=f"/api/people/{name}/theme/file",
    )


@router.put("/{name}/theme", response_model=ThemeResponse)
async def upload_theme(
    name: str,
    file: Annotated[UploadFile, File(description="Theme audio file (MP3, WAV, M4A)")],
):
    """Upload or replace the theme song for a person."""
    if name not in engine.people:
        raise HTTPException(status_code=404, detail=f"Person '{name}' not found")
    
    # Keep original filename for display
    filename = file.filename or "theme.mp3"
    
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    
    result = engine.set_theme(name, content, filename)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to save theme")
    
    return ThemeResponse(
        filename=filename,
        url=f"/api/people/{name}/theme/file",
    )


@router.get("/{name}/theme/file")
async def get_theme_file(name: str):
    """Get the actual theme audio file."""
    person = engine.people.get(name)
    if not person or not person.theme_path:
        raise HTTPException(status_code=404, detail="Theme not found")
    
    if not person.theme_path.exists():
        raise HTTPException(status_code=404, detail="Theme file not found")
    
    # Determine media type from extension
    ext = person.theme_path.suffix.lower()
    media_types = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
    }
    media_type = media_types.get(ext, "audio/mpeg")
    
    return FileResponse(person.theme_path, media_type=media_type)


@router.delete("/{name}/theme", status_code=204)
async def delete_theme(name: str):
    """Delete the theme song for a person."""
    if not engine.delete_theme(name):
        raise HTTPException(status_code=404, detail="Theme not found")

