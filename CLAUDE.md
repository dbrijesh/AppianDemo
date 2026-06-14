# MGP — Manufacturing Governance Platform

## Quick Start
```powershell
cd E:\AppianDemo\mgp
.\dev.ps1          # starts all 7 services + UI
```
Login at http://localhost:3000 — `admin@mgp.local / Admin123!`

## Services
| Service | Port | DB |
|---|---|---|
| audit-core | 8001 | `data/audit-core/audit-core.db` |
| esign | 8002 | `data/esign/esign.db` |
| identity | 8003 | `data/identity/identity.db` |
| workflow-engine | 8004 | `data/workflow-engine/workflow-engine.db` |
| task-service | 8005 | `data/task-service/task-service.db` |
| agent-service | 8006 | `data/agent-service/agent-service.db` |
| llm-gateway | 8007 | — |
| ui (Vite) | 3000 | — |

Each service reads `.env.local` in its own directory (pydantic-settings). Key vars: `AUDIT_CORE_URL=http://localhost:8001`, `TASK_URL=http://localhost:8005`, `WORKFLOW_URL=http://localhost:8004`.

## Architecture
- **Auth**: JWT (python-jose), seeded stub users in identity service
- **DB pattern**: SQLite per-service; `dict` fields stored as JSON strings — always add `field_validator(..., mode="before")` in Pydantic `Out` schemas to parse them back
- **Shared lib**: `packages/py-shared/mgp_shared` — `AuditClient`, `BaseServiceSettings`, `RequestIDMiddleware`, etc.
- **UI**: React 18 + TypeScript + Vite + TanStack Query + Zustand + React Flow + Recharts

## Workflow Source Format
The workflow definition format is **MGP proprietary JSON** (nodes + edges arrays), not BPMN. This is what the Workflow Designer UI writes, what the API exposes (`GET /v1/definitions/:id`), and what is stored in `WorkflowDefinition.graph_json`.

Node types: `start`, `end`, `task` (human task with role + form_schema), `gateway` (exclusive, edge conditions), `timer`, `agent_step` (AI agent), `esign` (electronic signature).

`bpmn_converter.py` converts this JSON to BPMN 2.0 XML **internally** at runtime as an implementation detail of `spiff_executor.py`. Nothing outside the executor sees or cares about BPMN.

## Known Pattern — JSON-in-SQLite
Services store dict fields as JSON strings in SQLite; `model_validate(orm_obj)` fails unless the schema has:
```python
@field_validator("field_name", mode="before")
@classmethod
def _parse(cls, v):
    if isinstance(v, str):
        return json.loads(v)
    return v
```
**Already fixed in:** `audit-core/app/schemas.py` (payload), `task-service/app/schemas.py` (form_schema, form_data), `workflow-engine/app/schemas.py` (context + `_payload` unwrap — see below)

## Known Pattern — spiff_executor `_payload` Wrapper
`spiff_executor.py` stores workflow instance context as `{"_payload": {...actual data...}}`. The `InstanceOut.context` field_validator in `workflow-engine/app/schemas.py` unwraps this automatically so API consumers always see flat context. If you see `m.context.project` returning `undefined` on the frontend, check that the unwrap logic is still present:
```python
@field_validator("context", mode="before")
@classmethod
def _context(cls, v):
    parsed = _parse_json_field(v)
    if isinstance(parsed, dict) and list(parsed.keys()) == ["_payload"] and isinstance(parsed.get("_payload"), dict):
        return parsed["_payload"]
    return parsed
```

## Workflow Seeded Templates
Defined in `workflow-engine/app/seed.py`:
- `material_requisition`: start → create_mr(operator) → review_mr(qa_manager) → approve_gate → cost_governance(operator) / rejected_task → finance_approval(esign) → release → end
- `deviation_capa`: includes agent_step nodes (deviation_triage, rca_drafting, capa_suggestion)
- `certificate_management` (v4): request_cert → doc_upload → cert_ai_review(agent) → risk_check(logic: risk_score>7) → [true: escalated_review(admin)] / [false: qa_review] → review_gate → final_approve(esign) → sn_register(integration: ServiceNow) → end

## Node Types (all 9)
| Type | BPMN | Description |
|---|---|---|
| `start` / `end` | startEvent / endEvent | Flow control |
| `task` | userTask | Human task with role + form |
| `gateway` | exclusiveGateway | Signal-based routing (approved/rejected) |
| `timer` | userTask+mgp:type | SLA timer placeholder |
| `agent_step` | userTask+mgp:type | Auto-invokes AI agent, accumulates outputs |
| `esign` | userTask+mgp:type | Electronic signature step |
| `integration` | userTask+mgp:type | Auto-invokes REST/DB endpoint; `{{var}}` body templates |
| `logic` | exclusiveGateway | Evaluates Python expression; routes true/false |

## Key Files
- Workflow executor: `services/workflow-engine/app/engine/spiff_executor.py` (SpiffWorkflow 1.2.1)
- BPMN converter: `services/workflow-engine/app/engine/bpmn_converter.py` (MGP graph → BPMN XML)
- Task router: `services/task-service/app/router.py` — `_task_out()` helper wraps ORM→schema
- Agent service: `services/agent-service/app/` — LLM-backed agents for workflow nodes
- UI pages: `packages/ui/src/pages/`
- Design system: `packages/ui/src/design-system/`
- API client: `packages/ui/src/api/client.ts`
- Architecture diagrams: `arch.md` (8 Mermaid diagrams)

## Custom Agent Pipeline Editor
`/admin/agent-builder` is a full custom visual pipeline editor built with React Flow (@xyflow/react). **Flowise was evaluated but not used** — C: drive was filled to 0 bytes during an attempted global install; custom editor was chosen instead.

### Node types
| Type | Color | Purpose |
|---|---|---|
| `ap_input` | green #15803d | Receives workflow context (no target handle) |
| `ap_prompt` | indigo #4f46e5 | Build LLM messages — `{{var}}` template, system_message, role |
| `ap_llm` | cyan #0891b2 | Execute LLM call — stores result in `output_key` |
| `ap_extract` | amber #d97706 | Parse JSON / pick field / pass raw from `source_key` |
| `ap_condition` | rose #e11d48 | `eval(expression, ctx)` → stores bool as `condition_result` |
| `ap_output` | slate #475569 | Map context keys to final output (no source handle) |

### Architecture
- **DB:** `agent_pipelines` table in `agent-service.db` (SQLAlchemy, auto-created on startup)
- **Routing:** `agent_type: "pipeline:{uuid}"` in workflow `agent_step` nodes → `execute_pipeline()` in `agent-service/app/service.py`
- **Execution:** topological sort → node-by-node with shared `ctx` dict; `_llm_call()` hits llm-gateway
- **Available everywhere:** `GET /agents/types` returns `{ types: [...], pipelines: [{id, name, description}] }` — consumed by NodeConfigPanel and AgentPlayground

### Key files
- `services/agent-service/app/models.py` — `AgentPipeline` model
- `services/agent-service/app/schemas.py` — `PipelineCreate`, `PipelineUpdate`, `PipelineOut`
- `services/agent-service/app/service.py` — `execute_pipeline`, `_execute_node`, `_topo_order`, pipeline CRUD
- `services/agent-service/app/router.py` — `/v1/pipelines` CRUD + updated `/agents/types`
- `packages/ui/src/pages/Admin/AgentBuilder.tsx` — visual editor (pipeline list sidebar, ReactFlow canvas, NodePalette, ConfigPanel, Test Run modal)
- `packages/ui/src/api/client.ts` — `listPipelines`, `getPipeline`, `createPipeline`, `updatePipeline`, `deletePipeline`

**Note — C: drive full:** A failed global `npm install -g flowise` in June 2026 filled C: to 0 bytes. Delete `C:\flowise` (partial install) with `rd /s /q C:\flowise` to recover ~10-15 GB.

## Demo Data
Seeded by `E:\AppianDemo\mgp\seed_demo_data.py` (run once, direct SQLite insert):
- 9 certificate_management instances (5 completed, 3 running, 1 failed)
- 8 material_requisition instances (6 completed, 2 running)
- 6 deviation_capa instances (3 completed, 3 running)
- Full workflow history + open tasks for all running instances

## Completed Work (as of 2026-06-13)
- [x] `audit-core/app/schemas.py` — field_validator for `payload` (fixes audit 500s)
- [x] `task-service/app/schemas.py` — field_validator for `form_schema`, `form_data`
- [x] `audit-core/app/seed.py` + `main.py` — seeds 20 showcase audit events on first startup
- [x] `packages/ui/src/pages/Tasks.tsx` — full rewrite: JSON Schema form renderer (SchemaForm), esign UI, form_data in complete payload
- [x] `packages/ui/src/pages/Workflows.tsx` — new page at `/workflows`; lists all instances, start modal, history modal
- [x] `packages/ui/src/pages/Certificates.tsx` — rewired to workflow instances (was local mock state); "Add New Certificate" starts `certificate_management` workflow
- [x] `packages/ui/src/pages/MaterialRequisition/List.tsx` — new list page at `/mr`; wired to `material_requisition` instances
- [x] `packages/ui/src/pages/MaterialRequisition/Create.tsx` — fixed post-submit redirect to `/mr`
- [x] `packages/ui/src/pages/Admin/AuditLog.tsx` — fixed field name mismatches
- [x] `packages/ui/src/pages/Admin/DBAgent.css` — centered `.db-page`
- [x] `packages/ui/src/pages/Admin/AgentPlayground.tsx` — agent registry cards, trace history, test invoke modal (at `/admin/agents`)
- [x] `packages/ui/src/pages/Admin/AgentBuilder.tsx` — **custom visual pipeline editor** (React Flow canvas, 6 node types, NodePalette drag-drop, ConfigPanel per-type forms, pipeline list sidebar, Test Run modal, Save & Register). Pipelines stored in agent-service DB; available in NodeConfigPanel and AgentPlayground via `/agents/types` API.
- [x] `packages/ui/src/pages/Dashboard.tsx` — full redesign: 4 KPI cards with coloured borders, 2-col main row (activity feed + financial/compliance stacked), 3-col chart row (throughput bar + MR customer bar + functional area donut), cost table at bottom. Removed oversized Cost Structure pie.
- [x] `packages/ui/src/pages/Dashboard.css` — new CSS for redesigned dashboard layout
- [x] `packages/ui/src/pages/Reports.tsx` — 3-tab rewrite: (1) Macro Cost Governance with live MR data merge, (2) Deep Dive with industry/customer/project cascade + live MR table, (3) Compliance & Governance with live cert/deviation charts and open deviation table
- [x] `workflow-engine/app/schemas.py` — `InstanceOut.context` field_validator unwraps `_payload` wrapper; also fixes MR customer chart blank issue across Dashboard, Reports, Certificates, etc.
- [x] `workflow-engine/app/schemas.py` — `update_definition()` creates new version row + deactivates old (save/publish always affects new instances only; running instances keep their definition_id snapshot)
- [x] `services/workflow-engine/app/engine/spiff_executor.py` — `_dispatch_task` reads `meaning` fallback for esign node description
- [x] `WorkflowEditor/NodeConfigPanel.tsx` — full rewrite: fixed stale `selectedNode` bug (typing not appearing), added visual **Form Schema Builder** for task/esign nodes (add fields: text/textarea/number/boolean/date/dropdown, required flag, JSON Schema preview)
- [x] `WorkflowEditor/index.tsx` — derive live node from `nodes` array instead of stale `selectedNode` snapshot (fixes controlled input reset on every keystroke)
- [x] SpiffWorkflow 1.2.1 integration — `bpmn_converter.py`, `spiff_executor.py`, `service.py`. Tested: happy path, reject path, serialization round-trip.
- [x] `arch.md` — 8 Mermaid diagrams
- [x] Certificate workflow v4 — `risk_check` (logic), `escalated_review` (task), `sn_register` (integration: ServiceNow mock)
- [x] `seed_demo_data.py` — 23 workflow instances seeded directly into SQLite

## Azure Deployment Strategy (3–4 day demo window)

**Goal:** Public URL for a short demo. No reserved instances — pay-as-you-go, deallocate the VM when not presenting.

### Cost estimate (4 days, pay-as-you-go)
| Resource | Rate | 4-day cost |
|---|---|---|
| B2s VM (running ~8h/day) | $0.048/hr | ~$1.50 |
| Azure Static Web Apps | Free tier | $0 |
| Azure OpenAI GPT-4o-mini | ~$0.001/call | ~$1–2 |
| **Total** | | **~$3–4** |

**Key:** Stop/deallocate the VM (`az vm deallocate`) after each demo session — compute billing stops immediately. Static Web Apps stays live for free.

### Architecture
```
Internet
  └── Azure Static Web Apps (free, CDN, HTTPS)
        └── React build  →  calls https://api.<VM-IP>.nip.io/api/*
                                    │
                              Azure VM B2s (pay-as-you-go)
                              nginx (SSL via Let's Encrypt / nip.io)
                                ├── /api/identity/ → :8003
                                ├── /api/workflow/ → :8004
                                ├── /api/tasks/    → :8005
                                ├── /api/audit/    → :8001
                                └── /api/agents/   → :8006
```

### Step-by-step deployment

#### 1. Create resources (one-time)
```bash
az group create --name mgp-rg --location eastus2

# VM — no reserved instance, pay-as-you-go
az vm create \
  --resource-group mgp-rg --name mgp-vm \
  --image Ubuntu2204 --size Standard_B2s \
  --admin-username azureuser --ssh-key-values ~/.ssh/id_rsa.pub \
  --public-ip-sku Standard

az vm open-port --port 80  --resource-group mgp-rg --name mgp-vm
az vm open-port --port 443 --resource-group mgp-rg --name mgp-vm

# Static Web Apps (free tier, keep forever)
az staticwebapp create --name mgp-ui --resource-group mgp-rg \
  --location "East US 2" --sku Free
```

#### 2. Get the VM public IP
```bash
az vm show -d --resource-group mgp-rg --name mgp-vm --query publicIps -o tsv
# e.g. 20.10.5.3
# Free domain (no purchase needed): 20.10.5.3.nip.io
```

#### 3. On the VM — install deps
```bash
ssh azureuser@<VM-IP>
sudo apt update && sudo apt install -y python3.11 python3-pip python3-venv nodejs npm nginx certbot python3-certbot-nginx git
```

#### 4. Deploy code to VM
```bash
# From your Windows machine — copy the whole project
scp -r E:\AppianDemo\mgp azureuser@<VM-IP>:/opt/mgp

# Or use git if you have a repo
```

#### 5. Install Python deps per service (on VM)
```bash
cd /opt/mgp
for svc in audit-core esign identity workflow-engine task-service agent-service llm-gateway; do
  cd services/$svc
  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
  cd /opt/mgp
done
pip install -e packages/py-shared   # shared lib
```

#### 6. Create systemd services (on VM)
```bash
# Template — repeat for each service, changing name/port
sudo tee /etc/systemd/system/mgp-identity.service <<EOF
[Unit]
After=network.target
[Service]
WorkingDirectory=/opt/mgp/services/identity
ExecStart=/opt/mgp/services/identity/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8003
Restart=always
Environment=PYTHONPATH=/opt/mgp/packages/py-shared
[Install]
WantedBy=multi-user.target
EOF

# Ports: audit-core=8001, esign=8002, identity=8003,
#         workflow-engine=8004, task-service=8005,
#         agent-service=8006, llm-gateway=8007
sudo systemctl daemon-reload
sudo systemctl enable --now mgp-identity mgp-workflow mgp-tasks mgp-audit mgp-agents mgp-llm
```

#### 7. nginx config (on VM)
```bash
sudo tee /etc/nginx/sites-available/mgp <<'EOF'
server {
    listen 80;
    server_name 20.10.5.3.nip.io;   # replace with your VM IP

    set $cors "";
    if ($http_origin ~* "azurestaticapps\.net") { set $cors $http_origin; }

    location / {
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin  $cors always;
            add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
            add_header Access-Control-Allow-Headers "Authorization,Content-Type" always;
            return 204;
        }
    }
    location /api/identity/ { proxy_pass http://127.0.0.1:8003/; add_header Access-Control-Allow-Origin $cors always; }
    location /api/workflow/ { proxy_pass http://127.0.0.1:8004/; add_header Access-Control-Allow-Origin $cors always; }
    location /api/tasks/    { proxy_pass http://127.0.0.1:8005/; add_header Access-Control-Allow-Origin $cors always; }
    location /api/audit/    { proxy_pass http://127.0.0.1:8001/; add_header Access-Control-Allow-Origin $cors always; }
    location /api/agents/   { proxy_pass http://127.0.0.1:8006/; add_header Access-Control-Allow-Origin $cors always; }
}
EOF
sudo ln -s /etc/nginx/sites-available/mgp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
> **Note on SSL:** nip.io doesn't support Let's Encrypt (wildcard subdomain). For demo use HTTP is fine. For HTTPS, buy a cheap domain (~$1/yr on Namecheap) and run `certbot --nginx -d yourdomain.com`.

#### 8. Build & deploy UI to Static Web Apps
```powershell
# On your Windows machine — set VM URL, build, deploy
cd E:\AppianDemo\mgp\packages\ui
$env:VITE_API_BASE = "http://20.10.5.3.nip.io"   # your VM IP
npm run build

az staticwebapp deploy `
  --name mgp-ui --resource-group mgp-rg `
  --source dist --no-use-keyfile
```
Azure prints the SWA URL: `https://xxxx.azurestaticapps.net` — share this with demo attendees.

#### 9. Run the seed data (one-time, on VM)
```bash
cd /opt/mgp
python3 seed_demo_data.py
```

### Start / stop for each demo session
```bash
# START (morning of demo) — ~2 min to boot
az vm start --resource-group mgp-rg --name mgp-vm

# STOP (after demo) — billing stops immediately
az vm deallocate --resource-group mgp-rg --name mgp-vm
```

### Deployed resources (2026-06-13)
| Resource | Detail |
|---|---|
| Resource Group | `mgp-rg` (eastus2) |
| VM | `mgp-vm` — Standard_B2s, Ubuntu 22.04, IP **20.242.6.146** |
| Azure OpenAI | `mgp-openai` — deployment `gpt-4.1-mini` (2025-04-14) |
| App URL | **http://20.242.6.146** |
| Login | `admin@mgp.local / Admin123!` |

### Architecture (single-VM, no SWA)
```
http://20.242.6.146
  └── nginx :80
        ├── /              → /opt/mgp/ui-dist (React build)
        ├── /api/identity/ → :8003 (identity)
        ├── /api/workflow/ → :8004 (workflow-engine)
        ├── /api/tasks/    → :8005 (task-service)
        ├── /api/audit/    → :8001 (audit-core)
        ├── /api/agents/   → :8006 (agent-service)
        ├── /api/esign/    → :8002 (esign)
        └── /api/llm/      → :8007 (llm-gateway → Azure OpenAI)
```

### Stop/start VM (billing pauses when stopped)
```bash
az vm deallocate -g mgp-rg -n mgp-vm   # stop billing
az vm start       -g mgp-rg -n mgp-vm   # start again
az vm show -d -g mgp-rg -n mgp-vm --query publicIps -o tsv  # get new IP
```
> **Note:** IP changes after each start. Run `deploy-azure.ps1` again (or just the last 2 steps) to rebuild React with the new IP.

### Redeploy after VM restart
```powershell
$newIp = az vm show -d -g mgp-rg -n mgp-vm --query publicIps -o tsv
# Rebuild React
cd E:\AppianDemo\mgp\packages\ui
$env:VITE_API_BASE = "http://$newIp"; npm run build
# SCP new build to VM
scp -r dist\* "azureuser@${newIp}:/opt/mgp/ui-dist/"
ssh azureuser@$newIp "sudo systemctl reload nginx"
```

### New files added (2026-06-13 deployment)
- `services/llm-gateway/app/adapters/azure_openai.py` — Azure OpenAI adapter (httpx, no extra deps)
- `vm-setup.sh` — one-shot VM initialization (apt, venvs, systemd, nginx)
- `deploy-azure.ps1` — full deployment orchestration script for re-runs
- `packages/ui/src/vite-env.d.ts` — Vite type reference (fixes `import.meta.env` TS error)
- `seed_demo_data.py` — updated to use script-relative paths (works on both Windows dev and Linux VM)

## Session Resume Notes (2026-06-13)
Last completed action: Azure deployment in progress — VM setup running, React build running. VM IP: 20.242.6.146. Azure OpenAI gpt-4.1-mini deployed at mgp-openai-6394a.openai.azure.com. See `.env.local` for credentials (local) and `/opt/mgp/.env.production` on VM.
