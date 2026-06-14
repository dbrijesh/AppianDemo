from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from .database import get_db
from .schemas import UserCreate, UserOut, UserUpdate, TokenRequest, TokenResponse, CurrentUser, RoleAssign
from . import service
from .dependencies import get_current_user, require_roles

router = APIRouter(prefix="/v1")

_adapter = None


def set_router_adapter(adapter):
    global _adapter
    _adapter = adapter


@router.post("/auth/token", response_model=TokenResponse)
async def login(body: TokenRequest, db: AsyncSession = Depends(get_db)):
    import bcrypt as _bcrypt

    user_model = await service.get_user_by_email(db, body.email)
    if not user_model or not user_model.hashed_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    hp = user_model.hashed_password
    if isinstance(hp, str):
        hp = hp.encode()
    if not _bcrypt.checkpw(body.password.encode(), hp):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user_model.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    from .config import get_settings
    from datetime import datetime, timezone, timedelta
    from jose import jwt as jose_jwt
    settings = get_settings()
    roles = [r.name for r in user_model.roles]
    payload = {
        "sub": user_model.id,
        "email": user_model.email,
        "full_name": user_model.full_name,
        "roles": roles,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
    }
    token = jose_jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    user_out = UserOut.model_validate(user_model)
    return TokenResponse(
        access_token=token,
        expires_in=settings.jwt_expire_minutes * 60,
        user=user_out,
    )


@router.get("/auth/me", response_model=CurrentUser)
async def me(user: CurrentUser = Depends(get_current_user)):
    return user


@router.get("/users", response_model=dict)
async def list_users(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
):
    users, total = await service.list_users(db, limit=limit, offset=offset)
    return {"total": total, "items": [UserOut.model_validate(u).model_dump() for u in users]}


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
):
    import bcrypt as _bcrypt
    existing = await service.get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = await service.create_user(db, body, lambda pw: _bcrypt.hashpw(pw.encode(), _bcrypt.gensalt()).decode())
    return UserOut.model_validate(user)


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    if current.id != user_id and "admin" not in current.roles:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = await service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
):
    import bcrypt as _bcrypt
    user = await service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user = await service.update_user(db, user, body, lambda pw: _bcrypt.hashpw(pw.encode(), _bcrypt.gensalt()).decode())
    return UserOut.model_validate(user)
