from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from .database import get_db
from .schemas import ESignRequest, ESignOut, ESignVerifyResult
from . import service as svc
from .config import get_settings
from mgp_shared.audit_client import AuditClient

router = APIRouter(prefix="/v1")
settings = get_settings()
_audit = AuditClient(settings.audit_core_url)


@router.post("/signatures", response_model=ESignOut, status_code=201)
async def create_signature(body: ESignRequest, db: AsyncSession = Depends(get_db)):
    sig = await svc.create_signature(db, body, settings.identity_url, _audit)
    return ESignOut.model_validate(sig)


@router.get("/signatures/{record_id}", response_model=list[ESignOut])
async def get_signatures(record_id: str, db: AsyncSession = Depends(get_db)):
    sigs = await svc.list_signatures(db, record_id)
    return [ESignOut.model_validate(s) for s in sigs]


@router.get("/signatures/{sig_id}/verify", response_model=ESignVerifyResult)
async def verify(sig_id: str, db: AsyncSession = Depends(get_db)):
    return await svc.verify_signature(db, sig_id)
