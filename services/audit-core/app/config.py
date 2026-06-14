from mgp_shared.config import BaseServiceSettings
from functools import lru_cache


class Settings(BaseServiceSettings):
    service_name: str = "audit-core"
    port: int = 8001


@lru_cache
def get_settings() -> Settings:
    return Settings()
