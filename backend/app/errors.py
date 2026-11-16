from fastapi import HTTPException

from app.spotify import ReauthRequired, SpotifyError


def to_http(e: SpotifyError) -> HTTPException:
    if e.status == 429:
        return HTTPException(503, "Spotify is busy, try again shortly", headers={"Retry-After": str(e.retry_after or 5)})
    if isinstance(e, ReauthRequired):
        return HTTPException(503, e.message)
    if e.status == 400:
        return HTTPException(400, e.message)
    if e.status == 404:
        return HTTPException(404, "Spotify could not find that track or playlist")
    if e.status == 403:
        return HTTPException(
            403,
            "Spotify refused the request. The authorized account must own the "
            "playlist, and a collaborative/private playlist requires the "
            "playlist-modify-private and playlist-read-private scopes.",
        )
    return HTTPException(502, f"Spotify error: {e.message}")