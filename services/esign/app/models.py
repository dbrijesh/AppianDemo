import uuid
import hashlib
import json
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from mgp_shared.database import Base


class ESignature(Base):
    __tablename__ = "esignatures"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    record_id: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    record_type: Mapped[str] = mapped_column(String(128), nullable=False)
    record_version_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    signer_id: Mapped[str] = mapped_column(String(256), nullable=False)
    signer_email: Mapped[str] = mapped_column(String(256), nullable=False)
    meaning: Mapped[str] = mapped_column(String(512), nullable=False)
    manifestation: Mapped[str] = mapped_column(String(512), nullable=False)
    workflow_instance_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    signed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    signature_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    re_auth_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    def compute_signature_hash(self) -> str:
        content = json.dumps({
            "record_id": self.record_id,
            "record_version_hash": self.record_version_hash,
            "signer_id": self.signer_id,
            "meaning": self.meaning,
            "signed_at": self.signed_at.isoformat() if self.signed_at else None,
        }, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()
