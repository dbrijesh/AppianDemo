import logging
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .models import ESignature
from .schemas import ESignRequest, ESignVerifyResult
from mgp_shared.audit_client import AuditClient

logger = logging.getLogger(__name__)


async def create_signature(
    db: AsyncSession,
    data: ESignRequest,
    identity_url: str,
    audit_client: AuditClient,
) -> ESignature:
    # 21 CFR Part 11: re-authenticate the signer
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f"{identity_url}/v1/auth/token",
            json={"email": data.signer_email, "password": data.password},
        )
    re_auth_verified = r.status_code == 200

    sig = ESignature(
        record_id=data.record_id,
        record_type=data.record_type,
        record_version_hash=data.record_version_hash,
        signer_id=data.signer_id,
        signer_email=data.signer_email,
        meaning=data.meaning,
        manifestation=data.manifestation,
        workflow_instance_id=data.workflow_instance_id,
        re_auth_verified=re_auth_verified,
    )
    sig.signature_hash = sig.compute_signature_hash()
    db.add(sig)
    await db.flush()

    await audit_client.record(
        entity_type=data.record_type,
        entity_id=data.record_id,
        action="esigned",
        actor_id=data.signer_id,
        actor_email=data.signer_email,
        payload={"meaning": data.meaning, "sig_id": sig.id, "re_auth": re_auth_verified},
        workflow_instance_id=data.workflow_instance_id,
    )
    return sig


async def list_signatures(db: AsyncSession, record_id: str) -> list[ESignature]:
    result = await db.execute(
        select(ESignature).where(ESignature.record_id == record_id)
    )
    return list(result.scalars().all())


async def verify_signature(db: AsyncSession, sig_id: str) -> ESignVerifyResult:
    result = await db.execute(select(ESignature).where(ESignature.id == sig_id))
    sig = result.scalar_one_or_none()
    if not sig:
        return ESignVerifyResult(valid=False, signature_id=sig_id, signer_email="", signed_at=None, message="Not found")  # type: ignore
    recomputed = sig.compute_signature_hash()
    valid = recomputed == sig.signature_hash
    return ESignVerifyResult(
        valid=valid,
        signature_id=sig.id,
        signer_email=sig.signer_email,
        signed_at=sig.signed_at,
        message="Valid" if valid else "Hash mismatch — signature tampered",
    )
