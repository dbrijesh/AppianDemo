import json
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Any


class TaskCreate(BaseModel):
    workflow_instance_id: str
    node_id: str
    title: str
    description: str = ""
    assigned_role: str = "operator"
    form_schema: dict | None = None
    sla_hours: int = 24
    priority: str = "normal"
    agent_context: dict | None = None  # agent outputs from preceding agent_step nodes


class TaskClaim(BaseModel):
    user_id: str
    user_email: str


class TaskComplete(BaseModel):
    user_id: str
    user_email: str
    signal: str  # approved | rejected | task_complete
    form_data: dict[str, Any] = Field(default_factory=dict)
    comments: str = ""


class TaskReassign(BaseModel):
    new_role: str | None = None
    new_user_id: str | None = None
    new_user_email: str | None = None
    reason: str = ""


class TaskOut(BaseModel):
    id: str
    workflow_instance_id: str
    node_id: str
    title: str
    description: str
    assigned_role: str
    assigned_user_id: str | None
    assigned_user_email: str | None
    status: str
    priority: str
    form_schema: dict | None
    form_data: dict | None
    sla_hours: int
    due_at: datetime | None
    created_at: datetime
    claimed_at: datetime | None
    completed_at: datetime | None
    completion_signal: str | None
    escalated: bool
    comments: str
    agent_context: dict | None = None
    model_config = {"from_attributes": True}

    @field_validator("form_schema", "form_data", "agent_context", mode="before")
    @classmethod
    def _parse_json_fields(cls, v: Any) -> Any:
        if isinstance(v, str):
            return json.loads(v)
        return v
