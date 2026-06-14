import json
import logging
from datetime import datetime, timezone
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from .models import WorkflowDefinition, WorkflowInstance, WorkflowHistory
from .schemas import DefinitionCreate, DefinitionUpdate, InstanceStart, InstanceSignal
from .engine import state_machine as sm
from .engine import spiff_executor as executor
from mgp_shared.audit_client import AuditClient

logger = logging.getLogger(__name__)


# ── Definitions ────────────────────────────────────────────────────────────────

async def create_definition(db: AsyncSession, data: DefinitionCreate, creator_id: str) -> WorkflowDefinition:
    graph_dict = data.graph.model_dump()
    errors = sm.validate_graph(graph_dict)
    if errors:
        raise ValueError(f"Invalid graph: {errors}")

    # Deactivate previous versions of same slug
    existing = await db.execute(select(WorkflowDefinition).where(WorkflowDefinition.slug == data.slug))
    prev_versions = list(existing.scalars().all())
    max_version = max((d.version for d in prev_versions), default=0)
    for d in prev_versions:
        d.is_active = False

    defn = WorkflowDefinition(
        name=data.name,
        slug=data.slug,
        version=max_version + 1,
        description=data.description,
        graph=json.dumps(graph_dict),
        created_by=creator_id,
    )
    db.add(defn)
    await db.flush()
    return defn


async def get_definition(db: AsyncSession, defn_id: str) -> WorkflowDefinition | None:
    result = await db.execute(select(WorkflowDefinition).where(WorkflowDefinition.id == defn_id))
    return result.scalar_one_or_none()


async def get_active_definition_by_slug(db: AsyncSession, slug: str) -> WorkflowDefinition | None:
    result = await db.execute(
        select(WorkflowDefinition)
        .where(WorkflowDefinition.slug == slug, WorkflowDefinition.is_active == True)
        .order_by(desc(WorkflowDefinition.version))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_definitions(db: AsyncSession) -> list[WorkflowDefinition]:
    result = await db.execute(select(WorkflowDefinition).order_by(desc(WorkflowDefinition.created_at)))
    return list(result.scalars().all())


async def update_definition(db: AsyncSession, defn: WorkflowDefinition, data: DefinitionUpdate, updater_id: str) -> WorkflowDefinition:
    if data.graph:
        graph_dict = data.graph.model_dump()
        errors = sm.validate_graph(graph_dict)
        if errors:
            raise ValueError(f"Invalid graph: {errors}")
        # Save as new version
        return await create_definition(
            db,
            DefinitionCreate(
                name=data.name or defn.name,
                slug=defn.slug,
                description=data.description or defn.description,
                graph=data.graph,
            ),
            updater_id,
        )
    if data.name:
        defn.name = data.name
    if data.description:
        defn.description = data.description
    if data.is_active is not None:
        defn.is_active = data.is_active
    await db.flush()
    return defn


# ── Instances ──────────────────────────────────────────────────────────────────

async def start_instance(
    db: AsyncSession,
    defn: WorkflowDefinition,
    data: InstanceStart,
    task_url: str,
    audit_client: AuditClient,
    agent_url: str = "http://localhost:8006",
) -> WorkflowInstance:
    graph = defn.graph_dict
    start_node = sm.get_start_node(graph)
    if not start_node:
        raise ValueError("Workflow has no start node")

    instance = WorkflowInstance(
        definition_id=defn.id,
        definition_slug=defn.slug,
        definition_version=defn.version,
        started_by_id=data.started_by_id,
        started_by_email=data.started_by_email,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        context=json.dumps(data.context),
    )
    db.add(instance)
    await db.flush()

    await audit_client.record(
        entity_type="workflow_instance",
        entity_id=instance.id,
        action="started",
        actor_id=data.started_by_id,
        actor_email=data.started_by_email,
        payload={"definition_slug": defn.slug, "version": defn.version},
        workflow_instance_id=instance.id,
    )

    instance = await executor.enter_node(db, instance, graph, start_node["id"], task_url, audit_client, agent_url)
    return instance


async def get_instance(db: AsyncSession, instance_id: str) -> WorkflowInstance | None:
    result = await db.execute(select(WorkflowInstance).where(WorkflowInstance.id == instance_id))
    return result.scalar_one_or_none()


async def list_instances(
    db: AsyncSession,
    entity_id: str | None = None,
    slug: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[WorkflowInstance], int]:
    q = select(WorkflowInstance)
    if entity_id:
        q = q.where(WorkflowInstance.entity_id == entity_id)
    if slug:
        q = q.where(WorkflowInstance.definition_slug == slug)
    if status:
        q = q.where(WorkflowInstance.status == status)
    count = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.order_by(desc(WorkflowInstance.started_at)).offset(offset).limit(limit))).scalars().all()
    return list(rows), count


async def process_signal(
    db: AsyncSession,
    instance: WorkflowInstance,
    data: InstanceSignal,
    task_url: str,
    audit_client: AuditClient,
    agent_url: str = "http://localhost:8006",
) -> WorkflowInstance:
    defn = await get_definition(db, instance.definition_id)
    if not defn:
        raise ValueError("Definition not found")
    graph = defn.graph_dict
    return await executor.signal_instance(
        db, instance, graph,
        signal=data.signal,
        actor_id=data.actor_id,
        actor_email=data.actor_email,
        payload=data.payload,
        task_url=task_url,
        audit_client=audit_client,
        agent_url=agent_url,
    )


async def get_history(db: AsyncSession, instance_id: str) -> list[WorkflowHistory]:
    result = await db.execute(
        select(WorkflowHistory)
        .where(WorkflowHistory.instance_id == instance_id)
        .order_by(WorkflowHistory.occurred_at)
    )
    return list(result.scalars().all())
