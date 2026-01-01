"""Face detection and recognition using InsightFace."""
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageOps
from insightface.app import FaceAnalysis

from .config import settings

logger = logging.getLogger(__name__)


@dataclass
class Person:
    """Represents a known person with their embeddings and audio state."""
    name: str
    embeddings: list[np.ndarray] = field(default_factory=list)
    theme_path: Optional[Path] = None
    photo_paths: list[Path] = field(default_factory=list)
    preview_photo_id: Optional[str] = None
    last_seen: float = 0.0
    last_played: float = 0.0

    def add_embedding(self, embedding: np.ndarray) -> None:
        """Add a new embedding for this person."""
        self.embeddings.append(embedding)

    def has_theme(self) -> bool:
        """Check if this person has a theme audio file."""
        return self.theme_path is not None

    def should_play_theme(self, now: float) -> bool:
        """Check if theme should play based on cooldown rules."""
        if not self.has_theme():
            return False
        time_since_seen = now - self.last_seen
        return self.last_played == 0.0 or time_since_seen >= settings.audio_cooldown_seconds

    def mark_seen(self, now: float) -> None:
        """Update last seen timestamp."""
        self.last_seen = now

    def mark_played(self, now: float) -> None:
        """Update last played timestamp."""
        self.last_played = now


@dataclass
class FaceDetection:
    """A detected face with its embedding."""
    x: int
    y: int
    width: int
    height: int
    score: float
    embedding: np.ndarray


class FaceRecognitionEngine:
    """Face detection and recognition engine using InsightFace."""

    def __init__(self):
        self._detector: Optional[FaceAnalysis] = None
        self._people: dict[str, Person] = {}
        self._initialized = False

    def initialize(self) -> None:
        """Initialize the InsightFace detector."""
        if self._initialized:
            return
        
        logger.info("Initializing InsightFace detector with model: %s", settings.insightface_model)
        self._detector = FaceAnalysis(name=settings.insightface_model)
        self._detector.prepare(ctx_id=0, det_size=(640, 640))
        self._initialized = True
        logger.info("InsightFace detector initialized")

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    @property
    def people(self) -> dict[str, Person]:
        return self._people

    def load_gallery(self) -> None:
        """Load the people gallery from disk."""
        self._people.clear()
        
        if not settings.people_dir.exists():
            logger.warning("People directory does not exist: %s", settings.people_dir)
            return

        for person_dir in sorted(settings.people_dir.iterdir()):
            if not person_dir.is_dir():
                continue
            
            person_name = person_dir.name
            theme_path = self._find_theme_file(person_dir)
            preview_photo_id = self._load_preview_id(person_dir)
            person = Person(name=person_name, theme_path=theme_path, preview_photo_id=preview_photo_id)

            if theme_path:
                logger.info("Found theme for %s: %s", person_name, theme_path.name)

            # Find and process all photos
            image_paths = self._get_image_paths(person_dir)
            if not image_paths:
                logger.warning("No images found for %s", person_name)
                continue

            for img_path in image_paths:
                person.photo_paths.append(img_path)
                try:
                    image_bgr = self._load_image_with_exif(img_path)
                    detections = self._detect_with_retry(image_bgr)
                    if detections:
                        # Use the largest detected face
                        largest = max(detections, key=lambda d: d.width * d.height)
                        person.add_embedding(largest.embedding)
                        logger.info("Added embedding for %s from %s", person_name, img_path.name)
                except Exception as exc:
                    logger.warning("Failed to process %s: %s", img_path, exc)

            if person.embeddings:
                self._people[person_name] = person

        logger.info("Loaded %d people with embeddings", len(self._people))

    def add_person(self, name: str) -> Person:
        """Add a new person to the gallery."""
        person_dir = settings.people_dir / name
        person_dir.mkdir(parents=True, exist_ok=True)
        
        person = Person(name=name)
        self._people[name] = person
        return person

    def delete_person(self, name: str) -> bool:
        """Delete a person from the gallery."""
        if name not in self._people:
            return False
        
        person_dir = settings.people_dir / name
        if person_dir.exists():
            import shutil
            shutil.rmtree(person_dir)
        
        del self._people[name]
        return True

    def add_photo(self, person_name: str, image_data: bytes, filename: str) -> Optional[Path]:
        """Add a photo for a person and compute its embedding."""
        if person_name not in self._people:
            return None

        person = self._people[person_name]
        person_dir = settings.people_dir / person_name
        person_dir.mkdir(parents=True, exist_ok=True)

        # Save the image
        photo_path = person_dir / filename
        with open(photo_path, "wb") as f:
            f.write(image_data)

        # Compute embedding
        try:
            image_bgr = self._load_image_with_exif(photo_path)
            detections = self._detect_with_retry(image_bgr)
            if detections:
                largest = max(detections, key=lambda d: d.width * d.height)
                person.add_embedding(largest.embedding)
                person.photo_paths.append(photo_path)
                logger.info("Added photo and embedding for %s: %s", person_name, filename)
                return photo_path
            else:
                # No face detected, remove the file
                photo_path.unlink()
                logger.warning("No face detected in uploaded photo for %s", person_name)
                return None
        except Exception as exc:
            logger.error("Failed to process uploaded photo: %s", exc)
            if photo_path.exists():
                photo_path.unlink()
            return None

    def delete_photo(self, person_name: str, photo_id: str) -> bool:
        """Delete a photo from a person."""
        if person_name not in self._people:
            return False

        person = self._people[person_name]
        photo_path = settings.people_dir / person_name / photo_id
        
        if photo_path.exists():
            # Find the index of this photo
            try:
                idx = person.photo_paths.index(photo_path)
                person.photo_paths.pop(idx)
                if idx < len(person.embeddings):
                    person.embeddings.pop(idx)
                photo_path.unlink()
                return True
            except ValueError:
                # Photo not in list, just delete file
                photo_path.unlink()
                return True
        return False

    def set_theme(self, person_name: str, audio_data: bytes, filename: str) -> Optional[Path]:
        """Set the theme song for a person."""
        if person_name not in self._people:
            return None

        person = self._people[person_name]
        person_dir = settings.people_dir / person_name
        person_dir.mkdir(parents=True, exist_ok=True)

        # Remove existing theme
        if person.theme_path and person.theme_path.exists():
            person.theme_path.unlink()

        # Save new theme
        theme_path = person_dir / filename
        with open(theme_path, "wb") as f:
            f.write(audio_data)

        person.theme_path = theme_path
        logger.info("Set theme for %s: %s", person_name, filename)
        return theme_path

    def delete_theme(self, person_name: str) -> bool:
        """Delete the theme song for a person."""
        if person_name not in self._people:
            return False

        person = self._people[person_name]
        if person.theme_path and person.theme_path.exists():
            person.theme_path.unlink()
            person.theme_path = None
            return True
        return False

    def set_preview_photo(self, person_name: str, photo_id: str) -> bool:
        """Set the preview photo for a person."""
        if person_name not in self._people:
            return False

        person = self._people[person_name]
        person_dir = settings.people_dir / person_name
        
        # Verify photo exists
        photo_path = person_dir / photo_id
        if not photo_path.exists():
            return False
        
        # Save preview ID to file
        preview_file = person_dir / ".preview"
        preview_file.write_text(photo_id)
        
        person.preview_photo_id = photo_id
        logger.info("Set preview photo for %s: %s", person_name, photo_id)
        return True

    def get_preview_url(self, person_name: str) -> Optional[str]:
        """Get the preview URL for a person."""
        if person_name not in self._people:
            return None
        
        person = self._people[person_name]
        
        # Use explicit preview if set
        if person.preview_photo_id:
            return f"/api/people/{person_name}/photos/{person.preview_photo_id}/file"
        
        # Fall back to first photo
        if person.photo_paths:
            return f"/api/people/{person_name}/photos/{person.photo_paths[0].name}/file"
        
        return None

    def detect_faces(self, image_bgr: np.ndarray) -> list[FaceDetection]:
        """Detect faces in an image and extract embeddings."""
        if not self._initialized or self._detector is None:
            raise RuntimeError("Face recognition engine not initialized")
        
        return self._detect_with_retry(image_bgr)

    def match_face(self, embedding: np.ndarray) -> tuple[str, float]:
        """Find the best matching person for an embedding."""
        best_name = "(unknown)"
        best_dist = float("inf")

        for person in self._people.values():
            for emb in person.embeddings:
                dist = self._cosine_distance(embedding, emb)
                if dist < best_dist:
                    best_dist = dist
                    best_name = person.name

        return best_name, best_dist

    def recognize_frame(self, image_bgr: np.ndarray) -> tuple[list[dict], list[dict]]:
        """Recognize faces in a frame and return matches and themes to play."""
        detections = self.detect_faces(image_bgr)
        faces = []
        themes_to_play = []
        now = time.time()

        for det in detections:
            name, distance = self.match_face(det.embedding)
            is_match = distance < settings.embedding_distance_threshold

            faces.append({
                "box": {
                    "x": det.x,
                    "y": det.y,
                    "width": det.width,
                    "height": det.height,
                },
                "name": name,
                "distance": round(distance, 4),
                "is_match": is_match,
            })

            # Handle audio cooldown
            if is_match and name in self._people:
                person = self._people[name]
                should_play = person.should_play_theme(now)
                person.mark_seen(now)

                if should_play and person.theme_path:
                    person.mark_played(now)
                    themes_to_play.append({
                        "name": name,
                        "path": str(person.theme_path),
                    })

        return faces, themes_to_play

    def _detect_with_retry(self, image_bgr: np.ndarray) -> list[FaceDetection]:
        """Detect faces with optional upscaling retry."""
        detections = self._detect_faces_raw(image_bgr)
        if detections:
            return detections

        # Skip upscaling retry if configured (saves CPU on slow hardware)
        if settings.skip_upscale_retry:
            return detections

        # Retry with upscaling
        h, w = image_bgr.shape[:2]
        if max(h, w) >= 1600:
            return detections

        factor = settings.upscale_factor
        scaled = cv2.resize(
            image_bgr,
            (int(w * factor), int(h * factor)),
            interpolation=cv2.INTER_CUBIC,
        )
        scaled_detections = self._detect_faces_raw(scaled)
        
        # Scale boxes back to original size
        for det in scaled_detections:
            det.x = int(det.x / factor)
            det.y = int(det.y / factor)
            det.width = int(det.width / factor)
            det.height = int(det.height / factor)
        
        return scaled_detections

    def _detect_faces_raw(self, image_bgr: np.ndarray) -> list[FaceDetection]:
        """Raw face detection without retry."""
        if self._detector is None:
            return []

        faces = self._detector.get(image_bgr)
        results = []

        for face in faces:
            x1, y1, x2, y2 = face.bbox.astype(int)
            score = float(face.det_score)

            if score < settings.detection_score_threshold or face.normed_embedding is None:
                continue

            results.append(FaceDetection(
                x=int(x1),
                y=int(y1),
                width=int(x2 - x1),
                height=int(y2 - y1),
                score=score,
                embedding=np.array(face.normed_embedding, dtype=np.float32),
            ))

        return results

    @staticmethod
    def _cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
        """Compute cosine distance between two embeddings."""
        denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
        return 1.0 - float(np.dot(a, b) / denom)

    @staticmethod
    def _load_image_with_exif(path: Path) -> np.ndarray:
        """Load image with EXIF rotation applied."""
        img = Image.open(path)
        img = ImageOps.exif_transpose(img)
        return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    @staticmethod
    def _find_theme_file(person_dir: Path) -> Optional[Path]:
        """Find the first audio file in a person's directory."""
        for ext in ["*.mp3", "*.MP3", "*.wav", "*.WAV", "*.m4a", "*.M4A"]:
            files = list(person_dir.glob(ext))
            if files:
                return files[0]
        return None

    @staticmethod
    def _get_image_paths(person_dir: Path) -> list[Path]:
        """Get all image paths in a person's directory."""
        paths = []
        for ext in ["*.jpeg", "*.JPEG", "*.jpg", "*.JPG", "*.png", "*.PNG"]:
            paths.extend(person_dir.glob(ext))
        return sorted(paths)

    @staticmethod
    def _load_preview_id(person_dir: Path) -> Optional[str]:
        """Load the preview photo ID from disk."""
        preview_file = person_dir / ".preview"
        if preview_file.exists():
            preview_id = preview_file.read_text().strip()
            # Verify the photo still exists
            if (person_dir / preview_id).exists():
                return preview_id
        return None


# Global engine instance
engine = FaceRecognitionEngine()

