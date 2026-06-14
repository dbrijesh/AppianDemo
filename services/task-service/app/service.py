import json
import logging
import httpx
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from .models import Task
from .schemas import TaskCreate, TaskClaim, TaskComplete, TaskReassign
from mgp_shared.audit_client import AuditClient

logger = logging.getLogger(__name__)


async def create_task(db: AsyncSession, data: TaskCreate, audit: AuditClient) -> Task:
    due_at = datetime.now(timezone.utc) + timedelta(hours=data.sla_hours)
    task = Task(
        workflow_instance_id=data.workflow_instance_id,
        node_id=data.node_id,
        title=data.title,
        description=data.description,
        assigned_role=data.assigned_role,
        form_schema=json.dumps(data.form_schema) if data.form_schema else None,
        sla_hours=data.sla_hours,
        due_at=due_at,
        priority=data.priority,
        agent_context=json.dumps(data.agent_context) if data.agent_context else None,
    )
    db.add(task)
    await db.flush()
    await audit.record(
        entity_type="task",
        entity_id=task.id,
        action="created",
        actor_id="system",
        actor_email="system",
        payload={"title": task.title, "role": task.assigned_role},
        workflow_instance_id=data.workflow_instance_id,
    )
    return task


async def claim_task(db: AsyncSession, task: Task, data: TaskClaim, audit: AuditClient) -> Task:
    task.assigned_user_id = data.user_id
    task.assigned_user_email = data.user_email
    task.claimed_at = datetime.now(timezone.utc)
    task.status = "claimed"
    await db.flush()
    await audit.record(
        entity_type="task",
        entity_id=task.id,
        action="claimed",
        actor_id=data.user_id,
        actor_email=data.user_email,
        workflow_instance_id=task.workflow_instance_id,
    )
    return task


async def complete_task(
    db: AsyncSession, task: Task, data: TaskComplete, workflow_url: str, audit: AuditClient
) -> Task:
    task.status = "completed"
    task.completed_at = datetime.now(timezone.utc)
    task.completion_signal = data.signal
    task.form_data = json.dumps(data.form_data)
    task.comments = data.comments
    await db.flush()

    await audit.record(
        entity_type="task",
        entity_id=task.id,
        action="completed",
        actor_id=data.user_id,
        actor_email=data.user_email,
        payload={"signal": data.signal},
        workflow_instance_id=task.workflow_instance_id,
    )

    # Commit before signaling the workflow engine. The engine calls back to
    # create the next task, and SQLite deadlocks if our write lock is still held.
    await db.commit()

    # Signal workflow engine
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{workflow_url}/v1/instances/{task.workflow_instance_id}/signal",
                json={
                    "signal": data.signal,
                    "actor_id": data.user_id,
                    "actor_email": data.user_email,
                    "payload": {**data.form_data, "task_id": task.id, "comments": data.comments},
                },
            )
            r.raise_for_status()
    except Exception as exc:
        logger.error("signal_workflow_failed", extra={"error": str(exc), "task_id": task.id})

    return task


async def reassign_task(db: AsyncSession, task: Task, data: TaskReassign, audit: AuditClient) -> Task:
    if data.new_role:
        task.assigned_role = data.new_role
    if data.new_user_id:
        task.assigned_user_id = data.new_user_id
        task.assigned_user_email = data.new_user_email
    task.status = "open"
    task.claimed_at = None
    await db.flush()
    await audit.record(
        entity_type="task",
        entity_id=task.id,
        action="reassigned",
        actor_id="system",
        actor_email="system",
        payload={"reason": data.reason, "new_role": data.new_role},
        workflow_instance_id=task.workflow_instance_id,
    )
    return task


async def list_tasks(
    db: AsyncSession,
    *,
    user_role: str | None = None,
    user_id: str | None = None,
    workflow_instance_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Task], int]:
    q = select(Task)
    if workflow_instance_id:
        q = q.where(Task.workflow_instance_id == workflow_instance_id)
    if status:
        q = q.where(Task.status == status)
    if user_id:
        q = q.where((Task.assigned_user_id == user_id) | (Task.assigned_user_id == None))  # noqa: E711
    if user_role:
        q = q.where(Task.assigned_role == user_role)
    count = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.order_by(Task.due_at).offset(offset).limit(limit))).scalars().all()
    return list(rows), count


async def escalate_overdue(db: AsyncSession, audit: AuditClient):
    """Called by scheduler — marks overdue tasks as escalated."""
    now = datetime.now(timezone.utc)
    q = select(Task).where(Task.status.in_(["open", "claimed"]), Task.due_at < now, Task.escalated == False)  # noqa: E712
    tasks = (await db.execute(q)).scalars().all()
    for task in tasks:
        task.escalated = True
        task.priority = "high"
        await audit.record(
            entity_type="task",
            entity_id=task.id,
            action="escalated",
            actor_id="system",
            actor_email="system",
            payload={"due_at": task.due_at.isoformat() if task.due_at else None},
            workflow_instance_id=task.workflow_instance_id,
        )
    await db.flush()
    return len(tasks)
