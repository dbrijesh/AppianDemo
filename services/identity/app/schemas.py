from pydantic import BaseModel, EmailStr
from datetime import datetime


class RoleOut(BaseModel):
    id: str
    name: str
    description: str
    model_config = {"from_attributes": True}


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    is_active: bool
    created_at: datetime
    roles: list[RoleOut] = []
    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role_names: list[str] = ["operator"]


class UserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None
    role_names: list[str] | None = None


class TokenRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class RoleAssign(BaseModel):
    user_id: str
    role_names: list[str]


class CurrentUser(BaseModel):
    id: str
    email: str
    full_name: str
    roles: list[str]
    is_active: bool
