"""Recognition API routes."""
import base64
import logging

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException

from ..core.face import engine
from ..core.models import RecognitionRequest, RecognitionResult, FaceMatch, FaceBox, ThemeToPlay

router = APIRouter(prefix="/recognize", tags=["recognition"])
logger = logging.getLogger(__name__)


@router.post("", response_model=RecognitionResult)
async def recognize_image(request: RecognitionRequest):
    """Recognize faces in an uploaded image (one-shot recognition for testing)."""
    if not engine.is_initialized:
        raise HTTPException(status_code=503, detail="Face recognition engine not ready")
    
    try:
        # Decode base64 image
        image_data = base64.b64decode(request.image_base64)
        nparr = np.frombuffer(image_data, np.uint8)
        image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image_bgr is None:
            raise HTTPException(status_code=400, detail="Invalid image data")
        
        # Run recognition
        faces_data, themes_data = engine.recognize_frame(image_bgr)
        
        # Convert to response models
        faces = [
            FaceMatch(
                box=FaceBox(**f["box"]),
                name=f["name"],
                distance=f["distance"],
                is_match=f["is_match"],
            )
            for f in faces_data
        ]
        
        themes = [
            ThemeToPlay(name=t["name"], path=t["path"])
            for t in themes_data
        ]
        
        return RecognitionResult(faces=faces, play_themes=themes)
        
    except Exception as exc:
        logger.exception("Recognition failed")
        raise HTTPException(status_code=500, detail=str(exc))

