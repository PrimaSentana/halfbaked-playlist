from fastapi import FastAPI
from app.routers import health

app = FastAPI(title="PLaylist API")

app.include_router(health.router)