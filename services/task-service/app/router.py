import json
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from .database import get_db
from .schemas import TaskCreate, TaskClaim, TaskComplete, TaskReassign, TaskOut
from . import service
from .config import get_settings
from mgp_shared.audit_client import AuditClient

router = APIRouter(prefix="/v1")
settings = get_settings()
_audit = AuditClient(settings.audit_core_url)


def _task_out(t) -> TaskOut:
    out = TaskOut.model_validate(t)
    out.form_schema = json.loads(t.form_schema) if t.form_schema else None
    out.form_data = json.loads(t.form_data) if t.form_data else None
    return out


@router.post("/tasks", response_model=TaskOut, status_code=201)
async def create_task(body: TaskCreate, db: AsyncSession = Depends(get_db)):
    task = await service.create_task(db, body, _audit)
    return _task_out(task)


@router.get("/tasks", response_model=dict)
async def list_tasks(
    role: str | None = Query(None),
    user_id: str | None = Query(None),
    workflow_instance_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    tasks, total = await service.list_tasks(
        db,
        user_role=role,
        user_id=user_id,
        workflow_instance_id=workflow_instance_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    return {"total": total, "items": [_task_out(t).model_dump() for t in tasks]}


@router.get("/tasks/{task_id}", response_model=TaskOut)
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    result = await db.execute(select(service.Task).where(service.Task.id == task_id))  # type: ignore
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_out(task)


@router.post("/tasks/{task_id}/claim", response_model=TaskOut)
async def claim_task(task_id: str, body: TaskClaim, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    result = await db.execute(select(service.Task).where(service.Task.id == task_id))  # type: ignore
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in ("open",):
        raise HTTPException(status_code=409, detail=f"Task is {task.status}")
    task = await service.claim_task(db, task, body, _audit)
    return _task_out(task)


@router.post("/tasks/{task_id}/complete", response_model=TaskOut)
async def complete_task(task_id: str, body: TaskComplete, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    result = await db.execute(select(service.Task).where(service.Task.id == task_id))  # type: ignore
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in ("open", "claimed"):
        raise HTTPException(status_code=409, detail=f"Task is {task.status}")
    task = await service.complete_task(db, task, body, settings.workflow_url, _audit)
    return _task_out(task)


@router.post("/tasks/{task_id}/attachments")
async def upload_attachment(task_id: str, file: UploadFile = File(...)):
    upload_dir = os.path.join(settings.upload_dir, task_id)
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = os.path.basename(file.filename or "upload")
    dest = os.path.join(upload_dir, safe_name)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"filename": safe_name, "url": f"/api/tasks/files/{task_id}/{safe_name}"}


@router.get("/files/{task_id}/{filename}")
async def serve_attachment(task_id: str, filename: str):
    safe_name = os.path.basename(filename)
    path = os.path.join(settings.upload_dir, task_id, safe_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@router.post("/tasks/{task_id}/reassign", response_model=TaskOut)
async def reassign_task(task_id: str, body: TaskReassign, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    result = await db.execute(select(service.Task).where(service.Task.id == task_id))  # type: ignore
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task = await service.reassign_task(db, task, body, _audit)
    return _task_out(task)
