"""
Seed realistic demo data into workflow, task, and agent databases.
Run once:  python seed_demo_data.py
"""
import os
import sqlite3
import uuid
import json
from datetime import datetime, timezone, timedelta

_ROOT = os.path.dirname(os.path.abspath(__file__))

def _svcdb(svc: str, dbname: str) -> str:
    """Return DB path matching the service's CWD-relative sqlite+aiosqlite URL."""
    return os.path.join(_ROOT, "services", svc, "data", dbname)

WF_DB  = _svcdb("workflow-engine", "workflow.db")
TSK_DB = _svcdb("task-service", "tasks.db")
AGT_DB = _svcdb("agent-service", "agents.db")

DEF_CERT = "dd9d87f9-5b0d-4c9f-b5b0-968000c635de"
DEF_MR   = "1e6d5791-56d0-4e1e-b289-2863efafc3d5"
DEF_DEV  = "54e3b857-3f2d-45f8-b469-221ee10c5f43"

def ts(days_ago=0, hours_ago=0):
    dt = datetime.now(timezone.utc) - timedelta(days=days_ago, hours=hours_ago)
    return dt.strftime("%Y-%m-%d %H:%M:%S+00:00")

def uid(): return str(uuid.uuid4())

def hist(iid, nid, ntype, nlabel, action, actor_id=None, actor_email=None, payload=None, when=None):
    return (uid(), iid, nid, ntype, nlabel, action, actor_id, actor_email,
            json.dumps(payload or {}), when or ts())

# ── Certificate Management instances ─────────────────────────────────────────

CERTS_COMPLETED = [
    {
        "cert_name": "ISO 9001:2015 Quality Management",
        "cert_type": "ISO 9001",
        "authorised_by": "Bureau Veritas",
        "applicant_name": "Rajesh Kumar",
        "applicant_department": "Quality",
        "expires_on": "2027-03-15",
        "scope_description": "Quality management system for manufacturing line A and B.",
        "cert_type_form": "ISO 9001",
        "risk_score": 3,
        "recommendation": "approve",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"),
        "admin_by": ("adm-001", "admin@mgp.local"),
        "days_ago": 180,
        "entity_id": "CERT-20240101",
    },
    {
        "cert_name": "GMP Manufacturing Certification",
        "cert_type": "GMP",
        "authorised_by": "Central Drugs Standard Control Organisation",
        "applicant_name": "Priya Sharma",
        "applicant_department": "Production",
        "expires_on": "2026-09-30",
        "scope_description": "GMP compliance for pharmaceutical production facility.",
        "risk_score": 4,
        "recommendation": "approve",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"),
        "admin_by": ("adm-001", "admin@mgp.local"),
        "days_ago": 90,
        "entity_id": "CERT-20240402",
    },
    {
        "cert_name": "ISO 13485 Medical Devices",
        "cert_type": "ISO 13485",
        "authorised_by": "BSI Group",
        "applicant_name": "Amit Patel",
        "applicant_department": "R&D",
        "expires_on": "2027-01-20",
        "scope_description": "Medical device quality management system — Class II devices.",
        "risk_score": 6,
        "recommendation": "approve",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"),
        "admin_by": ("adm-001", "admin@mgp.local"),
        "days_ago": 60,
        "entity_id": "CERT-20240601",
    },
    {
        "cert_name": "CMMI Level 5 Process Maturity",
        "cert_type": "CMMI5",
        "authorised_by": "CMMI Institute",
        "applicant_name": "Sonal Mehta",
        "applicant_department": "Engineering",
        "expires_on": "2028-06-01",
        "scope_description": "Software development process capability maturity level 5 appraisal.",
        "risk_score": 2,
        "recommendation": "approve",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"),
        "admin_by": ("adm-001", "admin@mgp.local"),
        "days_ago": 150,
        "entity_id": "CERT-20240115",
    },
    {
        "cert_name": "CE Mark European Conformity",
        "cert_type": "CE Mark",
        "authorised_by": "TÜV Rheinland",
        "applicant_name": "Vikram Singh",
        "applicant_department": "Compliance",
        "expires_on": "2026-12-31",
        "scope_description": "CE conformity declaration for industrial control equipment exported to EU.",
        "risk_score": 5,
        "recommendation": "approve",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"),
        "admin_by": ("adm-001", "admin@mgp.local"),
        "days_ago": 30,
        "entity_id": "CERT-20241101",
    },
]

CERTS_RUNNING = [
    {
        "cert_name": "ISO 9001:2015 Annual Renewal 2026",
        "cert_type": "ISO 9001",
        "authorised_by": "Bureau Veritas",
        "applicant_name": "Rajesh Kumar",
        "applicant_department": "Quality",
        "current_node": "qa_review",
        "started_by": ("op-001", "operator@mgp.local"),
        "days_ago": 5,
        "entity_id": "CERT-20260101",
    },
    {
        "cert_name": "FDA 510k Medical Device Clearance",
        "cert_type": "FDA 510k",
        "authorised_by": "US Food and Drug Administration",
        "applicant_name": "Amit Patel",
        "applicant_department": "R&D",
        "current_node": "doc_upload",
        "started_by": ("op-001", "operator@mgp.local"),
        "days_ago": 1,
        "entity_id": "CERT-20260202",
    },
    {
        "cert_name": "ISO 13485:2016 Surveillance Audit",
        "cert_type": "ISO 13485",
        "authorised_by": "DNV GL",
        "applicant_name": "Priya Sharma",
        "applicant_department": "Quality",
        "current_node": "final_approve",
        "started_by": ("op-001", "operator@mgp.local"),
        "days_ago": 8,
        "entity_id": "CERT-20260303",
    },
]

CERTS_REJECTED = [
    {
        "cert_name": "GMP Renewal — Health Canada",
        "cert_type": "GMP",
        "authorised_by": "Health Canada",
        "applicant_name": "Sonal Mehta",
        "applicant_department": "Production",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"),
        "days_ago": 45,
        "entity_id": "CERT-20241015",
    },
]

# ── Material Requisition instances ────────────────────────────────────────────

MRS_COMPLETED = [
    {
        "project": {"project_id": "PRJ-2302141001", "customer_name": "Mahindra & Mahindra", "customer_type": "Existing", "industry": "Automotive", "start_date": "2024-01-10", "completion_date": "2024-03-20", "customer_po": "MM-PO-4421"},
        "materials": [
            {"part_number": "131917", "description": "BAR, STAINLESS STEEL 80x30", "uom": "MTR", "required_qty": 120, "available_stock": 40, "requisition_qty": 80},
            {"part_number": "245810", "description": "PLATE, ALLOY STEEL 20mm", "uom": "KG", "required_qty": 500, "available_stock": 200, "requisition_qty": 300},
        ],
        "cost": 23400, "days_ago": 160, "entity_id": "PRJ-2302141001",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"), "admin_by": ("adm-001", "admin@mgp.local"),
    },
    {
        "project": {"project_id": "PRJ-2302141002", "customer_name": "Tata Motors", "customer_type": "Existing", "industry": "Automotive", "start_date": "2024-02-05", "completion_date": "2024-04-10", "customer_po": "TM-PO-8812"},
        "materials": [
            {"part_number": "312045", "description": "SHAFT, CARBON STEEL 40mm", "uom": "PCS", "required_qty": 200, "available_stock": 100, "requisition_qty": 100},
            {"part_number": "198234", "description": "BEARING, ROLLER 6205", "uom": "NOS", "required_qty": 400, "available_stock": 150, "requisition_qty": 250},
        ],
        "cost": 18200, "days_ago": 120, "entity_id": "PRJ-2302141002",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"), "admin_by": ("adm-001", "admin@mgp.local"),
    },
    {
        "project": {"project_id": "PRJ-2302141003", "customer_name": "Honda Cars India", "customer_type": "Existing", "industry": "Automotive", "start_date": "2024-03-01", "completion_date": "2024-05-15", "customer_po": "HC-PO-3312"},
        "materials": [
            {"part_number": "445621", "description": "TUBE, ALUMINIUM 60x3mm", "uom": "MTR", "required_qty": 300, "available_stock": 100, "requisition_qty": 200},
        ],
        "cost": 15600, "days_ago": 90, "entity_id": "PRJ-2302141003",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"), "admin_by": ("adm-001", "admin@mgp.local"),
    },
    {
        "project": {"project_id": "PRJ-2302141004", "customer_name": "Hyundai Motor India", "customer_type": "Existing", "industry": "Automotive", "start_date": "2024-04-10", "completion_date": "2024-06-20", "customer_po": "HMI-PO-6654"},
        "materials": [
            {"part_number": "678910", "description": "FLANGE, FORGED STEEL DN100", "uom": "NOS", "required_qty": 150, "available_stock": 60, "requisition_qty": 90},
            {"part_number": "112233", "description": "GASKET, RING JOINT 4 inch", "uom": "NOS", "required_qty": 300, "available_stock": 200, "requisition_qty": 100},
        ],
        "cost": 21300, "days_ago": 60, "entity_id": "PRJ-2302141004",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"), "admin_by": ("adm-001", "admin@mgp.local"),
    },
    {
        "project": {"project_id": "PRJ-2302141005", "customer_name": "Airbus SE", "customer_type": "Existing", "industry": "Aerospace", "start_date": "2024-02-20", "completion_date": "2024-06-01", "customer_po": "AIR-PO-0091"},
        "materials": [
            {"part_number": "900112", "description": "TITANIUM ALLOY BAR Ti-6Al-4V", "uom": "KG", "required_qty": 200, "available_stock": 0, "requisition_qty": 200},
            {"part_number": "900213", "description": "AEROSPACE GRADE FASTENERS", "uom": "NOS", "required_qty": 5000, "available_stock": 1000, "requisition_qty": 4000},
        ],
        "cost": 44800, "days_ago": 100, "entity_id": "PRJ-2302141005",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"), "admin_by": ("adm-001", "admin@mgp.local"),
    },
    {
        "project": {"project_id": "PRJ-2302141006", "customer_name": "Rio Tinto", "customer_type": "Existing", "industry": "Mining", "start_date": "2024-05-01", "completion_date": "2024-08-15", "customer_po": "RT-PO-7723"},
        "materials": [
            {"part_number": "550001", "description": "WEAR PLATE, HARDOX 450", "uom": "KG", "required_qty": 1200, "available_stock": 300, "requisition_qty": 900},
            {"part_number": "550044", "description": "BOLT SET, HIGH TENSILE M24", "uom": "NOS", "required_qty": 800, "available_stock": 400, "requisition_qty": 400},
        ],
        "cost": 31500, "days_ago": 45, "entity_id": "PRJ-2302141006",
        "started_by": ("op-001", "operator@mgp.local"),
        "qa_by": ("qa-001", "qa@mgp.local"), "admin_by": ("adm-001", "admin@mgp.local"),
    },
]

MRS_RUNNING = [
    {
        "project": {"project_id": "PRJ-2302141007", "customer_name": "Mercedes-Benz India", "customer_type": "New", "industry": "Automotive", "start_date": "2025-11-01", "completion_date": "2026-02-28", "customer_po": "MBI-PO-0123"},
        "materials": [{"part_number": "777001", "description": "PRECISION CASTING, ALUMINIUM", "uom": "NOS", "required_qty": 250, "available_stock": 0, "requisition_qty": 250}],
        "current_node": "review_mr", "days_ago": 3, "entity_id": "PRJ-2302141007",
        "started_by": ("op-001", "operator@mgp.local"),
    },
    {
        "project": {"project_id": "PRJ-2302141008", "customer_name": "BASF SE", "customer_type": "Existing", "industry": "Chemical", "start_date": "2025-10-15", "completion_date": "2026-01-30", "customer_po": "BASF-PO-4456"},
        "materials": [{"part_number": "888102", "description": "STAINLESS STEEL VESSEL LINING", "uom": "KG", "required_qty": 600, "available_stock": 200, "requisition_qty": 400}],
        "current_node": "cost_governance", "days_ago": 12, "entity_id": "PRJ-2302141008",
        "started_by": ("op-001", "operator@mgp.local"),
    },
]

# ── Deviation CAPA instances ──────────────────────────────────────────────────

DEVS_COMPLETED = [
    {
        "title": "Out-of-spec viscosity on Batch B-4421",
        "description": "Batch B-4421 exhibited viscosity readings 15% above upper specification limit. Detected during in-process QC check at mixing stage.",
        "severity": "Major", "category": "Process", "batch_number": "B-4421", "equipment_id": "EQ-MIXER-03", "detected_by": "qa@mgp.local",
        "days_ago": 65, "entity_id": "DEV-20240901",
        "started_by": ("op-001", "operator@mgp.local"), "admin_by": ("adm-001", "admin@mgp.local"),
    },
    {
        "title": "Equipment calibration drift — Pressure Gauge PG-17",
        "description": "Pressure gauge PG-17 on reactor R-02 showed 8% deviation from certified reference during routine calibration. All batches produced with this gauge under review.",
        "severity": "Critical", "category": "Equipment", "batch_number": "", "equipment_id": "PG-17", "detected_by": "operator@mgp.local",
        "days_ago": 110, "entity_id": "DEV-20240715",
        "started_by": ("op-001", "operator@mgp.local"), "admin_by": ("adm-001", "admin@mgp.local"),
    },
    {
        "title": "Raw material contamination — Supplier Lot RM-2024-09",
        "description": "Incoming raw material lot RM-2024-09 from supplier XYZ rejected after trace metal analysis showed lead content above 5 ppm (limit: 2 ppm).",
        "severity": "Major", "category": "Material", "batch_number": "RM-2024-09", "equipment_id": "", "detected_by": "qa@mgp.local",
        "days_ago": 130, "entity_id": "DEV-20240630",
        "started_by": ("op-001", "operator@mgp.local"), "admin_by": ("adm-001", "admin@mgp.local"),
    },
]

DEVS_RUNNING = [
    {
        "title": "Temperature excursion in cold storage Zone C",
        "description": "Zone C cold storage recorded temperature of 12°C (limit: 2–8°C) for approximately 4 hours during power disruption. Affected products quarantined pending investigation.",
        "severity": "Major", "category": "Environmental", "batch_number": "CRYO-2026-01", "equipment_id": "REFRIG-C", "detected_by": "operator@mgp.local",
        "current_node": "rca_review", "days_ago": 7, "entity_id": "DEV-20260501",
        "started_by": ("op-001", "operator@mgp.local"),
    },
    {
        "title": "Personnel qualification lapse — Line Operator",
        "description": "Annual requalification for line operator EMP-0341 expired 3 weeks ago. Operator continued to perform qualified tasks. Impact assessment required.",
        "severity": "Minor", "category": "Personnel", "batch_number": "", "equipment_id": "", "detected_by": "qa@mgp.local",
        "current_node": "human_review", "days_ago": 2, "entity_id": "DEV-20260502",
        "started_by": ("op-001", "operator@mgp.local"),
    },
    {
        "title": "Documentation inconsistency — Batch Record BR-2026-044",
        "description": "Batch record BR-2026-044 contains conflicting yield figures between in-process and final reconciliation sections. Both values signed off by different operators.",
        "severity": "Minor", "category": "Documentation", "batch_number": "B-2026-044", "equipment_id": "", "detected_by": "qa@mgp.local",
        "current_node": "capa_review", "days_ago": 15, "entity_id": "DEV-20260503",
        "started_by": ("op-001", "operator@mgp.local"),
    },
]

# ── Insert helpers ────────────────────────────────────────────────────────────

def insert_instance(cur, iid, def_id, slug, version, status, current_node, context, entity_id,
                    started_by_id, started_by_email, started_at, completed_at=None):
    cur.execute("""
        INSERT OR IGNORE INTO workflow_instances
        (id, definition_id, definition_slug, definition_version, status, current_node_id,
         context, started_by_id, started_by_email, started_at, completed_at, entity_type, entity_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (iid, def_id, slug, version, status, current_node,
          json.dumps({"_payload": context}),
          started_by_id, started_by_email, started_at, completed_at,
          slug.replace("_", "").rstrip("s"), entity_id))

def insert_hist(cur, iid, nid, ntype, nlabel, action, actor_id, actor_email, payload, when):
    cur.execute("""
        INSERT INTO workflow_history
        (id, instance_id, node_id, node_type, node_label, action, actor_id, actor_email, payload, occurred_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (uid(), iid, nid, ntype, nlabel, action, actor_id, actor_email, json.dumps(payload), when))

def insert_task(cur, iid, node_id, title, desc, role, status, schema, form_data, agent_ctx,
                assigned_user_id, assigned_user_email, sla_hours, created_at, completed_at=None, signal=None):
    due_at = (datetime.fromisoformat(created_at.replace("+00:00","")) + timedelta(hours=sla_hours)).strftime("%Y-%m-%d %H:%M:%S+00:00")
    cur.execute("""
        INSERT OR IGNORE INTO tasks
        (id, workflow_instance_id, node_id, title, description, assigned_role, assigned_user_id,
         assigned_user_email, status, priority, form_schema, form_data, sla_hours, due_at,
         created_at, claimed_at, completed_at, completion_signal, escalated, comments, agent_context)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (uid(), iid, node_id, title, desc, role, assigned_user_id, assigned_user_email,
          status, "normal", json.dumps(schema) if schema else None,
          json.dumps(form_data) if form_data else None,
          sla_hours, due_at, created_at,
          created_at if status in ("claimed","completed") else None,
          completed_at, signal, 0, "", json.dumps(agent_ctx) if agent_ctx else None))

# ── Main seeding ──────────────────────────────────────────────────────────────

wf_conn  = sqlite3.connect(WF_DB)
tsk_conn = sqlite3.connect(TSK_DB)
wf_cur   = wf_conn.cursor()
tsk_cur  = tsk_conn.cursor()

# ── Certificates completed ────────────────────────────────────────────────────
for c in CERTS_COMPLETED:
    iid = uid()
    d = c["days_ago"]
    op_id, op_email = c["started_by"]
    qa_id, qa_email = c["qa_by"]
    adm_id, adm_email = c["admin_by"]
    ctx = {k: v for k, v in c.items() if k not in ("started_by","qa_by","admin_by","days_ago","entity_id","risk_score","recommendation")}
    ctx["agent_cert_ai_review"] = {
        "risk_score": c["risk_score"], "risk_level": "low" if c["risk_score"] <= 4 else "medium",
        "recommendation": c["recommendation"],
        "summary": f"Certificate request reviewed. Risk score {c['risk_score']}/10 — documents appear complete and compliant.",
        "compliance_checklist": [
            {"item": "Valid certifying body", "status": "pass", "note": f"Issued by {c['authorised_by']}"},
            {"item": "Scope documentation", "status": "pass", "note": "Scope clearly defined"},
            {"item": "Previous audit results", "status": "pass", "note": "No major non-conformances"},
            {"item": "Applicant authority", "status": "pass", "note": "Department head approval on file"},
            {"item": "Expiry date validity", "status": "pass", "note": f"Valid through {c['expires_on']}"},
        ],
        "missing_documents": [],
    }
    ctx["agent_cert_ai_review_risk_score"] = c["risk_score"]

    insert_instance(wf_cur, iid, DEF_CERT, "certificate_management", 4, "completed", None,
                    ctx, c["entity_id"], op_id, op_email, ts(d+10), ts(d))

    for nid, ntype, nlabel, action, actor_id, actor_email, days_off in [
        ("start",          "start",      "Start",                        "entered",          None,    None,      d+10),
        ("request_cert",   "task",       "Request Certificate",          "signal:approved",  op_id,   op_email,  d+9),
        ("doc_upload",     "task",       "Upload Supporting Documents",  "signal:approved",  op_id,   op_email,  d+8),
        ("cert_ai_review", "agent_step", "AI Compliance Review",        "agent:completed",  None,    None,      d+8),
        ("risk_check",     "logic",      "Risk Level Check",            "logic:routed:false",None,   None,      d+8),
        ("qa_review",      "task",       "QA Manager Review",           "signal:approved",  qa_id,   qa_email,  d+4),
        ("review_gate",    "gateway",    "QA Decision",                 "signal:approved",  qa_id,   qa_email,  d+4),
        ("final_approve",  "esign",      "Certificate Approval (E-Sign)","signal:approved", adm_id,  adm_email, d+2),
        ("sn_register",    "integration","Register in ServiceNow",      "integration:completed",None, None,     d+2),
        ("end",            "end",        "Certificate Issued",          "completed",         None,    None,      d),
    ]:
        insert_hist(wf_cur, iid, nid, ntype, nlabel, action, actor_id, actor_email, {}, ts(days_off))

# ── Certificates running ──────────────────────────────────────────────────────
for c in CERTS_RUNNING:
    iid = uid()
    d = c["days_ago"]
    op_id, op_email = c["started_by"]
    ctx = {k: v for k, v in c.items() if k not in ("started_by","days_ago","entity_id","current_node")}

    node = c["current_node"]
    insert_instance(wf_cur, iid, DEF_CERT, "certificate_management", 4, "running", node,
                    ctx, c["entity_id"], op_id, op_email, ts(d), None)

    # History up to current node
    steps = ["start", "request_cert", "doc_upload", "cert_ai_review", "risk_check", "qa_review", "final_approve"]
    idx = steps.index(node) if node in steps else 1
    step_labels = {
        "start": ("start", "Start", "entered"),
        "request_cert": ("task", "Request Certificate", "signal:approved"),
        "doc_upload": ("task", "Upload Supporting Documents", "signal:approved"),
        "cert_ai_review": ("agent_step", "AI Compliance Review", "agent:completed"),
        "risk_check": ("logic", "Risk Level Check", "logic:routed:false"),
        "qa_review": ("task", "QA Manager Review", "entered"),
        "final_approve": ("esign", "Certificate Approval (E-Sign)", "entered"),
    }
    for i, sid in enumerate(steps[:idx+1]):
        ntype, nlabel, action = step_labels.get(sid, ("task", sid, "entered"))
        insert_hist(wf_cur, iid, sid, ntype, nlabel, action, op_id, op_email, {}, ts(d - i*0.5))

    # Open task at current node
    task_roles = {"doc_upload": "operator", "qa_review": "qa_manager", "final_approve": "admin"}
    role = task_roles.get(node, "operator")
    task_titles = {"doc_upload": "Upload Supporting Documents", "qa_review": "QA Manager Review", "final_approve": "Certificate Approval (E-Sign)"}
    title = task_titles.get(node, node.replace("_", " ").title())
    insert_task(tsk_cur, iid, node, title, "", role, "open", None, None, None,
                None, None, 24, ts(d), None, None)

# ── Certificates rejected ─────────────────────────────────────────────────────
for c in CERTS_REJECTED:
    iid = uid()
    d = c["days_ago"]
    op_id, op_email = c["started_by"]
    qa_id, qa_email = c["qa_by"]
    ctx = {k: v for k, v in c.items() if k not in ("started_by","qa_by","days_ago","entity_id")}

    insert_instance(wf_cur, iid, DEF_CERT, "certificate_management", 4, "completed", None,
                    ctx, c["entity_id"], op_id, op_email, ts(d+10), ts(d))
    for nid, ntype, nlabel, action, actor_id, actor_email, days_off in [
        ("start", "start", "Start", "entered", None, None, d+10),
        ("request_cert", "task", "Request Certificate", "signal:approved", op_id, op_email, d+9),
        ("doc_upload", "task", "Upload Supporting Documents", "signal:approved", op_id, op_email, d+8),
        ("cert_ai_review", "agent_step", "AI Compliance Review", "agent:completed", None, None, d+8),
        ("risk_check", "logic", "Risk Level Check", "logic:routed:false", None, None, d+8),
        ("qa_review", "task", "QA Manager Review", "signal:rejected", qa_id, qa_email, d+3),
        ("review_gate", "gateway", "QA Decision", "signal:rejected", qa_id, qa_email, d+3),
        ("rework", "task", "Address QA Comments", "signal:approved", op_id, op_email, d+1),
        ("qa_review", "task", "QA Manager Review", "signal:rejected", qa_id, qa_email, d),
        ("end", "end", "Certificate Issued", "completed", None, None, d),
    ]:
        insert_hist(wf_cur, iid, nid, ntype, nlabel, action, actor_id, actor_email, {}, ts(days_off))

# ── Material Requisitions completed ──────────────────────────────────────────
for m in MRS_COMPLETED:
    iid = uid()
    d = m["days_ago"]
    op_id, op_email = m["started_by"]
    qa_id, qa_email = m["qa_by"]
    adm_id, adm_email = m["admin_by"]
    ctx = {"project": m["project"], "materials": m["materials"], "total_cost": m["cost"]}

    insert_instance(wf_cur, iid, DEF_MR, "material_requisition", 1, "completed", None,
                    ctx, m["entity_id"], op_id, op_email, ts(d+15), ts(d))
    for nid, ntype, nlabel, action, actor_id, actor_email, days_off in [
        ("start",            "start",  "Start",                    "entered",         None,    None,     d+15),
        ("create_mr",        "task",   "Create Material Requisition","signal:approved",op_id,  op_email, d+13),
        ("review_mr",        "task",   "Review Material Requisition","signal:approved",qa_id,  qa_email, d+10),
        ("approve_gate",     "gateway","Approved?",                 "signal:approved", qa_id,  qa_email, d+10),
        ("cost_governance",  "task",   "Cost Governance Entry",     "signal:approved", op_id,  op_email, d+6),
        ("finance_approval", "esign",  "Finance Approval (E-Sign)", "signal:approved", adm_id, adm_email,d+3),
        ("release",          "task",   "Release Materials",         "signal:approved", op_id,  op_email, d+1),
        ("end",              "end",    "Complete",                  "completed",        None,   None,     d),
    ]:
        insert_hist(wf_cur, iid, nid, ntype, nlabel, action, actor_id, actor_email, {}, ts(days_off))

# ── Material Requisitions running ────────────────────────────────────────────
for m in MRS_RUNNING:
    iid = uid()
    d = m["days_ago"]
    op_id, op_email = m["started_by"]
    ctx = {"project": m["project"], "materials": m["materials"]}

    node = m["current_node"]
    insert_instance(wf_cur, iid, DEF_MR, "material_requisition", 1, "running", node,
                    ctx, m["entity_id"], op_id, op_email, ts(d), None)
    for nid, ntype, nlabel, action, actor_id, actor_email, days_off in [
        ("start",        "start", "Start",                      "entered",         None,   None,     d),
        ("create_mr",    "task",  "Create Material Requisition", "signal:approved", op_id, op_email, d - 0.5),
    ]:
        insert_hist(wf_cur, iid, nid, ntype, nlabel, action, actor_id, actor_email, {}, ts(days_off))

    task_titles = {"review_mr": "Review Material Requisition", "cost_governance": "Cost Governance Entry"}
    task_roles = {"review_mr": "qa_manager", "cost_governance": "operator"}
    insert_task(tsk_cur, iid, node, task_titles.get(node, node), "", task_roles.get(node, "operator"),
                "open", None, None, None, None, None, 24, ts(d), None, None)

# ── Deviations completed ──────────────────────────────────────────────────────
for dv in DEVS_COMPLETED:
    iid = uid()
    d = dv["days_ago"]
    op_id, op_email = dv["started_by"]
    adm_id, adm_email = dv["admin_by"]
    ctx = {k: v for k, v in dv.items() if k not in ("started_by","admin_by","days_ago","entity_id","current_node")}

    insert_instance(wf_cur, iid, DEF_DEV, "deviation_capa", 3, "completed", None,
                    ctx, dv["entity_id"], op_id, op_email, ts(d+20), ts(d))
    for nid, ntype, nlabel, action, actor_id, actor_email, days_off in [
        ("start",       "start",      "Start",                    "entered",          None,    None,     d+20),
        ("detect",      "task",       "Detect & Report Deviation","signal:approved",   op_id,  op_email, d+19),
        ("agent_triage","agent_step", "AI Deviation Triage",      "agent:completed",   None,   None,     d+18),
        ("human_review","task",       "QA Review AI Proposal",    "signal:approved",   op_id,  op_email, d+15),
        ("rca",         "agent_step", "AI RCA Drafting",          "agent:completed",   None,   None,     d+14),
        ("rca_review",  "task",       "Approve RCA",              "signal:approved",   op_id,  op_email, d+10),
        ("capa",        "agent_step", "AI CAPA Suggestion",       "agent:completed",   None,   None,     d+9),
        ("capa_review", "task",       "Approve CAPA Plan",        "signal:approved",   op_id,  op_email, d+5),
        ("capa_esign",  "esign",      "CAPA E-Sign",              "signal:approved",   adm_id, adm_email,d+3),
        ("implement",   "task",       "Implement CAPA",           "signal:approved",   op_id,  op_email, d+2),
        ("verify",      "task",       "Verify Effectiveness",     "signal:approved",   op_id,  op_email, d+1),
        ("end",         "end",        "Closed",                   "completed",          None,  None,     d),
    ]:
        insert_hist(wf_cur, iid, nid, ntype, nlabel, action, actor_id, actor_email, {}, ts(days_off))

# ── Deviations running ────────────────────────────────────────────────────────
for dv in DEVS_RUNNING:
    iid = uid()
    d = dv["days_ago"]
    op_id, op_email = dv["started_by"]
    ctx = {k: v for k, v in dv.items() if k not in ("started_by","days_ago","entity_id","current_node")}
    node = dv["current_node"]

    insert_instance(wf_cur, iid, DEF_DEV, "deviation_capa", 3, "running", node,
                    ctx, dv["entity_id"], op_id, op_email, ts(d+3), None)
    step_seq = ["start","detect","agent_triage","human_review","rca","rca_review","capa","capa_review"]
    step_labels = {
        "start": ("start","Start","entered"),
        "detect": ("task","Detect & Report Deviation","signal:approved"),
        "agent_triage": ("agent_step","AI Deviation Triage","agent:completed"),
        "human_review": ("task","QA Review AI Proposal","entered"),
        "rca": ("agent_step","AI RCA Drafting","agent:completed"),
        "rca_review": ("task","Approve RCA","entered"),
        "capa": ("agent_step","AI CAPA Suggestion","agent:completed"),
        "capa_review": ("task","Approve CAPA Plan","entered"),
    }
    idx = step_seq.index(node) if node in step_seq else 2
    for i, sid in enumerate(step_seq[:idx+1]):
        ntype, nlabel, action = step_labels.get(sid, ("task", sid, "entered"))
        insert_hist(wf_cur, iid, sid, ntype, nlabel, action, op_id, op_email, {}, ts(d+3 - i*0.3))

    task_roles = {"human_review": "qa_manager", "rca_review": "qa_manager", "capa_review": "qa_manager"}
    task_titles_map = {"human_review": "QA Review AI Proposal", "rca_review": "Approve RCA", "capa_review": "Approve CAPA Plan"}
    insert_task(tsk_cur, iid, node, task_titles_map.get(node, node), "", task_roles.get(node, "qa_manager"),
                "open", None, None, None, None, None, 48, ts(d), None, None)

wf_conn.commit()
tsk_conn.commit()
wf_conn.close()
tsk_conn.close()

print("Demo data seeded:")
print(f"  Certificates: {len(CERTS_COMPLETED)} completed, {len(CERTS_RUNNING)} running, {len(CERTS_REJECTED)} rejected")
print(f"  Material Requisitions: {len(MRS_COMPLETED)} completed, {len(MRS_RUNNING)} running")
print(f"  Deviations: {len(DEVS_COMPLETED)} completed, {len(DEVS_RUNNING)} running")
