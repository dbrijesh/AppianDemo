from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .schemas import CurrentUser

bearer = HTTPBearer(auto_error=False)

_adapter = None  # set in main.py lifespan


def set_adapter(adapter):
    global _adapter
    _adapter = adapter


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> CurrentUser:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = await _adapter.verify_token(credentials.credentials)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user


def require_roles(*roles: str):
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not any(r in user.roles for r in roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Requires one of: {roles}")
        return user
    return checker
