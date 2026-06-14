import uuid
import json
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from mgp_shared.database import Base


class WorkflowDefinition(Base):
    """Versioned workflow definition — admin-editable via UI. Stored as JSON graph."""
    __tablename__ = "workflow_definitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(String(1024), default="")
    graph: Mapped[str] = mapped_column(Text, nullable=False)  # JSON: {nodes, edges}
    created_by: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    @property
    def graph_dict(self) -> dict:
        return json.loads(self.graph)


class WorkflowInstance(Base):
    """A running instance of a workflow definition."""
    __tablename__ = "workflow_instances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    definition_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    definition_slug: Mapped[str] = mapped_column(String(128), nullable=False)
    definition_version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    # status: running | completed | cancelled | error
    current_node_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    context: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON
    started_by_id: Mapped[str] = mapped_column(String(256), nullable=False)
    started_by_email: Mapped[str] = mapped_column(String(256), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(256), nullable=True)

    @property
    def context_dict(self) -> dict:
        return json.loads(self.context)


class WorkflowHistory(Base):
    """Immutable step-by-step replay log for every workflow instance."""
    __tablename__ = "workflow_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    instance_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    node_id: Mapped[str] = mapped_column(String(128), nullable=False)
    node_type: Mapped[str] = mapped_column(String(64), nullable=False)
    node_label: Mapped[str] = mapped_column(String(256), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
