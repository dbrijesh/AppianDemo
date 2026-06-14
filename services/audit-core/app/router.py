import json
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from .database import get_db
from .schemas import AuditEventCreate, AuditEventOut, ChainVerifyResult
from . import service

router = APIRouter(prefix="/v1")


@router.post("/events", response_model=AuditEventOut, status_code=201)
async def create_event(body: AuditEventCreate, db: AsyncSession = Depends(get_db)):
    event = await service.append_event(db, body)
    out = AuditEventOut.model_validate(event)
    out.payload = json.loads(event.payload) if isinstance(event.payload, str) else event.payload
    return out


@router.get("/events", response_model=dict)
async def list_events(
    entity_type: str | None = Query(None),
    entity_id: str | None = Query(None),
    workflow_instance_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    events, total = await service.get_events(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        workflow_instance_id=workflow_instance_id,
        limit=limit,
        offset=offset,
    )
    items = []
    for e in events:
        out = AuditEventOut.model_validate(e)
        out.payload = json.loads(e.payload) if isinstance(e.payload, str) else e.payload
        items.append(out)
    return {"total": total, "items": [i.model_dump() for i in items]}


@router.get("/chain/verify", response_model=ChainVerifyResult)
async def verify_chain(db: AsyncSession = Depends(get_db)):
    return await service.verify_chain(db)
