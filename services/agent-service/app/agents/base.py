"""Base agent — calls llm-gateway, never calls models directly."""
import hashlib
import json
import time
import httpx
import logging
from typing import Any

logger = logging.getLogger(__name__)


class BaseMGPAgent:
    agent_type: str = "base"

    def __init__(self, llm_gateway_url: str, model: str = "llama3.2"):
        self._gateway = llm_gateway_url.rstrip("/")
        self._model = model

    def _input_hash(self, input_dict: dict) -> str:
        return hashlib.sha256(json.dumps(input_dict, sort_keys=True).encode()).hexdigest()

    async def _call_llm(
        self,
        messages: list[dict],
        *,
        workflow_instance_id: str | None = None,
        trace_id: str | None = None,
    ) -> tuple[str, int, int]:
        body = {
            "model": self._model,
            "messages": messages,
            "caller_service": f"agent:{self.agent_type}",
            "workflow_instance_id": workflow_instance_id,
            "trace_id": trace_id,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{self._gateway}/v1/completions", json=body)
            r.raise_for_status()
            data = r.json()
        return data["content"], data["prompt_tokens"], data["completion_tokens"]

    async def invoke(self, input_dict: dict, **kwargs) -> dict[str, Any]:
        raise NotImplementedError
