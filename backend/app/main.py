import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db
from .ws_manager import manager
from .routes.routes_auth import router as auth_router
from .routes.routes_rooms import router as rooms_router
from .routes.routes_ws import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await manager.startup()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield
    await manager.shutdown()


app = FastAPI(title="Relay", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(rooms_router)
app.include_router(ws_router)


os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# Serve uploaded files
app.mount("/files", StaticFiles(directory=settings.UPLOAD_DIR), name="files")


@app.get("/health")
async def health():
    return {"status": "ok"}
