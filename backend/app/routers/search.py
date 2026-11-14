from fastapi import APIRouter, Query

from app import spotify
from app.errors import to_http
from app.schemas import TrackResult

router = APIRouter(tags=["search"])


@router.get("/search", response_model=list[TrackResult])
def search(
    q: str = Query(min_length=1, max_length=100),
    limit: int = Query(10, ge=1, le=10),
    offset: int = Query(0, ge=0, le=100),
):
    try:
        return spotify.search_tracks(q, limit, offset)
    except spotify.SpotifyError as e:
        raise to_http(e)