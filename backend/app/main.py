from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health
from app.routers import additions
from app.routers import auth, search

app = FastAPI(title="Halfbaked Playlist API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4321",
        "http://127.0.0.1:4321",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)

app.include_router(health.router)
app.include_router(additions.router)
app.include_router(search.router)
app.include_router(auth.router)