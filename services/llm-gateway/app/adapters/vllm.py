"""vLLM adapter — OpenAI-compatible API endpoint for on-prem inference."""
import httpx
from ..schemas import CompletionRequest, CompletionResponse


class VLLMAdapter:
    def __init__(self, base_url: str):
        self._base = base_url.rstrip("/")

    async def complete(self, req: CompletionRequest) -> CompletionResponse:
        body = {
            "model": req.model,
            "messages": req.messages,
            "max_tokens": req.max_tokens or 1024,
            "temperature": req.temperature,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{self._base}/v1/chat/completions", json=body)
            r.raise_for_status()
            data = r.json()

        choice = data["choices"][0]
        usage = data.get("usage", {})
        return CompletionResponse(
            content=choice["message"]["content"],
            model=data.get("model", req.model),
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
        )

    async def list_models(self) -> list[str]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{self._base}/v1/models")
                r.raise_for_status()
                return [m["id"] for m in r.json().get("data", [])]
        except Exception:
            return []
