"""Seed showcase audit events on first startup (skipped if events already exist)."""
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from .models import AuditEvent
from .schemas import AuditEventCreate
from .service import append_event

logger = logging.getLogger(__name__)

_WF1 = "wf-demo-mr-0001"
_WF2 = "wf-demo-cap-0001"
_WF3 = "wf-demo-cert-0001"

def _dt(days_ago: float, hours: int = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days_ago, hours=hours)


_SEED_EVENTS: list[AuditEventCreate] = [
    # ── Material Requisition workflow ──────────────────────────────────────
    AuditEventCreate(
        entity_type="workflow_instance", entity_id=_WF1,
        action="workflow_started",
        actor_id="user-operator-01", actor_email="alice@mgp.local",
        payload={"workflow_def": "material_requisition", "triggered_by": "ui"},
        workflow_instance_id=_WF1,
        occurred_at=_dt(3),
    ),
    AuditEventCreate(
        entity_type="task", entity_id="task-mr-create-01",
        action="task_created",
        actor_id="system", actor_email="system@mgp.local",
        payload={"title": "Create Material Requisition", "assigned_role": "operator"},
        workflow_instance_id=_WF1,
        occurred_at=_dt(3, hours=-1),
    ),
    AuditEventCreate(
        entity_type="task", entity_id="task-mr-create-01",
        action="task_claimed",
        actor_id="user-operator-01", actor_email="alice@mgp.local",
        payload={"user_email": "alice@mgp.local"},
        workflow_instance_id=_WF1,
        occurred_at=_dt(2, hours=22),
    ),
    AuditEventCreate(
        entity_type="task", entity_id="task-mr-create-01",
        action="task_completed",
        actor_id="user-operator-01", actor_email="alice@mgp.local",
        payload={"signal": "approved", "comments": "Requisition submitted for 500 units Part#A4-221"},
        workflow_instance_id=_WF1,
        occurred_at=_dt(2, hours=20),
    ),
    AuditEventCreate(
        entity_type="task", entity_id="task-mr-review-01",
        action="task_created",
        actor_id="system", actor_email="system@mgp.local",
        payload={"title": "Review Material Requisition", "assigned_role": "qa_manager"},
        workflow_instance_id=_WF1,
        occurred_at=_dt(2, hours=20),
    ),
    AuditEventCreate(
        entity_type="task", entity_id="task-mr-review-01",
        action="task_completed",
        actor_id="user-qam-01", actor_email="bob@mgp.local",
        payload={"signal": "approved", "comments": "Reviewed — quantities correct, approved for cost governance"},
        workflow_instance_id=_WF1,
        occurred_at=_dt(2, hours=16),
    ),
    AuditEventCreate(
        entity_type="task", entity_id="task-mr-cost-01",
        action="task_completed",
        actor_id="user-operator-01", actor_email="alice@mgp.local",
        payload={"signal": "approved", "comments": "Cost within budget envelope"},
        workflow_instance_id=_WF1,
        occurred_at=_dt(1, hours=18),
    ),
    AuditEventCreate(
        entity_type="esign_request", entity_id="esign-mr-fin-01",
        action="esign_signed",
        actor_id="user-fin-01", actor_email="carol@mgp.local",
        payload={"signer": "carol@mgp.local", "document": "Finance Approval — MR-0001"},
        workflow_instance_id=_WF1,
        occurred_at=_dt(1, hours=10),
    ),
    AuditEventCreate(
        entity_type="workflow_instance", entity_id=_WF1,
        action="workflow_completed",
        actor_id="system", actor_email="system@mgp.local",
        payload={"outcome": "approved", "total_duration_hrs": 56},
        workflow_instance_id=_WF1,
        occurred_at=_dt(1, hours=9),
    ),

    # ── Deviation / CAPA workflow ──────────────────────────────────────────
    AuditEventCreate(
        entity_type="workflow_instance", entity_id=_WF2,
        action="workflow_started",
        actor_id="user-operator-02", actor_email="dave@mgp.local",
        payload={"workflow_def": "deviation_capa", "triggered_by": "deviation_report"},
        workflow_instance_id=_WF2,
        occurred_at=_dt(5),
    ),
    AuditEventCreate(
        entity_type="agent_step", entity_id="agent-triage-01",
        action="agent_step_completed",
        actor_id="agent-service", actor_email="system@mgp.local",
        payload={"agent": "deviation_triage", "severity": "major", "category": "process_deviation",
                 "summary": "Deviation classified as major — temperature excursion on Batch B-2291"},
        workflow_instance_id=_WF2,
        occurred_at=_dt(4, hours=22),
    ),
    AuditEventCreate(
        entity_type="agent_step", entity_id="agent-rca-01",
        action="agent_step_completed",
        actor_id="agent-service", actor_email="system@mgp.local",
        payload={"agent": "rca_drafting", "root_cause": "Coolant valve PV-14 stuck closed",
                 "contributing_factors": ["maintenance backlog", "no redundant sensor"]},
        workflow_instance_id=_WF2,
        occurred_at=_dt(4, hours=18),
    ),
    AuditEventCreate(
        entity_type="task", entity_id="task-capa-review-01",
        action="task_completed",
        actor_id="user-qam-01", actor_email="bob@mgp.local",
        payload={"signal": "approved", "comments": "RCA accepted. CAPA actions assigned."},
        workflow_instance_id=_WF2,
        occurred_at=_dt(3, hours=14),
    ),

    # ── Certificate Management workflow ───────────────────────────────────
    AuditEventCreate(
        entity_type="workflow_instance", entity_id=_WF3,
        action="workflow_started",
        actor_id="user-operator-01", actor_email="alice@mgp.local",
        payload={"workflow_def": "certificate_management", "cert_type": "ISO 9001:2015 Renewal"},
        workflow_instance_id=_WF3,
        occurred_at=_dt(7),
    ),
    AuditEventCreate(
        entity_type="task", entity_id="task-cert-doc-01",
        action="task_completed",
        actor_id="user-operator-01", actor_email="alice@mgp.local",
        payload={"signal": "approved", "comments": "All compliance documents uploaded"},
        workflow_instance_id=_WF3,
        occurred_at=_dt(6, hours=20),
    ),
    AuditEventCreate(
        entity_type="task", entity_id="task-cert-qa-01",
        action="task_completed",
        actor_id="user-qam-01", actor_email="bob@mgp.local",
        payload={"signal": "approved", "comments": "Documents verified against ISO checklist"},
        workflow_instance_id=_WF3,
        occurred_at=_dt(5, hours=16),
    ),
    AuditEventCreate(
        entity_type="esign_request", entity_id="esign-cert-01",
        action="esign_signed",
        actor_id="user-fin-01", actor_email="carol@mgp.local",
        payload={"signer": "carol@mgp.local", "document": "ISO 9001:2015 Certificate Approval"},
        workflow_instance_id=_WF3,
        occurred_at=_dt(4, hours=12),
    ),
    AuditEventCreate(
        entity_type="workflow_instance", entity_id=_WF3,
        action="workflow_completed",
        actor_id="system", actor_email="system@mgp.local",
        payload={"outcome": "certificate_issued", "cert_ref": "ISO-9001-2025-MGP-001"},
        workflow_instance_id=_WF3,
        occurred_at=_dt(4, hours=11),
    ),

    # ── Auth / user events ─────────────────────────────────────────────────
    AuditEventCreate(
        entity_type="user", entity_id="user-operator-01",
        action="user_login",
        actor_id="user-operator-01", actor_email="alice@mgp.local",
        payload={"ip": "192.168.1.10", "user_agent": "Chrome/124"},
        occurred_at=_dt(0, hours=2),
    ),
    AuditEventCreate(
        entity_type="user", entity_id="user-admin-01",
        action="user_login",
        actor_id="user-admin-01", actor_email="admin@mgp.local",
        payload={"ip": "192.168.1.1", "user_agent": "Chrome/124"},
        occurred_at=_dt(0, hours=1),
    ),
]


async def seed_audit_events(db: AsyncSession) -> None:
    count = (await db.execute(select(func.count()).select_from(AuditEvent))).scalar_one()
    if count > 0:
        return
    logger.info("Seeding %d showcase audit events", len(_SEED_EVENTS))
    for ev in _SEED_EVENTS:
        await append_event(db, ev)
    await db.commit()
    logger.info("Audit event seeding complete")
