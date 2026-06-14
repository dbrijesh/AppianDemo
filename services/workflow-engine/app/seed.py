"""Seed the built-in governance workflow templates."""
import asyncio
import json
from .database import SessionFactory
from .schemas import DefinitionCreate, WorkflowGraph
from . import service

MATERIAL_REQUISITION = {
    "nodes": [
        {"id": "start", "type": "start", "label": "Start", "config": {}, "position": {"x": 100, "y": 200}},
        {"id": "create_mr", "type": "task", "label": "Create Material Requisition", "config": {"role": "operator", "description": "Operator creates material requisition for a production project.", "sla_hours": 8, "form_schema": {"type": "object", "properties": {"project_id": {"type": "string", "title": "Project ID"}, "customer_name": {"type": "string", "title": "Customer Name"}, "materials": {"type": "array", "title": "Materials"}}}}, "position": {"x": 300, "y": 200}},
        {"id": "review_mr", "type": "task", "label": "Review Material Requisition", "config": {"role": "qa_manager", "description": "QA Manager reviews and approves or rejects the requisition.", "sla_hours": 24}, "position": {"x": 550, "y": 200}},
        {"id": "approve_gate", "type": "gateway", "label": "Approved?", "config": {}, "position": {"x": 800, "y": 200}},
        {"id": "cost_governance", "type": "task", "label": "Cost Governance Entry", "config": {"role": "operator", "description": "Record labor, material, and overhead costs.", "sla_hours": 16}, "position": {"x": 1050, "y": 100}},
        {"id": "finance_approval", "type": "esign", "label": "Finance Approval (E-Sign)", "config": {"role": "admin", "meaning": "I approve the cost governance record", "sla_hours": 24}, "position": {"x": 1300, "y": 100}},
        {"id": "rejected_task", "type": "task", "label": "Revise Requisition", "config": {"role": "operator", "description": "Revise and resubmit the requisition.", "sla_hours": 8}, "position": {"x": 1050, "y": 300}},
        {"id": "release", "type": "task", "label": "Release Materials", "config": {"role": "operator", "description": "Release approved materials from inventory.", "sla_hours": 4}, "position": {"x": 1550, "y": 100}},
        {"id": "end", "type": "end", "label": "Complete", "config": {}, "position": {"x": 1800, "y": 200}},
    ],
    "edges": [
        {"id": "e1", "source": "start", "target": "create_mr"},
        {"id": "e2", "source": "create_mr", "target": "review_mr"},
        {"id": "e3", "source": "review_mr", "target": "approve_gate"},
        {"id": "e4", "source": "approve_gate", "target": "cost_governance", "label": "Approved", "condition": "approved"},
        {"id": "e5", "source": "approve_gate", "target": "rejected_task", "label": "Rejected", "condition": "rejected"},
        {"id": "e6", "source": "rejected_task", "target": "review_mr"},
        {"id": "e7", "source": "cost_governance", "target": "finance_approval"},
        {"id": "e8", "source": "finance_approval", "target": "release", "condition": "approved"},
        {"id": "e9", "source": "release", "target": "end"},
    ],
}

CERTIFICATE_MANAGEMENT = {
    "nodes": [
        {"id": "start", "type": "start", "label": "Start", "config": {}, "position": {"x": 100, "y": 200}},
        {
            "id": "request_cert",
            "type": "task",
            "label": "Request Certificate",
            "config": {
                "role": "operator",
                "description": "Submit a new certificate request with details about the certificate type, applicant, and scope.",
                "sla_hours": 8,
                "form_schema": {
                    "type": "object",
                    "required": ["cert_type", "applicant_name", "scope_description"],
                    "properties": {
                        "cert_type": {
                            "type": "string",
                            "title": "Certificate Type",
                            "enum": ["ISO 9001", "ISO 13485", "GMP", "FDA 510k", "CE Mark", "Other"]
                        },
                        "applicant_name": {"type": "string", "title": "Applicant Name"},
                        "applicant_department": {"type": "string", "title": "Department"},
                        "scope_description": {"type": "string", "title": "Scope / Purpose", "format": "textarea"},
                        "target_date": {"type": "string", "title": "Target Completion Date", "format": "date"}
                    }
                }
            },
            "position": {"x": 300, "y": 200}
        },
        {
            "id": "doc_upload",
            "type": "task",
            "label": "Upload Supporting Documents",
            "config": {
                "role": "operator",
                "description": "Upload all required supporting documents for the certificate request.",
                "sla_hours": 24,
                "form_schema": {
                    "type": "object",
                    "properties": {
                        "documents_uploaded": {
                            "type": "array",
                            "title": "Upload Supporting Documents",
                            "format": "file-upload",
                            "description": "Upload all supporting documents for the certificate request"
                        },
                        "document_notes": {"type": "string", "title": "Notes", "format": "textarea"}
                    }
                }
            },
            "position": {"x": 550, "y": 200}
        },
        {
            "id": "cert_ai_review",
            "type": "agent_step",
            "label": "AI Compliance Review",
            "config": {
                "agent_type": "cert_review",
                "description": "AI analyses the certificate request and documents, producing a compliance checklist and risk assessment for the QA manager."
            },
            "position": {"x": 800, "y": 200}
        },
        {
            "id": "qa_review",
            "type": "task",
            "label": "QA Manager Review",
            "config": {
                "role": "qa_manager",
                "description": "Review the AI compliance assessment and supporting documents. Check agent_cert_ai_review in the workflow context for the AI recommendation, risk score, and compliance checklist.",
                "sla_hours": 48,
                "form_schema": {
                    "type": "object",
                    "properties": {
                        "qa_comments": {"type": "string", "title": "QA Comments", "format": "textarea"},
                        "ai_recommendation_accepted": {"type": "boolean", "title": "Accept AI Recommendation?"}
                    }
                }
            },
            "position": {"x": 1050, "y": 200}
        },
        {"id": "review_gate", "type": "gateway", "label": "QA Decision", "config": {}, "position": {"x": 1300, "y": 200}},
        {
            "id": "final_approve",
            "type": "esign",
            "label": "Certificate Approval (E-Sign)",
            "config": {"role": "admin", "meaning": "I certify this certificate request has been reviewed and is approved for issuance", "sla_hours": 24},
            "position": {"x": 1550, "y": 100}
        },
        {
            "id": "rework",
            "type": "task",
            "label": "Address QA Comments",
            "config": {"role": "operator", "description": "Address the QA manager's comments and resubmit.", "sla_hours": 24},
            "position": {"x": 1550, "y": 300}
        },
        {
            "id": "risk_check",
            "type": "logic",
            "label": "Risk Level Check",
            "config": {
                "expression": "agent_cert_ai_review_risk_score > 7",
                "description": "Auto-routes based on AI risk score: high risk (>7) → escalated review; low risk → standard QA review.",
                "true_label": "High Risk",
                "false_label": "Normal"
            },
            "position": {"x": 1050, "y": 200}
        },
        {
            "id": "escalated_review",
            "type": "task",
            "label": "Escalated QA Review",
            "config": {
                "role": "admin",
                "description": "AI risk score exceeds threshold (>7). Admin review required before proceeding.",
                "sla_hours": 24,
                "form_schema": {
                    "type": "object",
                    "properties": {
                        "escalation_notes": {"type": "string", "title": "Escalation Notes", "format": "textarea"},
                        "override_approved": {"type": "boolean", "title": "Override: Approve despite high risk?"}
                    }
                }
            },
            "position": {"x": 1300, "y": 50}
        },
        {
            "id": "sn_register",
            "type": "integration",
            "label": "Register in ServiceNow",
            "config": {
                "url": "https://mock-servicenow.mgp.internal/api/now/table/u_certificates",
                "method": "POST",
                "body_template": {
                    "u_cert_type": "{{cert_type}}",
                    "u_applicant": "{{applicant_name}}",
                    "u_department": "{{applicant_department}}",
                    "u_status": "approved",
                    "u_workflow_id": "{{workflow_instance_id}}"
                },
                "output_key": "servicenow_record",
                "timeout_seconds": 10,
                "description": "Creates a ServiceNow record to track the approved certificate in ITSM."
            },
            "position": {"x": 1800, "y": 100}
        },
        {"id": "end", "type": "end", "label": "Certificate Issued", "config": {}, "position": {"x": 2050, "y": 200}},
    ],
    "edges": [
        {"id": "e1", "source": "start", "target": "request_cert"},
        {"id": "e2", "source": "request_cert", "target": "doc_upload"},
        {"id": "e3", "source": "doc_upload", "target": "cert_ai_review"},
        {"id": "e4", "source": "cert_ai_review", "target": "risk_check"},
        {"id": "e4b", "source": "risk_check", "target": "escalated_review", "label": "High Risk", "condition": "true"},
        {"id": "e4c", "source": "risk_check", "target": "qa_review", "label": "Normal", "condition": "false"},
        {"id": "e4d", "source": "escalated_review", "target": "review_gate", "condition": "approved"},
        {"id": "e5", "source": "qa_review", "target": "review_gate"},
        {"id": "e6", "source": "review_gate", "target": "final_approve", "label": "Approved", "condition": "approved"},
        {"id": "e7", "source": "review_gate", "target": "rework", "label": "Rejected", "condition": "rejected"},
        {"id": "e8", "source": "rework", "target": "qa_review"},
        {"id": "e9", "source": "final_approve", "target": "sn_register", "condition": "approved"},
        {"id": "e10", "source": "sn_register", "target": "end"},
    ],
}

DEVIATION_CAPA = {
    "nodes": [
        {"id": "start", "type": "start", "label": "Start", "config": {}, "position": {"x": 100, "y": 200}},
        {"id": "detect", "type": "task", "label": "Detect & Report Deviation", "config": {"role": "operator", "sla_hours": 4}, "position": {"x": 300, "y": 200}},
        {"id": "agent_triage", "type": "agent_step", "label": "AI Deviation Triage", "config": {"agent_type": "deviation_triage", "description": "AI proposes severity, root cause candidates, and initial CAPA suggestions."}, "position": {"x": 550, "y": 200}},
        {"id": "human_review", "type": "task", "label": "QA Review AI Proposal", "config": {"role": "qa_manager", "description": "Review and accept/modify AI triage proposal.", "sla_hours": 24}, "position": {"x": 800, "y": 200}},
        {"id": "rca", "type": "agent_step", "label": "AI RCA Drafting", "config": {"agent_type": "rca_drafting"}, "position": {"x": 1050, "y": 200}},
        {"id": "rca_review", "type": "task", "label": "Approve RCA", "config": {"role": "qa_manager", "sla_hours": 48}, "position": {"x": 1300, "y": 200}},
        {"id": "capa", "type": "agent_step", "label": "AI CAPA Suggestion", "config": {"agent_type": "capa_suggestion"}, "position": {"x": 1550, "y": 200}},
        {"id": "capa_review", "type": "task", "label": "Approve CAPA Plan", "config": {"role": "qa_manager", "sla_hours": 72}, "position": {"x": 1800, "y": 200}},
        {"id": "capa_esign", "type": "esign", "label": "CAPA E-Sign", "config": {"role": "admin", "meaning": "I approve this CAPA plan for implementation"}, "position": {"x": 2050, "y": 200}},
        {"id": "implement", "type": "task", "label": "Implement CAPA", "config": {"role": "operator", "sla_hours": 168}, "position": {"x": 2300, "y": 200}},
        {"id": "verify", "type": "task", "label": "Verify Effectiveness", "config": {"role": "qa_manager", "sla_hours": 720}, "position": {"x": 2550, "y": 200}},
        {"id": "end", "type": "end", "label": "Closed", "config": {}, "position": {"x": 2800, "y": 200}},
    ],
    "edges": [
        {"id": "e1", "source": "start", "target": "detect"},
        {"id": "e2", "source": "detect", "target": "agent_triage"},
        {"id": "e3", "source": "agent_triage", "target": "human_review"},
        {"id": "e4", "source": "human_review", "target": "rca", "condition": "approved"},
        {"id": "e5", "source": "rca", "target": "rca_review"},
        {"id": "e6", "source": "rca_review", "target": "capa", "condition": "approved"},
        {"id": "e7", "source": "capa", "target": "capa_review"},
        {"id": "e8", "source": "capa_review", "target": "capa_esign", "condition": "approved"},
        {"id": "e9", "source": "capa_esign", "target": "implement", "condition": "approved"},
        {"id": "e10", "source": "implement", "target": "verify"},
        {"id": "e11", "source": "verify", "target": "end", "condition": "approved"},
    ],
}

TEMPLATES = [
    ("Material Requisition", "material_requisition", "End-to-end material requisition with cost governance and finance approval", MATERIAL_REQUISITION),
    ("Certificate Management", "certificate_management", "Regulatory and non-regulatory certificate lifecycle management", CERTIFICATE_MANAGEMENT),
    ("Deviation & CAPA", "deviation_capa", "AI-assisted deviation triage, RCA drafting, and CAPA management", DEVIATION_CAPA),
]


async def _graph_fingerprint(graph: dict) -> str:
    """Fingerprint the graph by node IDs + key config fields (expression, url)."""
    import hashlib, json
    summary = []
    for n in sorted(graph.get("nodes", []), key=lambda x: x["id"]):
        cfg = n.get("config", {})
        summary.append({
            "id": n["id"], "type": n["type"],
            "expr": cfg.get("expression"), "url": cfg.get("url"),
            "agent": cfg.get("agent_type"),
        })
    return hashlib.md5(json.dumps(summary, sort_keys=True).encode()).hexdigest()


async def seed():
    async with SessionFactory() as db:
        for name, slug, desc, graph in TEMPLATES:
            existing = await service.get_active_definition_by_slug(db, slug)
            if existing:
                expected_fp = await _graph_fingerprint(graph)
                current_fp = await _graph_fingerprint(existing.graph_dict)
                if expected_fp == current_fp:
                    continue  # already up to date
            await service.create_definition(
                db,
                DefinitionCreate(
                    name=name,
                    slug=slug,
                    description=desc,
                    graph=WorkflowGraph(**graph),
                ),
                "system",
            )
        await db.commit()
    print("Workflow templates seeded.")


if __name__ == "__main__":
    asyncio.run(seed())
