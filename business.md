# MGP — Manufacturing Governance Platform
### Business Summary

---

## 1. Purpose & Problem Solved

MGP replaces a legacy Appian-based workflow system with a purpose-built Manufacturing Governance Platform. It digitises and enforces the end-to-end governance processes that regulated manufacturers must follow — certificate management, material approvals, and deviation handling — ensuring every action is traceable, role-controlled, and compliant with GxP and 21 CFR Part 11.

---

## 2. Who Uses It and What They Do

Three roles interact with the platform daily. **Operators** submit work requests (certificate applications, material requisitions, document uploads) and act on tasks assigned to them. **QA Managers** review, approve, or reject submissions, apply electronic signatures, and oversee compliance checklists. **Administrators** configure workflows, manage users, query platform data, and monitor AI agent activity. Each role sees only the tasks and data relevant to their function.

---

## 3. Certificate Management Workflow

When a product or process requires certification (e.g. ISO 9001, GMP), an Operator raises a certificate request by filling a structured form — capturing certificate type, applicant details, scope, and target date. The request is routed automatically through document upload, AI compliance review, risk-based escalation, QA sign-off, and a legally binding electronic signature before the certificate is registered in the system. No certificate reaches completion without clearing every gate.

---

## 4. AI-Powered Compliance Review

At the heart of the certificate workflow sits an AI compliance agent. It reads the submitted certificate data and supporting documents, then returns a structured risk score (1–10), a checklist of pass/fail/review items against GxP criteria, a list of missing documents, and a recommendation (approve / reject / request more info). High-risk submissions (score > 7) are automatically escalated to an administrator before QA review. This removes manual triage effort and provides a consistent, auditable AI opinion on every certificate.

---

## 5. Material Requisition Process

Operators raise Material Requisition (MR) requests to procure goods or materials. Each MR flows through a multi-step approval chain: department review, cost governance check, and a finance electronic signature before release. Gateway nodes enforce the decision path — rejected MRs are closed with a recorded reason; approved MRs proceed to release automatically. Finance approvals are captured as tamper-evident e-signatures, satisfying procurement audit requirements.

---

## 6. Deviation & CAPA Management

When a manufacturing deviation occurs, it enters a structured investigation workflow driven by three AI agents operating in sequence. A **Triage agent** classifies the deviation by severity and regulatory impact. An **RCA agent** drafts a Root Cause Analysis narrative using 5-Why methodology. A **CAPA agent** generates Corrective and Preventive Actions mapped to specific regulatory citations (ICH Q10, 21 CFR 211). Human reviewers validate each AI output before the record is closed, combining speed with human accountability.

---

## 7. Role-Based Task Queue

All human steps across every workflow surface as tasks in a personalised inbox. The platform filters each user's queue strictly by role — operators never see QA tasks, and vice versa. Tasks display the relevant context (certificate details, deviation description, form to complete) so the assignee has everything needed without navigating elsewhere. Tasks auto-refresh every 8 seconds. Overdue tasks are surfaced in dashboards for management visibility.

---

## 8. Electronic Signatures & Regulatory Compliance

Every critical approval — finance sign-off on a material requisition, final QA sign-off on a certificate — captures a legally binding electronic signature compliant with 21 CFR Part 11. The signer must re-authenticate, declare a meaning (e.g. "I approve this certificate"), and state a reason. The signature is stored with a document hash, timestamp, and signer identity — making it non-repudiable and audit-ready without paper.

---

## 9. Immutable Audit Trail

Every action in the platform — login, task claim, form submission, AI agent invocation, approval, signature — is written to an append-only audit log. Each event is hash-chained to its predecessor (SHA-256), so any tampering with a historical record is mathematically detectable. The audit log is searchable by actor, entity, event type, and time range, giving compliance officers and auditors a complete, tamper-evident history of every governance decision.

---

## 10. Dashboards, Reporting & Data Intelligence

Managers and executives have real-time visibility through a live dashboard: open vs. completed task counts, certificate approval rates, active workflow instances, deviation counts by status, and financial cost tracking across material requisitions. A three-tab reports module provides macro cost governance analysis, deep-dive breakdowns by customer and project, and a compliance & governance view showing certification trends and open deviation ageing. For ad-hoc queries, an AI-powered DB Query Agent lets administrators ask questions in plain English — "Which deviations are still in progress?" — and receive live SQL results with a natural-language explanation.

---

*Platform: Python / FastAPI microservices · React 18 UI · SpiffWorkflow BPMN engine · GxP / 21 CFR Part 11*
