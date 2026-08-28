"""
FastAPI Application Entrypoint for AI Audio Lab 2026.
Configures CORS, static file mounts, API router, and root SPA endpoint.
"""

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.api.endpoints import router as api_router

# Ensure storage and static directories exist
STATIC_DIR = Path("static")
STORAGE_DIR = Path("storage")
STATIC_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="AI Audio Lab 2026",
    description="Professional Music Feature Extraction & Real-time Visualization Engine",
    version="1.0.0"
)

# CORS configuration for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(api_router)

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", summary="Root SPA Endpoint")
async def read_root():
    """
    Serves static/index.html SPA if available, or returns welcome status JSON.
    """
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse({
        "app": "AI Audio Lab 2026",
        "status": "online",
        "docs": "/docs",
        "api_endpoints": [
            "/api/upload",
            "/api/analyze/basic",
            "/api/audio/{task_id}"
        ]
    })
