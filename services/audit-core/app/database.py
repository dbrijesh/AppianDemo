from mgp_shared.database import Base, build_engine, build_session_factory
from .config import get_settings
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

settings = get_settings()
engine = build_engine(settings.db_url)
SessionFactory = build_session_factory(engine)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
