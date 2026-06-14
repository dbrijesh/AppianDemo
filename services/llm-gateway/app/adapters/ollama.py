import httpx
import logging
from ..schemas import CompletionRequest, CompletionResponse

logger = logging.getLogger(__name__)


class OllamaAdapter:
    def __init__(self, base_url: str):
        self._base = base_url.rstrip("/")

    async def complete(self, req: CompletionRequest) -> CompletionResponse:
        body = {
            "model": req.model,
            "messages": req.messages,
            "stream": False,
            "options": {"num_predict": req.max_tokens or 1024},
        }
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{self._base}/api/chat", json=body)
            r.raise_for_status()
            data = r.json()

        content = data.get("message", {}).get("content", "")
        prompt_tokens = data.get("prompt_eval_count", 0)
        completion_tokens = data.get("eval_count", 0)

        return CompletionResponse(
            content=content,
            model=req.model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        )

    async def list_models(self) -> list[str]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{self._base}/api/tags")
                r.raise_for_status()
                return [m["name"] for m in r.json().get("models", [])]
        except Exception:
            return []
