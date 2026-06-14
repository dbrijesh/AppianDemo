from pydantic import BaseModel
from datetime import datetime


class ESignRequest(BaseModel):
    record_id: str
    record_type: str
    record_version_hash: str
    signer_id: str
    signer_email: str
    password: str  # re-authentication credential (21 CFR Part 11)
    meaning: str   # e.g. "I approve this Material Requisition"
    manifestation: str  # e.g. "Approved by Jane Doe on 2024-01-15"
    workflow_instance_id: str | None = None


class ESignOut(BaseModel):
    id: str
    record_id: str
    record_type: str
    record_version_hash: str
    signer_id: str
    signer_email: str
    meaning: str
    manifestation: str
    signed_at: datetime
    signature_hash: str
    re_auth_verified: bool
    workflow_instance_id: str | None
    model_config = {"from_attributes": True}


class ESignVerifyResult(BaseModel):
    valid: bool
    signature_id: str
    signer_email: str
    signed_at: datetime
    message: str
