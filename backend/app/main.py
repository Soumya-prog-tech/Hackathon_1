from functools import lru_cache
from fastapi import Depends, FastAPI
from typing_extensions import Annotated
from app.controllers import generate
from app.utils.config import settings
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.include_router(generate.router)
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")

@app.get("/")
async def root():
    return {"message": "Welcome to story Generator !"}
