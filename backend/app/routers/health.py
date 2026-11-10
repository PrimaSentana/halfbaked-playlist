from fastapi import APIRouter, FastAPI

router = APIRouter(tags=["health"])

@router.get("/")
def main():
    return { "status": "server running" }

@router.get("/health")
def health_check():
    return { "status": "ok" }