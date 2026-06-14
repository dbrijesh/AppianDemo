from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mgp_shared.health import router as health_router
from mgp_shared.middleware import RequestIDMiddleware
from mgp_shared import logging_config
from .config import get_settings
from .router import router, set_adapter

settings = get_settings()
logging_config.configure(settings.service_name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.llm_adapter == "mock":
        from .adapters.mock import MockAdapter
        set_adapter(MockAdapter())
    elif settings.llm_adapter == "ollama":
        from .adapters.ollama import OllamaAdapter
        set_adapter(OllamaAdapter(settings.ollama_base_url))
    elif settings.llm_adapter == "azure_openai":
        from .adapters.azure_openai import AzureOpenAIAdapter
        set_adapter(AzureOpenAIAdapter(
            endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            deployment=settings.azure_openai_deployment,
            api_version=settings.azure_openai_api_version,
        ))
    else:
        from .adapters.vllm import VLLMAdapter
        set_adapter(VLLMAdapter(settings.vllm_base_url))
    yield


app = FastAPI(title="MGP LLM Gateway", version="1.0.0", lifespan=lifespan)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins_list, allow_methods=["*"], allow_headers=["*"])
app.include_router(health_router)
app.include_router(router)
