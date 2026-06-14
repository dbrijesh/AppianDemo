import logging
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from .models import User, Role
from .schemas import UserCreate, UserUpdate
from .auth.stub import StubAuthAdapter

logger = logging.getLogger(__name__)


async def get_or_create_role(db: AsyncSession, name: str, description: str = "") -> Role:
    result = await db.execute(select(Role).where(Role.name == name))
    role = result.scalar_one_or_none()
    if not role:
        role = Role(name=name, description=description)
        db.add(role)
        await db.flush()
    return role


async def create_user(db: AsyncSession, data: UserCreate, pwd_hasher) -> User:
    roles = []
    for rname in data.role_names:
        roles.append(await get_or_create_role(db, rname))

    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=pwd_hasher(data.password),
        roles=roles,
    )
    db.add(user)
    await db.flush()
    logger.info("user_created", extra={"email": user.email})
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(
        select(User).where(User.email == email).options(selectinload(User.roles))
    )
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.roles))
    )
    return result.scalar_one_or_none()


async def list_users(db: AsyncSession, limit: int = 100, offset: int = 0) -> tuple[list[User], int]:
    from sqlalchemy import func
    count = (await db.execute(select(func.count(User.id)))).scalar_one()
    result = await db.execute(
        select(User).options(selectinload(User.roles)).offset(offset).limit(limit)
    )
    return list(result.scalars().all()), count


async def update_user(db: AsyncSession, user: User, data: UserUpdate, pwd_hasher) -> User:
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.role_names is not None:
        roles = []
        for rname in data.role_names:
            roles.append(await get_or_create_role(db, rname))
        user.roles = roles
    await db.flush()
    return user


async def seed_users(db: AsyncSession, settings, pwd_hasher):
    seeds = [
        (settings.seed_admin_email, "Administrator", settings.seed_admin_password, ["admin"]),
        (settings.seed_operator_email, "Operator User", settings.seed_operator_password, ["operator"]),
        (settings.seed_qa_email, "QA Manager", settings.seed_qa_password, ["qa_manager"]),
        (settings.seed_auditor_email, "Auditor", settings.seed_auditor_password, ["auditor"]),
    ]
    for email, name, pw, roles in seeds:
        existing = await get_user_by_email(db, email)
        if not existing:
            await create_user(db, UserCreate(email=email, full_name=name, password=pw, role_names=roles), pwd_hasher)
    logger.info("seed_complete")
