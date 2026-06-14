"""Azure OpenAI adapter — uses the Azure OpenAI REST API directly via httpx."""
import httpx
from ..schemas import CompletionRequest, CompletionResponse


class AzureOpenAIAdapter:
    """
    Targets: https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions
    Uses api-key header auth.  No extra package needed — httpx already in requirements.
    """

    def __init__(self, endpoint: str, api_key: str, deployment: str, api_version: str):
        self._endpoint = endpoint.rstrip("/")
        self._api_key = api_key
        self._deployment = deployment
        self._api_version = api_version

    async def complete(self, req: CompletionRequest) -> CompletionResponse:
        url = (
            f"{self._endpoint}/openai/deployments/{self._deployment}"
            f"/chat/completions?api-version={self._api_version}"
        )
        body: dict = {
            "messages": req.messages,
            "max_tokens": req.max_tokens or 1024,
            "temperature": req.temperature,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                url,
                json=body,
                headers={
                    "api-key": self._api_key,
                    "Content-Type": "application/json",
                },
            )
            r.raise_for_status()
            data = r.json()

        choice = data["choices"][0]
        usage = data.get("usage", {})
        return CompletionResponse(
            content=choice["message"]["content"] or "",
            model=data.get("model", self._deployment),
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
        )

    async def list_models(self) -> list[str]:
        return [self._deployment]
