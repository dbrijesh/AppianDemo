from mgp_shared.config import BaseServiceSettings
from functools import lru_cache


class Settings(BaseServiceSettings):
    service_name: str = "workflow-engine"
    port: int = 8004
    task_url: str = "http://task-service:8005"
    agent_url: str = "http://agent-service:8006"


@lru_cache
def get_settings() -> Settings:
    return Settings()
