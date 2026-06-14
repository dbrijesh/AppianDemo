import uuid
import json
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column
from mgp_shared.database import Base


class AgentTrace(Base):
    """Immutable record of every agent invocation — used for replay."""
    __tablename__ = "agent_traces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trace_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    agent_type: Mapped[str] = mapped_column(String(64), nullable=False)
    workflow_instance_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt_summary: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    output: Mapped[str] = mapped_column(Text, nullable=False)  # JSON validated output
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    steps: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON array of step logs
    invoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)

    @property
    def output_dict(self) -> dict:
        return json.loads(self.output)

    @property
    def steps_list(self) -> list:
        return json.loads(self.steps)


class AgentPipeline(Base):
    """Visual agent pipeline — graph of prompt/llm/extract/condition/output nodes."""
    __tablename__ = "agent_pipelines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(String(1024), default="")
    pipeline: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON {nodes, edges}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    @property
    def pipeline_dict(self) -> dict:
        return json.loads(self.pipeline)
