import json
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Any


class AuditEventCreate(BaseModel):
    entity_type: str
    entity_id: str
    action: str
    actor_id: str
    actor_email: str
    payload: dict[str, Any] = Field(default_factory=dict)
    workflow_instance_id: str | None = None
    occurred_at: datetime


class AuditEventOut(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    action: str
    actor_id: str
    actor_email: str
    payload: dict[str, Any]
    workflow_instance_id: str | None
    occurred_at: datetime
    created_at: datetime
    previous_hash: str | None
    event_hash: str

    model_config = {"from_attributes": True}

    @field_validator("payload", mode="before")
    @classmethod
    def _parse_payload(cls, v: Any) -> Any:
        if isinstance(v, str):
            return json.loads(v)
        return v if v is not None else {}


class ChainVerifyResult(BaseModel):
    valid: bool
    checked: int
    first_broken_id: str | None = None
    message: str
