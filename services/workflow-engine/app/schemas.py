import json
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Any


def _parse_json_field(v: Any) -> Any:
    """Accept either a JSON string or a dict/list — normalise to Python object."""
    if isinstance(v, str):
        return json.loads(v)
    return v


class NodeConfig(BaseModel):
    model_config = {"extra": "allow"}  # preserve unknown fields (integration, logic configs)

    role: str = "operator"
    description: str = ""
    form_schema: dict | None = None
    sla_hours: int = 24
    agent_type: str | None = None
    extra_config: dict[str, Any] = Field(default_factory=dict)
    # integration node fields
    url: str | None = None
    method: str | None = None
    body_template: dict | None = None
    output_key: str | None = None
    timeout_seconds: int | None = None
    auth_type: str | None = None
    # logic node fields
    expression: str | None = None
    true_label: str | None = None
    false_label: str | None = None
    # esign node fields
    meaning: str | None = None


class WorkflowNode(BaseModel):
    id: str
    type: str  # start | task | gateway | timer | agent_step | esign | integration | logic | end
    label: str
    config: NodeConfig = Field(default_factory=NodeConfig)
    position: dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str = ""
    condition: str | None = None  # approved | rejected | default | None


class WorkflowGraph(BaseModel):
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]


class DefinitionCreate(BaseModel):
    name: str
    slug: str
    description: str = ""
    graph: WorkflowGraph


class DefinitionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    graph: WorkflowGraph | None = None
    is_active: bool | None = None


class DefinitionOut(BaseModel):
    id: str
    name: str
    slug: str
    version: int
    is_active: bool
    description: str
    graph: dict
    created_by: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("graph", mode="before")
    @classmethod
    def _graph(cls, v): return _parse_json_field(v)


class InstanceStart(BaseModel):
    started_by_id: str
    started_by_email: str
    entity_type: str | None = None
    entity_id: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class InstanceSignal(BaseModel):
    signal: str  # approved | rejected | task_complete | timer_expired | ...
    actor_id: str
    actor_email: str
    payload: dict[str, Any] = Field(default_factory=dict)


class HistoryOut(BaseModel):
    id: str
    instance_id: str
    node_id: str
    node_type: str
    node_label: str
    action: str
    actor_id: str | None
    actor_email: str | None
    payload: dict
    occurred_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("payload", mode="before")
    @classmethod
    def _payload(cls, v): return _parse_json_field(v)


class InstanceOut(BaseModel):
    id: str
    definition_id: str
    definition_slug: str
    definition_version: int
    status: str
    current_node_id: str | None
    context: dict
    started_by_id: str
    started_by_email: str
    started_at: datetime
    completed_at: datetime | None
    entity_type: str | None
    entity_id: str | None
    model_config = {"from_attributes": True}

    @field_validator("context", mode="before")
    @classmethod
    def _context(cls, v):
        parsed = _parse_json_field(v)
        # spiff_executor stores {"_spiff": "...", "_payload": {...user data...}}
        # Unwrap _payload so API consumers see plain user data without engine internals.
        if isinstance(parsed, dict) and "_payload" in parsed and isinstance(parsed["_payload"], dict):
            return parsed["_payload"]
        return parsed
