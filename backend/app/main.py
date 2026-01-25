"""Stinger - Local Face Recognition with Theme Playback."""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.people import router as people_router
from .api.recognize import router as recognize_router
from .api.kiosk import router as kiosk_router
from .api.settings import router as settings_router
from .core.config import settings, get_runtime_settings
from .core.face import engine
from .core.models import HealthResponse
from .kiosk.loop import start_kiosk, stop_kiosk

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="%(levelname)s: %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Global kiosk task reference
_kiosk_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    global _kiosk_task
    
    # Startup
    logger.info("Starting Stinger...")
    logger.info("Initializing face recognition engine...")
    engine.initialize()
    logger.info("Loading people gallery...")
    engine.load_gallery()
    logger.info("Startup complete. %d people loaded.", len(engine.people))
    
    # Start kiosk background task
    rs = get_runtime_settings()
    if rs.kiosk_enabled:
        logger.info("Starting kiosk background task...")
        _kiosk_task = await start_kiosk()
    else:
        logger.info("Kiosk is disabled")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Stinger...")
    
    # Stop kiosk
    if _kiosk_task is not None:
        logger.info("Stopping kiosk...")
        stop_kiosk()
        try:
            _kiosk_task.cancel()
            await asyncio.wait_for(_kiosk_task, timeout=5.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    
    logger.info("Shutdown complete")


app = FastAPI(
    title="Stinger API",
    description="Local face recognition with theme song playback",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware - allow all origins for local network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(people_router, prefix="/api")
app.include_router(recognize_router, prefix="/api")
app.include_router(kiosk_router, prefix="/api")
app.include_router(settings_router, prefix="/api")


# Health check
@app.get("/api/health", response_model=HealthResponse, tags=["health"])
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="ok",
        model_loaded=engine.is_initialized,
        people_count=len(engine.people),
    )


# Serve static files for frontend (in production)
try:
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
except Exception:
    # Static directory may not exist yet
    pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )

