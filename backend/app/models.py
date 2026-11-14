from datetime import datetime
from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class PlaylistAddition(Base):
    __tablename__ = "playlist_additions"

    id: Mapped[int] = mapped_column(primary_key=True)
    track_uri: Mapped[str] = mapped_column(String, unique=True)
    username: Mapped[str] = mapped_column(String(30))
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    
class SpotifyAuth(Base):
    __tablename__ = "spotify_auth"

    id: Mapped[int] = mapped_column(primary_key=True)
    refresh_token: Mapped[str] = mapped_column(String)
    scope: Mapped[str] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )