from mgp_shared.config import BaseServiceSettings
from functools import lru_cache


class Settings(BaseServiceSettings):
    service_name: str = "identity"
    port: int = 8003
    seed_admin_email: str = "admin@mgp.local"
    seed_admin_password: str = "Admin123!"
    seed_operator_email: str = "operator@mgp.local"
    seed_operator_password: str = "Operator123!"
    seed_qa_email: str = "qa@mgp.local"
    seed_qa_password: str = "QA123!"
    seed_auditor_email: str = "auditor@mgp.local"
    seed_auditor_password: str = "Auditor123!"
    azure_tenant_id: str = ""
    azure_client_id: str = ""
    azure_client_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
