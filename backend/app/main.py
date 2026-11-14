from fastapi import FastAPI
from app.routers import health
from app.routers import additions
from app.routers import auth, search

app = FastAPI(title="Halfbaked Playlist API")

app.include_router(health.router)
app.include_router(additions.router)
app.include_router(search.router)
app.include_router(auth.router)