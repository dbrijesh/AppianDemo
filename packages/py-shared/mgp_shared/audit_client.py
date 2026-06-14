import httpx
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class AuditClient:
    def __init__(self, base_url: str):
        self._base_url = base_url.rstrip("/")

    async def record(
        self,
        *,
        entity_type: str,
        entity_id: str,
        action: str,
        actor_id: str,
        actor_email: str,
        payload: dict | None = None,
        workflow_instance_id: str | None = None,
    ) -> None:
        body = {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "actor_id": actor_id,
            "actor_email": actor_email,
            "payload": payload or {},
            "workflow_instance_id": workflow_instance_id,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.post(f"{self._base_url}/v1/events", json=body)
                r.raise_for_status()
        except Exception as exc:
            logger.error("audit_client_error", extra={"error": str(exc), "body": body})
