from mgp_shared.config import BaseServiceSettings
from functools import lru_cache


class Settings(BaseServiceSettings):
    service_name: str = "agent-service"
    port: int = 8006
    llm_gateway_url: str = "http://llm-gateway:8007"
    llm_default_model: str = "llama3.2"
    docs_path: str = "./data/docs"
    own_db_path: str = "./data/agents.db"
    cross_db_base: str = "./data/cross"


@lru_cache
def get_settings() -> Settings:
    return Settings()
