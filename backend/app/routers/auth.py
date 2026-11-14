import secrets

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

from app import spotify
from app.config import settings
from app.errors import to_http

router = APIRouter(prefix="/auth/spotify", tags=["auth"])


@router.get("/login")
def login(admin_key: str = Query(...)):
    if not secrets.compare_digest(admin_key.encode(), settings.admin_key.encode()):
        raise HTTPException(403, "Forbidden")
    return RedirectResponse(spotify.build_login_url())


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, error: str | None = None):
    if not spotify.consume_state(state): 
        raise HTTPException(400, "Invalid or expired state")
    if error or not code:
        raise HTTPException(400, f"Spotify authorization failed: {error or 'no code'}")
    try:
        spotify.exchange_code(code)
    except spotify.SpotifyError as e:
        raise to_http(e)
    return {"status": "authorized"}