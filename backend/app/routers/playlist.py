from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import spotify
from app.database import get_db
from app.errors import to_http
from app.models import PlaylistAddition
from app.schemas import PlaylistRead

router = APIRouter(tags=["Playlist"])


@router.get("/playlist", response_model=PlaylistRead)
def get_playlist(
    limit: int = Query(50, ge=1, le=50),
    db: Session = Depends(get_db),
):
    try:
        data = spotify.get_playlist_items(limit)
    except spotify.SpotifyError as e:
        raise to_http(e)

    uris = [item["track_uri"] for item in data["items"] if item["track_uri"]]
    usernames: dict[str, str] = {}
    if uris:
        rows = db.execute(
            select(PlaylistAddition.track_uri, PlaylistAddition.username)
            .where(PlaylistAddition.track_uri.in_(uris))
        ).all()
        usernames = {uri: username for uri, username in rows}

    items = [
        {**item, "username": usernames.get(item["track_uri"])}
        for item in data["items"]
    ]
    return {
        "total": data["total"],
        "playlist_url": spotify.playlist_url(),
        "items": items,
    }
