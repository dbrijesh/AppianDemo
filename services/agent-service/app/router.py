import json
import os
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt as jose_jwt
from .database import get_db
from .schemas import AgentInvokeRequest, AgentTraceOut, DBQueryRequest, DBQueryResponse, PipelineCreate, PipelineUpdate, PipelineOut
from . import service
from .config import get_settings

router = APIRouter(prefix="/v1")
settings = get_settings()


def _cross_db_paths() -> dict[str, str]:
    # Always resolve to absolute paths so thread-pool executor has no CWD ambiguity
    base = os.path.abspath(settings.cross_db_base)
    return {
        "identity": os.path.join(base, "identity", "identity.db"),
        "workflow":  os.path.join(base, "workflow", "workflow.db"),
        "tasks":     os.path.join(base, "tasks", "tasks.db"),
        "audit":     os.path.join(base, "audit", "audit.db"),
    }


def _require_admin(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization token")
    token = authorization.removeprefix("Bearer ")
    try:
        payload = jose_jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    roles: list[str] = payload.get("roles", [])
    if "admin" not in roles:
        raise HTTPException(status_code=403, detail="Admin role required")
    return payload


def _trace_out(t) -> AgentTraceOut:
    out = AgentTraceOut.model_validate(t)
    out.output = json.loads(t.output) if isinstance(t.output, str) else t.output
    return out


@router.post("/agents/invoke", response_model=AgentTraceOut, status_code=201)
async def invoke_agent(body: AgentInvokeRequest, db: AsyncSession = Depends(get_db)):
    try:
        trace = await service.invoke_agent(db, body, settings.llm_gateway_url, settings.llm_default_model)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _trace_out(trace)


@router.get("/agents/traces/{trace_id}", response_model=AgentTraceOut)
async def get_trace(trace_id: str, db: AsyncSession = Depends(get_db)):
    trace = await service.get_trace(db, trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return _trace_out(trace)


@router.get("/agents/traces", response_model=list[AgentTraceOut])
async def list_traces(
    agent_type: str | None = Query(None),
    workflow_instance_id: str | None = Query(None),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_db),
):
    traces = await service.list_traces(db, agent_type=agent_type, workflow_instance_id=workflow_instance_id, limit=limit)
    return [_trace_out(t) for t in traces]


@router.get("/agents/types")
async def list_agent_types(db: AsyncSession = Depends(get_db)):
    pipelines = await service.list_pipelines(db)
    return {
        "types": list(service.AGENT_REGISTRY.keys()),
        "pipelines": [
            {"id": f"pipeline:{p.id}", "name": p.name, "description": p.description}
            for p in pipelines
        ],
    }


# ── Pipeline CRUD ──────────────────────────────────────────────────────────────

@router.get("/pipelines", response_model=list[PipelineOut])
async def list_pipelines(db: AsyncSession = Depends(get_db)):
    items = await service.list_pipelines(db)
    return [PipelineOut.model_validate(p) for p in items]


@router.post("/pipelines", response_model=PipelineOut, status_code=201)
async def create_pipeline(body: PipelineCreate, db: AsyncSession = Depends(get_db)):
    p = await service.create_pipeline(db, body)
    return PipelineOut.model_validate(p)


@router.get("/pipelines/{pipeline_id}", response_model=PipelineOut)
async def get_pipeline(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    p = await service.get_pipeline(db, pipeline_id)
    if not p:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return PipelineOut.model_validate(p)


@router.put("/pipelines/{pipeline_id}", response_model=PipelineOut)
async def update_pipeline(pipeline_id: str, body: PipelineUpdate, db: AsyncSession = Depends(get_db)):
    p = await service.get_pipeline(db, pipeline_id)
    if not p:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    p = await service.update_pipeline(db, p, body)
    return PipelineOut.model_validate(p)


@router.delete("/pipelines/{pipeline_id}", status_code=204)
async def delete_pipeline(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    p = await service.get_pipeline(db, pipeline_id)
    if not p:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    await service.delete_pipeline(db, p)


@router.post("/admin/db-query", response_model=DBQueryResponse)
async def db_query(
    body: DBQueryRequest,
    _admin: dict = Depends(_require_admin),
):
    from .agents.db_query import db_query as run_query
    result = await run_query(
        question=body.question,
        max_rows=body.max_rows,
        llm_gateway_url=settings.llm_gateway_url,
        model=settings.llm_default_model,
        own_db_path=settings.own_db_path,
        cross_db_paths=_cross_db_paths(),
    )
    return DBQueryResponse(**result)
