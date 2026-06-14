from pydantic import BaseModel, Field
from typing import Any


class Message(BaseModel):
    role: str  # system | user | assistant
    content: str


class CompletionRequest(BaseModel):
    model: str | None = None
    messages: list[dict[str, str]]
    max_tokens: int | None = None
    temperature: float = 0.1
    trace_id: str | None = None
    workflow_instance_id: str | None = None
    caller_service: str = "unknown"


class CompletionResponse(BaseModel):
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class UsageRecord(BaseModel):
    trace_id: str | None
    caller_service: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    workflow_instance_id: str | None
