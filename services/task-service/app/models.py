import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column
from mgp_shared.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_instance_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    node_id: Mapped[str] = mapped_column(String(128), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str] = mapped_column(String(2048), default="")
    assigned_role: Mapped[str] = mapped_column(String(64), nullable=False, default="operator")
    assigned_user_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    assigned_user_email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    # status: open | claimed | completed | cancelled | escalated
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="normal")
    form_schema: Mapped[str | None] = mapped_column(Text, nullable=True)
    form_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    sla_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completion_signal: Mapped[str | None] = mapped_column(String(64), nullable=True)
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    comments: Mapped[str] = mapped_column(Text, default="")
    agent_context: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: agent outputs from preceding agent_step nodes
