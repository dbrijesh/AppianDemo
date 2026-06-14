import json
import logging
from datetime import datetime, timezone
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from .models import AuditEvent
from .schemas import AuditEventCreate, ChainVerifyResult

logger = logging.getLogger(__name__)


async def append_event(db: AsyncSession, data: AuditEventCreate) -> AuditEvent:
    # Fetch the most recent event hash for chain linking
    result = await db.execute(
        select(AuditEvent.event_hash).order_by(desc(AuditEvent.created_at)).limit(1)
    )
    previous_hash = result.scalar_one_or_none()

    event = AuditEvent(
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        action=data.action,
        actor_id=data.actor_id,
        actor_email=data.actor_email,
        payload=json.dumps(data.payload),
        workflow_instance_id=data.workflow_instance_id,
        occurred_at=data.occurred_at,
        previous_hash=previous_hash,
    )
    event.event_hash = event.compute_hash()
    db.add(event)
    await db.flush()
    logger.info("audit_event_appended", extra={"id": event.id, "action": event.action})
    return event


async def get_events(
    db: AsyncSession,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    workflow_instance_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[AuditEvent], int]:
    q = select(AuditEvent)
    if entity_type:
        q = q.where(AuditEvent.entity_type == entity_type)
    if entity_id:
        q = q.where(AuditEvent.entity_id == entity_id)
    if workflow_instance_id:
        q = q.where(AuditEvent.workflow_instance_id == workflow_instance_id)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    q = q.order_by(desc(AuditEvent.created_at)).offset(offset).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return list(rows), total


async def verify_chain(db: AsyncSession) -> ChainVerifyResult:
    result = await db.execute(select(AuditEvent).order_by(AuditEvent.created_at))
    events = result.scalars().all()

    if not events:
        return ChainVerifyResult(valid=True, checked=0, message="Empty chain")

    for i, event in enumerate(events):
        recomputed = event.compute_hash()
        if recomputed != event.event_hash:
            return ChainVerifyResult(
                valid=False,
                checked=i + 1,
                first_broken_id=event.id,
                message=f"Hash mismatch at event {event.id}",
            )
        if i > 0:
            expected_prev = events[i - 1].event_hash
            if event.previous_hash != expected_prev:
                return ChainVerifyResult(
                    valid=False,
                    checked=i + 1,
                    first_broken_id=event.id,
                    message=f"Chain break at event {event.id}",
                )

    return ChainVerifyResult(valid=True, checked=len(events), message="Chain intact")
