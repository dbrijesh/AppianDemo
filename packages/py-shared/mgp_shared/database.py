from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from typing import AsyncGenerator


class Base(DeclarativeBase):
    pass


def build_engine(db_url: str):
    kwargs = {}
    if "sqlite" in db_url:
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_async_engine(db_url, echo=False, **kwargs)


def build_session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session(session_factory) -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
