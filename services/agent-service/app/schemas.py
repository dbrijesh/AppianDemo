import json
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Any


class AgentInvokeRequest(BaseModel):
    agent_type: str  # deviation_triage | rca_drafting | capa_suggestion | sop_rag | batch_anomaly
    workflow_instance_id: str | None = None
    input: dict[str, Any] = Field(default_factory=dict)
    replay_trace_id: str | None = None  # if set, return logged output instead of calling model


class DBQueryRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000)
    max_rows: int = Field(default=50, ge=1, le=200)


class DBQueryResponse(BaseModel):
    sql: str
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    execution_ms: int
    explanation: str
    error: str | None = None


class DeviationTriageOutput(BaseModel):
    severity: str  # critical | major | minor
    severity_rationale: str
    probable_root_causes: list[str]
    recommended_capa_types: list[str]
    requires_immediate_action: bool
    summary: str


class RCAOutput(BaseModel):
    root_cause: str
    contributing_factors: list[str]
    evidence_referenced: list[str]
    confidence: str  # high | medium | low
    draft_text: str


class CAPAOutput(BaseModel):
    corrective_actions: list[dict[str, str]]
    preventive_actions: list[dict[str, str]]
    effectiveness_criteria: list[str]
    suggested_owner_roles: list[str]
    estimated_timeline_days: int


class SOPRAGOutput(BaseModel):
    answer: str
    relevant_sections: list[dict[str, str]]
    confidence: str
    sources: list[str]


class BatchAnomalyOutput(BaseModel):
    anomalies_detected: list[dict[str, Any]]
    risk_level: str
    summary: str
    recommended_actions: list[str]


class CertReviewOutput(BaseModel):
    risk_score: int  # 1-10
    risk_level: str  # low | medium | high | critical
    compliance_checklist: list[dict[str, str]]
    missing_documents: list[str]
    recommendation: str  # approve | reject | request_more_info
    recommendation_rationale: str
    summary: str


class PipelineCreate(BaseModel):
    name: str
    description: str = ""
    pipeline: dict  # {nodes: [...], edges: [...]}


class PipelineUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    pipeline: dict | None = None


class PipelineOut(BaseModel):
    id: str
    name: str
    description: str
    pipeline: dict
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("pipeline", mode="before")
    @classmethod
    def _parse_pipeline(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v


class AgentTraceOut(BaseModel):
    id: str
    trace_id: str
    agent_type: str
    workflow_instance_id: str | None
    output: dict
    prompt_tokens: int
    completion_tokens: int
    model: str
    invoked_at: datetime
    duration_ms: int
    model_config = {"from_attributes": True}

    @field_validator("output", mode="before")
    @classmethod
    def _parse_output(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v
