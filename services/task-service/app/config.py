from mgp_shared.config import BaseServiceSettings
from functools import lru_cache


class Settings(BaseServiceSettings):
    service_name: str = "task-service"
    port: int = 8005
    workflow_url: str = "http://workflow-engine:8004"
    upload_dir: str = "./data/uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()
