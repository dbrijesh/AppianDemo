from pydantic_settings import BaseSettings
from functools import lru_cache


class BaseServiceSettings(BaseSettings):
    mgp_env: str = "local"
    db_url: str = "sqlite+aiosqlite:///./data/service.db"
    audit_core_url: str = "http://audit-core:8001"
    identity_url: str = "http://identity:8003"
    jwt_secret: str = "local-dev-secret-change-in-prod-min-32-chars"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    auth_adapter: str = "stub"
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def is_local(self) -> bool:
        return self.mgp_env == "local"

    class Config:
        env_file = ".env.local"
        extra = "allow"
