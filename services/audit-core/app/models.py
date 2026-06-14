import uuid
import hashlib
import json
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, event
from sqlalchemy.orm import Mapped, mapped_column
from mgp_shared.database import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(256), nullable=False)
    actor_email: Mapped[str] = mapped_column(String(256), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    workflow_instance_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    def compute_hash(self) -> str:
        content = json.dumps(
            {
                "id": self.id,
                "entity_type": self.entity_type,
                "entity_id": self.entity_id,
                "action": self.action,
                "actor_id": self.actor_id,
                "payload": self.payload,
                "occurred_at": self.occurred_at.isoformat() if self.occurred_at else None,
                "previous_hash": self.previous_hash,
            },
            sort_keys=True,
        )
        return hashlib.sha256(content.encode()).hexdigest()


# Block UPDATE and DELETE at the SQLAlchemy ORM level
@event.listens_for(AuditEvent, "before_update")
def block_update(mapper, connection, target):
    raise PermissionError("AuditEvent records are immutable — UPDATE is forbidden")


@event.listens_for(AuditEvent, "before_delete")
def block_delete(mapper, connection, target):
    raise PermissionError("AuditEvent records are immutable — DELETE is forbidden")
