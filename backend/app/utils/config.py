import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # points to app/
ENV_FILE = BASE_DIR / ".env"

class Settings(BaseSettings):
    app_name: str = "Story_Telling_API"
    GOOGLE_API_KEY: str
    CLOUDINARY_CLOUD_NAME: str 
    CLOUDINARY_API_KEY: int
    CLOUDINARY_API_SECRET: str

    model_config = SettingsConfigDict(env_file="app/.env")

settings = Settings()