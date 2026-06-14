import uuid
import logging
from fastapi import APIRouter, HTTPException
from .schemas import CompletionRequest, CompletionResponse
from .redaction import redact_messages
from .config import get_settings

router = APIRouter(prefix="/v1")
logger = logging.getLogger(__name__)
settings = get_settings()
_adapter = None


def set_adapter(adapter):
    global _adapter
    _adapter = adapter


@router.post("/completions", response_model=CompletionResponse)
async def completions(body: CompletionRequest):
    model = body.model or settings.llm_default_model
    if model not in settings.allowed_models_list:
        raise HTTPException(status_code=400, detail=f"Model '{model}' not in allowlist: {settings.allowed_models_list}")

    trace_id = body.trace_id or str(uuid.uuid4())
    redacted_messages = redact_messages(body.messages)
    body.messages = redacted_messages
    body.model = model
    body.max_tokens = min(body.max_tokens or settings.llm_max_tokens, settings.llm_max_tokens)

    logger.info(
        "llm_call",
        extra={
            "trace_id": trace_id,
            "model": model,
            "caller": body.caller_service,
            "workflow_id": body.workflow_instance_id,
            "messages": len(body.messages),
        },
    )

    result = await _adapter.complete(body)

    logger.info(
        "llm_response",
        extra={
            "trace_id": trace_id,
            "prompt_tokens": result.prompt_tokens,
            "completion_tokens": result.completion_tokens,
        },
    )
    return result


@router.get("/models")
async def list_models():
    models = await _adapter.list_models()
    allowed = settings.allowed_models_list
    return {"allowed": allowed, "available": [m for m in models if m in allowed]}
