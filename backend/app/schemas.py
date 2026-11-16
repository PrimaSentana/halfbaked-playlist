from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Username = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)
]

class AdditionCreate(BaseModel):
    track_uri: str = Field(pattern=r"^spotify:track:[A-Za-z0-9]{22}$")
    username: Username


class AdditionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    track_uri: str
    track_name: str | None
    artists: list[str] | None
    image_url: str | None
    spotify_url: str | None
    username: str
    added_at: datetime


class PlaylistItemRead(BaseModel):
    position: int
    track_uri: str
    track_name: str | None
    artists: list[str] | None
    image_url: str | None
    spotify_url: str | None
    added_at: datetime | None
    username: str | None


class PlaylistRead(BaseModel):
    total: int
    playlist_url: str
    items: list[PlaylistItemRead]


class TrackResult(BaseModel):
    uri: str
    name: str
    artists: list[str]
    image_url: str | None
    spotify_url: str | None
    
class AdditionUpdate(BaseModel):
    username: Username