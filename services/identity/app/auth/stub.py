"""Stub auth adapter — seeded users in SQLite, no external dependencies.
Used for local development. Zero changes needed to switch to AzureADAdapter in prod.
"""
from datetime import datetime, timezone, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from ..models import User
from ..schemas import CurrentUser
from .base import AuthAdapter

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


class StubAuthAdapter(AuthAdapter):
    def __init__(self, session_factory, secret: str, algorithm: str, expire_minutes: int):
        self._factory = session_factory
        self._secret = secret
        self._algorithm = algorithm
        self._expire = expire_minutes

    def _make_token(self, user: User) -> str:
        roles = [r.name for r in user.roles]
        payload = {
            "sub": user.id,
            "email": user.email,
            "roles": roles,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=self._expire),
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    async def authenticate(self, email: str, password: str) -> CurrentUser | None:
        async with self._factory() as db:
            result = await db.execute(
                select(User).where(User.email == email).options(selectinload(User.roles))
            )
            user = result.scalar_one_or_none()
            if not user or not user.hashed_password:
                return None
            if not pwd_ctx.verify(password, user.hashed_password):
                return None
            if not user.is_active:
                return None
            token = self._make_token(user)
            return CurrentUser(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                roles=[r.name for r in user.roles],
                is_active=user.is_active,
                _token=token,  # type: ignore
            )

    async def verify_token(self, token: str) -> CurrentUser | None:
        try:
            payload = jwt.decode(token, self._secret, algorithms=[self._algorithm])
        except JWTError:
            return None
        return CurrentUser(
            id=payload["sub"],
            email=payload["email"],
            full_name="",
            roles=payload.get("roles", []),
            is_active=True,
        )

    def hash_password(self, password: str) -> str:
        return pwd_ctx.hash(password)
