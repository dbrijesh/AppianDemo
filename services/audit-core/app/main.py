from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mgp_shared.health import router as health_router
from mgp_shared.middleware import RequestIDMiddleware
from mgp_shared import logging_config
from .config import get_settings
from .database import engine, SessionFactory
from .router import router
from mgp_shared.database import Base
from . import models  # noqa: F401 — registers ORM models
from .seed import seed_audit_events

settings = get_settings()
logging_config.configure(settings.service_name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionFactory() as db:
        await seed_audit_events(db)
    yield
    await engine.dispose()


app = FastAPI(
    title="MGP Audit Core",
    version="1.0.0",
    description="Append-only, hash-chained audit log. DELETE/UPDATE denied.",
    lifespan=lifespan,
)

app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(router)
