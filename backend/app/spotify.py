import base64
import secrets
import threading
import time
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.database import SessionLocal
from app.models import SpotifyAuth

AUTH_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"

MAX_RETRIES = 3
MAX_INLINE_WAIT = 5


class SpotifyError(Exception):
    def __init__(self, status: int, message: str, retry_after: int | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.retry_after = retry_after


class ReauthRequired(SpotifyError):
    """Refresh token missing, expired or revoked: admin must log in again."""


_lock = threading.Lock()
_access_token: str | None = None
_expires_at = 0.0
_cooldown_until = 0.0
_pending_states: dict[str, float] = {}


def _basic_auth() -> str:
    raw = f"{settings.spotify_client_id}:{settings.spotify_client_secret}"
    return "Basic " + base64.b64encode(raw.encode()).decode()


def _send(method: str, url: str, **kwargs) -> httpx.Response:
    try:
        return httpx.request(method, url, timeout=10, **kwargs)
    except httpx.HTTPError:
        raise SpotifyError(502, "Could not reach Spotify")

def build_login_url() -> str:
    state = secrets.token_urlsafe(16)
    _pending_states[state] = time.time() + 600
    return AUTH_URL + "?" + urlencode({
        "response_type": "code",
        "client_id": settings.spotify_client_id,
        "redirect_uri": settings.spotify_redirect_uri,
        "scope": settings.spotify_scope,
        "state": state,
    })


def consume_state(state: str | None) -> bool:
    now = time.time()
    for s in [s for s, exp in _pending_states.items() if exp < now]:
        del _pending_states[s]
    return state is not None and _pending_states.pop(state, None) is not None


def exchange_code(code: str) -> None:
    global _access_token, _expires_at
    resp = _send(
        "POST", TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.spotify_redirect_uri,
        },
        headers={"Authorization": _basic_auth()},
    )
    if resp.status_code != 200:
        error, desc = _token_error(resp)
        raise SpotifyError(502, f"Token exchange failed: {error} {desc}".strip())
    data = resp.json()
    _save_refresh_token(data["refresh_token"], data.get("scope", ""))
    with _lock:
        _access_token = data["access_token"]
        _expires_at = time.time() + data["expires_in"]


# manage token

def _token_error(resp: httpx.Response) -> tuple[str, str]:
    try:
        body = resp.json()
        return body.get("error", "unknown"), body.get("error_description", "")
    except ValueError:
        return "unknown", resp.text[:200]


def _save_refresh_token(token: str, scope: str) -> None:
    with SessionLocal() as db:
        row = db.get(SpotifyAuth, 1)
        if row is None:
            db.add(SpotifyAuth(id=1, refresh_token=token, scope=scope))
        else:
            row.refresh_token, row.scope = token, scope
        db.commit()


def _discard_refresh_token() -> None:
    with SessionLocal() as db:
        row = db.get(SpotifyAuth, 1)
        if row:
            db.delete(row)
            db.commit()


def _get_access_token(force_refresh: bool = False) -> str:
    global _access_token, _expires_at
    with _lock:
        if not force_refresh and _access_token and time.time() < _expires_at - 60:
            return _access_token

        with SessionLocal() as db:
            row = db.get(SpotifyAuth, 1)
            if row is None:
                raise ReauthRequired(503, "Spotify is not authorized yet. The admin must log in.")
            refresh_token, scope = row.refresh_token, row.scope

        resp = _send(
            "POST", TOKEN_URL,
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
            headers={"Authorization": _basic_auth()},
        )
        if resp.status_code != 200:
            error, desc = _token_error(resp)
            if error == "invalid_grant":
                _access_token = None
                _discard_refresh_token()
                raise ReauthRequired(503, "Spotify authorization expired. The admin must log in again.")
            raise SpotifyError(502, f"Token refresh failed: {error} {desc}".strip())

        data = resp.json()
        _access_token = data["access_token"]
        _expires_at = time.time() + data["expires_in"]
        if data.get("refresh_token"):
            _save_refresh_token(data["refresh_token"], data.get("scope", scope))
        return _access_token


# api call

def _api_error_message(resp: httpx.Response) -> str:
    try:
        return resp.json()["error"]["message"]
    except (ValueError, KeyError, TypeError):
        return f"Spotify returned HTTP {resp.status_code}"


def _request(method: str, path: str, *, params=None, json=None, retry_5xx=True):
    global _cooldown_until
    remaining = _cooldown_until - time.time()
    if remaining > 0:  # we're in a rate-limit cooldown: don't even call Spotify
        raise SpotifyError(429, "Spotify rate limit reached", retry_after=int(remaining) + 1)

    refreshed = False
    for attempt in range(MAX_RETRIES + 1):
        resp = _send(
            method, f"{API_BASE}{path}", params=params, json=json,
            headers={"Authorization": f"Bearer {_get_access_token()}"},
        )

        if resp.is_success:
            return resp.json() if resp.content else None

        if resp.status_code == 401 and not refreshed:  # token died early: refresh once
            refreshed = True
            _get_access_token(force_refresh=True)
            continue

        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", "1"))
            wait = max(retry_after, 2**attempt)  # exponential, never below Retry-After
            if wait > MAX_INLINE_WAIT or attempt == MAX_RETRIES:
                _cooldown_until = time.time() + retry_after
                raise SpotifyError(429, "Spotify rate limit reached", retry_after=max(retry_after, 1))
            time.sleep(wait)
            continue

        if resp.status_code >= 500 and retry_5xx and attempt < MAX_RETRIES:
            time.sleep(min(2**attempt, MAX_INLINE_WAIT))
            continue

        raise SpotifyError(resp.status_code, _api_error_message(resp))

    raise SpotifyError(502, "Spotify request failed")


def search_tracks(q: str, limit: int = 10, offset: int = 0) -> list[dict]:
    data = _request("GET", "/search", params={"q": q, "type": "track", "limit": limit, "offset": offset})
    results = []
    for t in data["tracks"]["items"]:
        if not t:
            continue
        images = t["album"]["images"]  # widest first
        results.append({
            "uri": t["uri"],
            "name": t["name"],
            "artists": [a["name"] for a in t["artists"]],
            "image_url": images[0]["url"] if images else None,
            "spotify_url": t.get("external_urls", {}).get("spotify"),
        })
    return results


def _playlist_id() -> str:
    """Accept either a bare playlist ID or a full share URL in the setting."""
    raw = settings.spotify_playlist_id.strip()
    if "/playlist/" in raw:
        raw = raw.split("/playlist/", 1)[1]
    return raw.split("?", 1)[0].strip("/")


def get_track(track_id: str) -> dict:
    t = _request("GET", f"/tracks/{track_id}")
    images = t["album"]["images"]
    return {
        "track_name": t["name"],
        "artists": [a["name"] for a in t["artists"]],
        "image_url": images[0]["url"] if images else None,
        "spotify_url": t.get("external_urls", {}).get("spotify"),
    }


def add_track_to_playlist(track_uri: str) -> None:
    _request(
        "POST", f"/playlists/{_playlist_id()}/items",
        json={"uris": [track_uri]}, retry_5xx=False,
    )