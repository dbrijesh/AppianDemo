# Appian → MGP Migration Guide
### Parity Mapping · Migration Roadmap · Reusable Components

---

## Part 1 — Appian Capability Parity Mapping

> Every Appian construct has a direct MGP equivalent. Column "Fidelity" rates parity: **Full** (feature-complete drop-in), **Extended** (MGP exceeds Appian), **Partial** (manual completion needed), **Roadmap** (not yet built).

| Appian Capability | Appian Construct | MGP Equivalent | Layer | Fidelity | Notes |
|---|---|---|---|---|---|
| **Process Orchestration** | Process Model | Workflow Definition (`graph_json` + SpiffWorkflow BPMN 2.0) | workflow-engine | Full | Visual designer built-in; 9 node types |
| **Human Tasks** | Process Task / Attended Task | Task Service + Task inbox (`/tasks`) | task-service | Full | Role-filtered queue, claim/complete, JSON Schema form render |
| **Forms (SAIL)** | SAIL Interface / Form | `SchemaForm` React component + `form_schema` JSON Schema | UI + task-service | Full | Dynamic field types: text, number, boolean, date, dropdown, textarea |
| **Records** | Appian Record Type | FastAPI router + SQLAlchemy model + PostgreSQL table | per-service | Full | One endpoint set per entity; Pydantic schema enforces shape |
| **Reports / Grids** | Appian Report | Reports.tsx (3-tab: Cost Governance, Deep Dive, Compliance) | UI | Extended | Live data from APIs; Recharts visualisations; filterable tables |
| **Dashboards** | Tempo Dashboard / Site Page | Dashboard.tsx: KPI cards, activity feed, charts | UI | Extended | Real-time data; role-aware KPIs |
| **Sites / Navigation** | Appian Site | React SPA shell (`AppShell.tsx`) + React Router v6 | UI | Full | Role-based nav; responsive |
| **Actions (Start Process)** | Action | `POST /v1/instances` with initial context payload | workflow-engine | Full | Triggered from UI modals or API; context seeded into first task |
| **Decision Tables / Branching** | XOR Gateway / Decision | `gateway` node (signal-based) + `logic` node (Python expression) | workflow-engine | Extended | `logic` node evaluates arbitrary Python (`risk_score > 7`) |
| **Smart Services (AI)** | Appian AI Skill | `agent_step` node → agent-service (LangChain / LangGraph / DeepAgents) | agent-service | Extended | Real LLM calls; stateful graphs; multi-agent teams; episodic memory |
| **Integration Objects** | Connected System + Integration | `integration` node with `{{var}}` body templates + httpx | workflow-engine | Full | Configurable endpoint, method, headers, body; result stored in context |
| **Document Management** | Document Store / Folders | MinIO S3-compatible object storage + presigned URLs | MinIO | Full | Bucket-per-workflow-type; versioning; lifecycle archival |
| **Expression Rules** | Expression Rule | Python utility functions in `mgp_shared` / LangChain chains | py-shared | Full | Testable, version-controlled Python |
| **Constants** | Appian Constant | `pydantic-settings` env vars per service (`.env.local` / `.env.production`) | per-service | Full | Type-safe; environment-overridable |
| **Data Types** | Appian Data Type (CDT) | Pydantic v2 model (`schemas.py` per service) | per-service | Full | Full validation, serialisation, field-level validators |
| **Groups / Teams** | Appian Group | Roles array on User model; RBAC in identity-svc | identity-svc | Full | Role: admin / qa_manager / operator; extensible |
| **Security / Permissions** | Appian Security Model | JWT + RBAC + NetworkPolicy + Vault + OPA | identity + infra | Extended | Zero-trust; mTLS between services; per-role task filtering |
| **Tempo Mobile** | Tempo Interface | React responsive UI (mobile-ready CSS, viewport meta) | UI | Partial | Not a native app; PWA enhancement is roadmap item |
| **Web APIs** | Web API Object | FastAPI router with OpenAPI 3.0 auto-docs (`/docs`) | per-service | Extended | AsyncAPI; automatic validation; JWT middleware |
| **Plug-ins / Custom APIs** | Appian Plug-in | FastAPI middleware, custom adapters, py-shared library | py-shared + service | Full | Shared lib pattern replaces plug-in registry |
| **Process Reports** | Process Report | Audit Log (`/admin/audit`) + Elasticsearch full-text + Kibana | audit-core + ES | Extended | Hash-chained; tamper-evident; searchable by actor/entity/time |
| **Alerts / Notifications** | Send Email / Alert Smart Service | Redis Pub/Sub → SSE endpoint → browser notification | task-service + Redis | Partial | In-app real-time; email adapter is roadmap item |
| **Portals** | Appian Portal (public forms) | Public React route with anon JWT scope | UI + identity-svc | Roadmap | Architecture supports it; not yet implemented |
| **Query Rules** | Query Rule | SQLAlchemy async queries + TanStack Query (client-side) | per-service + UI | Full | Server-side filtering, pagination, sorting |
| **Electronic Signatures** | e-Signature Smart Service | eSign service + 21 CFR Part 11 compliant esign node | esign-svc | Extended | Re-auth + meaning + document hash; PKCS#7 envelope |
| **Audit History** | Appian Audit Logs | Audit Core: SHA-256 hash-chained append-only event log | audit-core | Extended | Cryptographically tamper-evident; stream to Elasticsearch |
| **Versioning (Processes)** | Deployed vs Published versions | `WorkflowDefinition.version` + deactivate-on-publish pattern | workflow-engine | Full | New instances always use latest active version; running use snapshot |
| **Robotic Process Automation** | Appian RPA | `integration` node (REST call) + `agent_step` node (AI-driven action) | workflow-engine | Extended | LLM-driven agents replace rule-based RPA scripts |
| **Database-backed Records** | Record with Data Sync | PostgreSQL table + SQLAlchemy model + API endpoint | per-service | Full | No proprietary sync layer; direct async SQL |
| **Tempo Quick Actions** | Quick Action | Dashboard action cards + Certificates/MR create modals | UI | Full | One-click workflow start from dashboard |
| **AppMarket / Marketplace** | AppMarket Package | Agent Pipeline library (Agent Builder); GitHub repo | agent-service + git | Extended | Visual pipeline editor; shareable via git |
| **Low-code Builder** | Appian Designer | Workflow Designer (visual BPMN editor) + Agent Builder (pipeline editor) | UI | Extended | Both visual editors built into the platform |

---

## Part 2 — Agentic Migration Roadmap

> This roadmap assumes you will deploy **code comprehension agents** (LangGraph graphs running against Appian export packages) to automate 60–80% of the migration work. Each phase is tagged with the primary agent type used.

---

### Phase 0 — Foundation (Weeks 1–2)

**Goal:** Production-ready MGP platform running; migration tooling scaffolded.

| Step | Action | Agent Role |
|---|---|---|
| 0.1 | Deploy MGP platform to K8s (staging + prod namespaces) | Human — infrastructure |
| 0.2 | Verify all 7 services healthy; seed demo data | Human — smoke test |
| 0.3 | Create `migration/` directory in repo: agent configs, prompt templates, output schemas | Human |
| 0.4 | Stand up **Migration Orchestrator** LangGraph graph with PostgresSaver checkpoint | Agentic engineering setup |
| 0.5 | Configure Appian export pipeline: export Process Models, SAIL forms, Records, Reports as XML/JSON packages | Human — Appian admin |

**Deliverable:** MGP running; migration agent harness ready.

---

### Phase 1 — Discovery & Inventory Agent (Weeks 2–3)

**Goal:** Full automated inventory of every Appian artefact.

**Agent: `AppianInventoryAgent` (LangChain ReAct + file tools)**

```
Input:  Appian application export package (XML / JSON files)
Output: inventory.json — structured manifest of all artefacts
```

| Artefact Scanned | What the Agent Extracts | Output Schema |
|---|---|---|
| Process Models | Name, nodes, edges, roles, form references, integration calls, expression rules | `ProcessModelManifest` |
| SAIL Interfaces / Forms | Field names, types, validation rules, display conditions, linked Record types | `FormManifest` |
| Record Types | Entity name, fields, relationships, views, security | `RecordManifest` |
| Expression Rules | Rule name, inputs, outputs, logic body | `ExpressionRuleManifest` |
| Integration Objects | Endpoint, method, auth type, request/response schema | `IntegrationManifest` |
| Groups | Group name, members, referenced in which process roles | `GroupManifest` |
| Reports | Columns, filters, data source, linked record | `ReportManifest` |
| Constants | Name, data type, value | `ConstantManifest` |

**Agentic loop:**
```
for each export file:
  → parse_structure_tool(file)        # LangChain tool: XML/JSON parser
  → classify_artefact_tool(parsed)    # classifies by Appian type
  → extract_metadata_tool(classified) # fills manifest schema
  → write_to_inventory_tool(entry)    # appends to inventory.json
```

**Human checkpoint:** Review `inventory.json`; mark any artefacts as **exclude** (deprecated flows), **priority** (business-critical), or **defer**.

---

### Phase 2 — Data Model Migration Agent (Weeks 3–4)

**Goal:** All Appian Record Types and Data Types become PostgreSQL tables + Pydantic schemas.

**Agent: `SchemaGeneratorAgent` (LangGraph, 4 nodes)**

```
AppianRecordManifest → [analyse_fields] → [map_types] → [generate_pydantic] → [generate_alembic] → Output
```

| Appian Concept | Agent Translation | MGP Output |
|---|---|---|
| Record Type | PostgreSQL table | `models.py` SQLAlchemy model |
| CDT (Complex Data Type) | Pydantic v2 BaseModel | `schemas.py` with field validators |
| Record field `Text` | `VARCHAR` / `TEXT` | `str` |
| Record field `Number (Integer)` | `INTEGER` | `int` |
| Record field `Number (Decimal)` | `NUMERIC(10,4)` | `Decimal` |
| Record field `Date/Time` | `TIMESTAMPTZ` | `datetime` |
| Record field `Boolean` | `BOOLEAN` | `bool` |
| Record field `Document` | FK to MinIO path `VARCHAR` | `str` (presigned URL on read) |
| Record relationship (1:N) | FK + backref | SQLAlchemy `relationship()` |
| Record security groups | Row-level security hint | comment in model; enforce in router |

**Output per Record Type:**
- `services/{workload}/app/models.py` — SQLAlchemy ORM class
- `services/{workload}/app/schemas.py` — Pydantic In/Out schemas
- `services/{workload}/alembic/versions/{n}_migrate_from_appian.py` — migration script

**Human checkpoint:** Review generated schemas; add domain-specific validators; confirm FK relationships.

---

### Phase 3 — Process Model Translation Agent (Weeks 4–6)

**Goal:** Every Appian Process Model becomes an MGP Workflow Definition JSON.

**Agent: `ProcessTranslatorAgent` (LangGraph, stateful, human-in-the-loop)**

```
ProcessModelManifest → [map_nodes] → [map_edges] → [map_forms] → [human_review interrupt]
                     → [generate_graph_json] → [validate_graph] → POST /v1/definitions
```

| Appian Node Type | MGP Node Type | Translation Notes |
|---|---|---|
| Start Event | `start` | Direct map |
| End Event | `end` | Direct map |
| User Input Task | `task` | Role mapped from Appian Group; form_schema generated from SAIL form |
| Script Task (expression) | `logic` | Python expression generated from Appian expression rule |
| XOR Gateway (approval) | `gateway` | `approved` / `rejected` signal edges |
| XOR Gateway (condition) | `logic` + `gateway` | Expression evaluated; routes true/false |
| Smart Service (AI) | `agent_step` | Agent type inferred from Smart Service name |
| Smart Service (e-Sign) | `esign` | Maps to esign-svc |
| Web Service Call | `integration` | Endpoint + body template extracted |
| Email Alert | `integration` (webhook) | Webhook call to notification service |
| Subprocess | Nested `workflow_instances` | Starts child instance; parent waits on signal |
| Timer Event | `timer` | Delay duration extracted from Appian config |

**Form Schema Generation (SAIL → JSON Schema):**
```
AppianSAILField → agent maps to JSON Schema field type:
  TextField       → {"type": "string"}
  IntegerField    → {"type": "integer"}
  DateField       → {"type": "string", "format": "date"}
  DropdownField   → {"type": "string", "enum": [...values...]}
  CheckboxField   → {"type": "boolean"}
  FileUploadField → {"type": "string", "format": "uri"} + MinIO upload hook
  ParagraphField  → {"type": "string", "x-multiline": true}
```

**Output:** Published workflow definition via `POST /v1/definitions` — immediately runnable.

**Human checkpoint:** Run each translated workflow in staging with real users; log gaps; agent generates patch definitions.

---

### Phase 4 — UI & Interface Migration Agent (Weeks 6–9)

**Goal:** Appian SAIL read-only interfaces and sites become React pages.

**Agent: `UIGeneratorAgent` (LangChain + code generation)**

```
FormManifest + ReportManifest → [analyse_layout] → [select_component] → [generate_tsx] → [generate_css] → Output
```

| Appian UI Construct | MGP React Output | Template Used |
|---|---|---|
| SAIL Form (task form) | Rendered automatically by `SchemaForm` component | No generation needed — JSON Schema drives render |
| SAIL Read-only Interface (record view) | `{Entity}Detail.tsx` — fetches from API, displays fields | Generated from RecordManifest |
| SAIL Grid / Report | Table component with `useQuery` + pagination | Generated from ReportManifest column list |
| Appian Site Page | New route in `App.tsx` + page component file | Agent adds route + sidebar nav entry |
| Record Action Button | Modal trigger → `POST /v1/instances` with context | Agent generates `StartWorkflowModal.tsx` |
| Appian Dashboard | KPI cards wired to new API endpoints | Agent generates new card in `Dashboard.tsx` |
| Tempo Quick Action | Dashboard action card | Agent adds card with workflow name + icon |

**Agent code-generation pattern:**
```python
# Agent prompt template for each page
SYSTEM = """You are a React 18 TypeScript code generator.
Given an Appian interface manifest, generate a React page component using:
- TanStack Query v5 for data fetching
- The existing design-system (Button, Badge, Modal from ../../design-system)
- Lucide icons
- CSS modules matching the existing pattern in nearby .css files
Return ONLY the TSX file content. No explanation."""
```

**Human checkpoint:** Visual review in browser; agent patches based on feedback (second loop).

---

### Phase 5 — Integration & Connectivity Migration (Weeks 8–10)

**Goal:** All Appian Connected Systems and Integration Objects re-implemented as MGP integration nodes or service adapters.

| Appian Connected System Type | MGP Implementation | Agent Action |
|---|---|---|
| REST / HTTP | `integration` node in workflow definition | Agent generates node config with endpoint, headers, `{{var}}` body template |
| JDBC / Database Query | `db_query` agent or direct SQLAlchemy service | Agent generates SQLAlchemy query function |
| SOAP Web Service | httpx adapter in `mgp_shared` | Agent generates Python wrapper function |
| Email (SMTP) | Notification adapter in `mgp_shared` | Agent generates `NotificationClient` |
| File System / SFTP | MinIO adapter + `integration` node | Agent maps file operations to MinIO SDK calls |
| Salesforce / ServiceNow | `integration` node + auth header | Agent extracts Connected System config → integration node |
| SAP / ERP | httpx adapter with BAPI/OData pattern | Agent generates typed adapter; human validates |
| Kafka / Message Queue | Redis Pub/Sub adapter or Kafka consumer | Agent scaffolds consumer; human wires to workflow signal |

**Human checkpoint:** Test each integration against real external systems in staging.

---

### Phase 6 — AI Enhancement Layer (Weeks 10–12)

**Goal:** Identify manual, repetitive, or judgement-heavy steps in migrated Appian workflows and replace or augment with AI agents.

**Agent: `AIOpportunityAgent` (LangGraph analysis graph)**

```
TranslatedWorkflowDefinition → [scan_human_tasks] → [score_automation_potential]
                             → [recommend_agent_type] → OpportunityReport
```

**Scoring criteria per human task:**
- Is the decision rule-based and expressible as a Python expression? → `logic` node
- Does it require document reading + compliance judgement? → `agent_step` (cert_review pattern)
- Does it require multi-source data synthesis? → LangGraph multi-node graph
- Does it require sequential specialist opinions? → DeepAgents team pattern
- Does it involve form validation against a knowledge base? → LangChain RAG chain

**Output:** Augmented workflow definitions with agent_step nodes replacing or pre-populating human task forms. Every AI recommendation is still human-confirmed before completion (human-in-the-loop preserved).

---

### Phase 7 — Data Migration (Weeks 10–13, parallel)

**Goal:** Historical Appian process data migrated to MGP PostgreSQL.

| Appian Data | Migration Approach | Agent Role |
|---|---|---|
| Active process instances | Export via Appian API; agent maps context to MGP `workflow_instances.context` JSON | `DataMigrationAgent` transforms field by field |
| Completed process history | Insert as completed `workflow_instances` + `audit_events` | Agent inserts with original timestamps preserved |
| Document Store files | Bulk copy to MinIO preserving folder structure | Script; agent generates bucket layout from Appian folder manifest |
| User / Group data | Export Appian users → seed into identity-svc via `POST /v1/users` | Agent maps Appian group membership → MGP roles array |
| Report data / history | ETL into PostgreSQL analytics tables | Agent generates SQLAlchemy insert scripts from Appian report exports |

---

### Phase 8 — Validation, Parallel Run & Cutover (Weeks 13–16)

| Step | Activity | Owner |
|---|---|---|
| 8.1 | Run migrated workflows in MGP staging with synthetic data | QA team |
| 8.2 | Side-by-side comparison: same process in Appian and MGP simultaneously | Business owners |
| 8.3 | User acceptance testing per workload | Business users + QA |
| 8.4 | Performance baseline: task throughput, API latency P95, LLM agent latency | Platform team |
| 8.5 | Compliance sign-off: audit trail review, e-signature validation, 21 CFR Part 11 check | Regulatory / QA manager |
| 8.6 | Freeze Appian — stop new instances in Appian, route all new work to MGP | Business decision |
| 8.7 | Monitor MGP prod for 2 weeks; Appian kept in read-only mode as fallback | Platform team |
| 8.8 | Decommission Appian licence after 30-day stabilisation | IT / Finance |

---

### Migration Timeline Summary

```
Week  1– 2  │ Phase 0: Foundation — MGP deployed, migration harness ready
Week  2– 3  │ Phase 1: Inventory Agent — full Appian artefact manifest
Week  3– 4  │ Phase 2: Schema Agent — PostgreSQL tables + Pydantic schemas
Week  4– 6  │ Phase 3: Process Translator — workflow definitions published
Week  6– 9  │ Phase 4: UI Generator — React pages per workload
Week  8–10  │ Phase 5: Integration Migration — Connected Systems re-wired
Week 10–12  │ Phase 6: AI Enhancement — agent_step augmentation
Week 10–13  │ Phase 7: Data Migration (parallel) — historical data ported
Week 13–16  │ Phase 8: Parallel Run, UAT, Cutover, Decommission
```

**Agentic engineering coverage estimate:** ~65% of translation work automated by agents. The remaining 35% is human review of agent output, business logic edge cases, external system auth, and compliance sign-off — none of which should be fully automated.

---

## Part 3 — Reusable Components & Capabilities Across Workloads

> These components are workload-agnostic. Any new Appian workload migrated to MGP consumes them without modification.

### 3a — Backend Reusable Components

| Component | Location | Capability | Consumed By (Workloads) |
|---|---|---|---|
| **Workflow Engine** | `services/workflow-engine` | Define + execute any BPMN-based business process. 9 node types. Signal-based routing. Version management. | All workflow-bearing workloads |
| **Task Service** | `services/task-service` | Role-filtered human task queue. Claim, complete, form-data submission. JSON Schema form validation. Real-time SSE via Redis Pub/Sub. | Any process with a human step |
| **Identity Service** | `services/identity` | User registry, JWT issuance, bcrypt auth, RBAC roles, token revocation. LDAP/SAML adapter interface. | All workloads (shared auth) |
| **Audit Core** | `services/audit-core` | Append-only, SHA-256 hash-chained event ledger. GxP 21 CFR Part 11 compliant. Elasticsearch streaming. | All workloads (shared compliance layer) |
| **eSign Service** | `services/esign` | Electronic signatures with meaning, reason, re-authentication, document hash. 21 CFR Part 11. | Any workload requiring approval sign-off |
| **Agent Service** | `services/agent-service` | LangChain chains, LangGraph stateful graphs, DeepAgents multi-agent teams, custom visual pipelines. Trace logging. | Any workload with an AI-augmented step |
| **LLM Gateway** | `services/llm-gateway` | Unified LLM interface. Adapter pattern (OpenAI, Anthropic, Azure OpenAI, Ollama, Bedrock). Model allow-list. Token tracking. Retry logic. | Agent Service; any service needing LLM calls |
| **AuditClient** | `packages/py-shared/mgp_shared/audit_client.py` | Fire-and-forget HTTP client to audit-core. Used in every service. One import, one call — all actions logged. | All services |
| **BaseServiceSettings** | `packages/py-shared/mgp_shared/config.py` | Pydantic-settings base class. Reads `.env.local` / `.env.production`. All shared config keys. | All services |
| **RequestIDMiddleware** | `packages/py-shared/mgp_shared/middleware.py` | Attaches `X-Request-ID` to every request/response. Propagated to audit events and OTEL traces. | All services |
| **HealthEndpoint** | `packages/py-shared/mgp_shared/health.py` | Standard `/healthz` + `/readyz` endpoints. DB + dependency health checks. K8s probe-ready. | All services |
| **DatabaseSession** | `packages/py-shared/mgp_shared/database.py` | Async SQLAlchemy session factory. Per-service database URL. Alembic migration base. | All services |
| **LoggingConfig** | `packages/py-shared/mgp_shared/logging_config.py` | Structured JSON logging (structlog). Consistent log schema across all services. | All services |

---

### 3b — Frontend Reusable Components

| Component | Location | Capability | Consumed By (Pages / Workloads) |
|---|---|---|---|
| **SchemaForm** | `src/pages/Tasks.tsx` (inline) | Renders any task form from JSON Schema. Supports: text, number, boolean, date, dropdown, textarea, required validation. Submits form_data to task API. | All task forms across all workloads |
| **AppShell** | `src/components/AppShell.tsx` | Global navigation sidebar, topbar, user context display, role-aware menu items. | All pages — every workload |
| **Button** | `src/design-system/components/Button.tsx` | Variant system (primary / secondary / ghost / danger). Icon slot. Loading state. Disabled state. | All pages |
| **Badge** | `src/design-system/components/Badge.tsx` | Status badges with semantic colour variants. Used in task lists, workflow status, compliance labels. | All pages |
| **Modal** | `src/design-system/components/Modal.tsx` | Accessible dialog overlay. Header, body, footer slots. ESC to close. Focus trap. | All confirmation dialogs, start-workflow forms |
| **WorkflowEditor** | `src/components/WorkflowEditor/` | Visual BPMN-style workflow designer. Drag-drop nodes (9 types). Edge connections. Node config panel. Form schema builder. Publish to API. | Workflow Designer page — all workloads |
| **NodeConfigPanel** | `src/components/WorkflowEditor/NodeConfigPanel.tsx` | Per-node-type configuration form inside Workflow Editor. Agent type dropdown, form field builder, integration URL config. | Workflow Designer |
| **AgentBuilder** | `src/pages/Admin/AgentBuilder.tsx` | Visual 6-node pipeline editor (React Flow). Drag-drop ap_input/ap_prompt/ap_llm/ap_extract/ap_condition/ap_output nodes. Save + register pipeline. Test Run modal. | Admin — available to all workloads |
| **AgentPlayground** | `src/pages/Admin/AgentPlayground.tsx` | Test any built-in or custom agent. Pre-filled examples. Trace viewer. Token usage display. | Admin / Developer — all workloads |
| **DBAgent** | `src/pages/Admin/DBAgent.tsx` | Natural-language SQL interface. Chat UI. Result table renderer. SQL reveal toggle. Admin-only. | Admin — cross-workload data queries |
| **Design Tokens** | `src/design-system/tokens.css` | CSS custom properties: colour palette, spacing scale, typography scale, border radius, shadow. All workload UI inherits. | All pages |
| **API Client** | `src/api/client.ts` | Typed axios wrappers for all 7 services. Relative `/api/` paths (nginx-routed). JWT interceptor. Per-resource function groups. | All pages |
| **Auth Store** | `src/stores/auth.ts` | Zustand persist store: JWT token, user profile, roles, `isAdmin()` helper. Shared across all workload pages. | All pages |

---

### 3c — Infrastructure Reusable Components

| Component | Technology | Capability | Applies To |
|---|---|---|---|
| **Helm Base Chart** | Helm 3 | Shared Deployment / Service / HPA / PDB / ServiceAccount template. Each microservice is values-only override. | All service deployments |
| **Sidecar: Envoy Proxy** | Istio auto-inject | mTLS, circuit breaker, retry, timeout, L7 metrics — zero app code. | All pods |
| **Sidecar: Vault Agent** | HashiCorp Vault | Secret injection from Vault KV to tmpfs. Lease renewal. Dynamic DB credentials. | All pods |
| **Sidecar: OTEL Collector** | opentelemetry-collector-contrib | Trace + metric collection from OTLP localhost:4317. Batching, sampling, export. | All pods |
| **Sidecar: Fluent Bit** | DaemonSet | Structured log tailing, JSON parse, Loki + ES dual output. | All pods / nodes |
| **Sidecar: oauth2-proxy** | oauth2-proxy | OIDC session gate, header injection. Zero auth code in app. | User-facing services |
| **NetworkPolicy Template** | Kubernetes | Deny-all ingress default + explicit per-service allow rules. Reusable pattern. | All namespaces |
| **ArgoCD App Template** | ArgoCD | App-of-Apps pattern. One template per environment. | All environments |
| **PostgreSQL Schema Pattern** | SQLAlchemy + Alembic | Per-service schema isolation. Migration-first. Async session. Connection pool. | All services |
| **MinIO Bucket Convention** | MinIO / S3 | `{workload}-documents/{instance_id}/` bucket path pattern. Lifecycle policy template. | All document-bearing workloads |

---

### 3d — Agentic Reusable Components (for Migration & Runtime)

| Agent Component | Framework | Capability | Reuse Pattern |
|---|---|---|---|
| **AuditCallbackHandler** | LangChain Callback | Writes every LLM call (input, output, tokens) to audit-core. Attach to any LangChain chain. | Add to `callbacks=` in any chain |
| **TokenUsageCallback** | LangChain Callback | Aggregates token counts per workflow_instance_id. Prometheus gauge export. | Add to `callbacks=` in any chain |
| **PostgresSaver** | LangGraph Checkpoint | Persists full LangGraph state to PostgreSQL after each node. Resume after crash or human interrupt. | Attach to any `StateGraph.compile()` |
| **BaseMGPAgent** | Custom base class | `_call_llm()` method, trace_id threading, audit log hook, error fallback. All built-in agents inherit. | Extend for any new built-in agent |
| **RAGRetriever** | LangChain + Qdrant | Loads documents from MinIO, chunks, embeds, stores in Qdrant. Retrieves by cosine similarity. | Plug into any chain needing document context |
| **EpisodicMemoryStore** | DeepAgents + Qdrant | Stores past agent task summaries; retrieves similar past cases at agent init. | Add to any DeepAgent specialist |
| **Pipeline Executor** | Custom (service.py) | Topological sort + node-by-node execution of `ap_*` pipeline graphs. Shared `ctx` dict. | All visual pipelines from Agent Builder |
| **AppianInventoryAgent** | LangChain ReAct | Parses Appian export packages; generates structured inventory manifest. | Migration Phase 1 |
| **SchemaGeneratorAgent** | LangGraph (4 nodes) | Appian Record Types → Pydantic schemas + Alembic migrations. | Migration Phase 2 |
| **ProcessTranslatorAgent** | LangGraph (human-in-loop) | Appian Process Models → MGP Workflow Definition JSON. | Migration Phase 3 |
| **UIGeneratorAgent** | LangChain + codegen | Appian SAIL interfaces → React TSX page components. | Migration Phase 4 |
| **AIOpportunityAgent** | LangGraph (analysis) | Scans translated workflows; recommends where agent_step nodes add value. | Migration Phase 6 |
| **DataMigrationAgent** | LangChain + tools | Maps Appian process instance context fields → MGP workflow_instances.context JSON. | Migration Phase 7 |

---

*Document version: 2026-06-16 · MGP Manufacturing Governance Platform*
