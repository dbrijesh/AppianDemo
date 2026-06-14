import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from .database import get_db
from .schemas import (
    DefinitionCreate, DefinitionUpdate, DefinitionOut,
    InstanceStart, InstanceSignal, InstanceOut, HistoryOut,
)
from . import service
from .config import get_settings
from mgp_shared.audit_client import AuditClient

router = APIRouter(prefix="/v1")
settings = get_settings()
_audit = AuditClient(settings.audit_core_url)


# ── Definitions ────────────────────────────────────────────────────────────────

@router.get("/definitions", response_model=list[DefinitionOut])
async def list_definitions(db: AsyncSession = Depends(get_db)):
    items = await service.list_definitions(db)
    return [_def_out(d) for d in items]


@router.post("/definitions", response_model=DefinitionOut, status_code=201)
async def create_definition(body: DefinitionCreate, creator_id: str = Query("system"), db: AsyncSession = Depends(get_db)):
    try:
        d = await service.create_definition(db, body, creator_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _def_out(d)


@router.get("/definitions/{defn_id}", response_model=DefinitionOut)
async def get_definition(defn_id: str, db: AsyncSession = Depends(get_db)):
    d = await service.get_definition(db, defn_id)
    if not d:
        raise HTTPException(status_code=404, detail="Definition not found")
    return _def_out(d)


@router.put("/definitions/{defn_id}", response_model=DefinitionOut)
async def update_definition(
    defn_id: str, body: DefinitionUpdate,
    updater_id: str = Query("system"),
    db: AsyncSession = Depends(get_db),
):
    d = await service.get_definition(db, defn_id)
    if not d:
        raise HTTPException(status_code=404, detail="Definition not found")
    try:
        d = await service.update_definition(db, d, body, updater_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _def_out(d)


# ── Instances ──────────────────────────────────────────────────────────────────

@router.post("/definitions/{slug}/start", response_model=InstanceOut, status_code=201)
async def start_instance(slug: str, body: InstanceStart, db: AsyncSession = Depends(get_db)):
    defn = await service.get_active_definition_by_slug(db, slug)
    if not defn:
        raise HTTPException(status_code=404, detail=f"No active definition for slug '{slug}'")
    instance = await service.start_instance(db, defn, body, settings.task_url, _audit, settings.agent_url)
    return _inst_out(instance)


@router.get("/instances", response_model=dict)
async def list_instances(
    entity_id: str | None = Query(None),
    slug: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    items, total = await service.list_instances(db, entity_id=entity_id, slug=slug, status=status, limit=limit, offset=offset)
    return {"total": total, "items": [_inst_out(i).model_dump() for i in items]}


@router.get("/instances/{instance_id}", response_model=InstanceOut)
async def get_instance(instance_id: str, db: AsyncSession = Depends(get_db)):
    inst = await service.get_instance(db, instance_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Instance not found")
    return _inst_out(inst)


@router.post("/instances/{instance_id}/signal", response_model=InstanceOut)
async def signal_instance(instance_id: str, body: InstanceSignal, db: AsyncSession = Depends(get_db)):
    inst = await service.get_instance(db, instance_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Instance not found")
    if inst.status != "running":
        raise HTTPException(status_code=409, detail=f"Instance is {inst.status}")
    inst = await service.process_signal(db, inst, body, settings.task_url, _audit, settings.agent_url)
    return _inst_out(inst)


@router.get("/instances/{instance_id}/history", response_model=list[HistoryOut])
async def get_history(instance_id: str, db: AsyncSession = Depends(get_db)):
    items = await service.get_history(db, instance_id)
    return [_hist_out(h) for h in items]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _def_out(d) -> DefinitionOut:
    return DefinitionOut.model_validate({
        "id": d.id, "name": d.name, "slug": d.slug, "version": d.version,
        "is_active": d.is_active, "description": d.description,
        "graph": d.graph_dict, "created_by": d.created_by,
        "created_at": d.created_at, "updated_at": d.updated_at,
    })


def _inst_out(i) -> InstanceOut:
    return InstanceOut.model_validate({
        "id": i.id, "definition_id": i.definition_id,
        "definition_slug": i.definition_slug, "definition_version": i.definition_version,
        "status": i.status, "current_node_id": i.current_node_id,
        "context": i.context_dict,
        "started_by_id": i.started_by_id, "started_by_email": i.started_by_email,
        "started_at": i.started_at, "completed_at": i.completed_at,
        "entity_type": i.entity_type, "entity_id": i.entity_id,
    })


def _hist_out(h) -> HistoryOut:
    out = HistoryOut.model_validate(h)
    out.payload = json.loads(h.payload) if isinstance(h.payload, str) else h.payload
    return out
