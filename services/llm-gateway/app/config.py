from mgp_shared.config import BaseServiceSettings
from functools import lru_cache


class Settings(BaseServiceSettings):
    service_name: str = "llm-gateway"
    port: int = 8007
    # adapter: ollama | vllm | azure_openai
    llm_adapter: str = "ollama"
    ollama_base_url: str = "http://host.docker.internal:11434"
    vllm_base_url: str = ""
    llm_default_model: str = "llama3.2"
    llm_allowed_models: str = "llama3.2,llama3.1,mistral"
    llm_max_tokens: int = 4096
    # Azure OpenAI (used when llm_adapter=azure_openai)
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = "gpt-4o-mini"
    azure_openai_api_version: str = "2024-08-01-preview"

    @property
    def allowed_models_list(self) -> list[str]:
        return [m.strip() for m in self.llm_allowed_models.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
