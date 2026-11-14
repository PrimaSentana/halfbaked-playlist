from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    spotify_client_id: str
    spotify_client_secret: str
    spotify_redirect_uri: str
    spotify_playlist_id: str
    spotify_scope: str = "playlist-modify-public playlist-modify-private"
    admin_key: str

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()