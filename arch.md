# MGP Platform — Architecture

Manufacturing Governance Platform (MGP) is a self-hosted, GxP-regulated workflow system that replaces Appian for Hexaware's manufacturing operations. It provides visual workflow design, human task management, AI-assisted governance (CAPA/RCA), electronic signatures, and an append-only audit trail.

---

## 1. Service Topology

```mermaid
graph TD
    UI["UI\nReact 18 · Vite\n:3000"]

    subgraph "API Services"
        GW["nginx gateway\n:8000"]
        ID["identity-service\n:8003"]
        WF["workflow-engine\n:8004"]
        TS["task-service\n:8005"]
        ES["esign-service\n:8002"]
        AG["agent-service\n:8006"]
        LLM["llm-gateway\n:8007"]
        AU["audit-core\n:8001"]
    end

    subgraph "Data"
        DB1[(identity.db)]
        DB2[(workflow-engine.db)]
        DB3[(task-service.db)]
        DB4[(esign.db)]
        DB5[(agent-service.db)]
        DB6[(audit-core.db)]
        Ollama["Ollama\nLLM runtime"]
    end

    UI -->|JWT + REST| GW
    GW --> ID & WF & TS & ES & AG & AU

    WF -->|POST /v1/tasks| TS
    WF -->|POST /v1/esign| ES
    WF -->|POST /v1/run| AG
    TS -->|POST /v1/instances/:id/signal| WF
    ES -->|POST /v1/instances/:id/signal| WF
    AG -->|POST /v1/instances/:id/signal| WF
    WF & TS & ES & AG -->|POST /v1/events| AU

    AG --> LLM
    LLM --> Ollama

    ID --- DB1
    WF --- DB2
    TS --- DB3
    ES --- DB4
    AG --- DB5
    AU --- DB6
```

---

## 2. Request / Auth Flow

```mermaid
sequenceDiagram
    actor User
    participant UI
    participant identity as identity-service :8003
    participant service as any-service :800x
    participant audit as audit-core :8001

    User->>UI: Enter credentials
    UI->>identity: POST /v1/auth/login {email, password}
    identity-->>UI: {access_token (JWT), user}
    UI->>UI: Store token in Zustand auth store

    User->>UI: Perform action (e.g. complete task)
    UI->>service: REST call + Authorization: Bearer <token>
    service->>identity: GET /v1/auth/verify (token validation)
    identity-->>service: {user_id, email, roles}
    service->>service: Execute business logic
    service->>audit: POST /v1/events (fire-and-forget, errors swallowed)
    service-->>UI: Response
```

---

## 3. Workflow Execution Flow

> **Source format:** MGP proprietary JSON (nodes + edges). BPMN 2.0 XML is an **internal** implementation detail used only inside `spiff_executor.py` — nothing outside the executor sees or produces BPMN.

```mermaid
sequenceDiagram
    actor User
    participant UI
    participant wf as workflow-engine :8004
    participant exec as spiff_executor (internal)
    participant ts as task-service :8005
    participant audit as audit-core :8001

    User->>UI: Start workflow (e.g. Material Requisition)
    UI->>wf: POST /v1/definitions/{slug}/start
    wf->>wf: Load definition (MGP JSON nodes+edges)
    wf->>exec: start(graph) — converts to BPMN internally, runs engine steps
    Note over exec: Internal: graph_to_bpmn() → BpmnWorkflow → first ready node
    exec-->>wf: First ready node id (e.g. create_mr) + serialized state
    wf->>ts: POST /v1/tasks {node_id, role, form_schema}
    wf->>wf: Persist instance.context (serialized executor state)
    wf->>audit: Record workflow_started event
    wf-->>UI: WorkflowInstance {id, status: running, current_node_id}

    User->>UI: Open Tasks page → see task
    UI->>ts: GET /v1/tasks?status=open
    ts-->>UI: [task list]

    User->>UI: Complete task with signal "approved"
    UI->>ts: POST /v1/tasks/{id}/complete {signal, form_data}
    ts->>wf: POST /v1/instances/{id}/signal {signal: "approved"}
    wf->>exec: signal(state, node_id, "approved") — advances engine
    Note over exec: Gateway evaluates signal → selects cost_governance branch
    exec-->>wf: Next ready node (cost_governance) + updated state
    wf->>ts: POST /v1/tasks {node_id: cost_governance, role: operator}
    wf->>wf: Persist updated state
    wf-->>ts: InstanceOut {current_node_id: cost_governance}
    ts-->>UI: TaskOut (completed)
```

---

## 4. Workflow Definition — Node Types

MGP workflow definitions are stored and exchanged as **JSON** with `nodes` and `edges` arrays. The Workflow Designer writes this format; `GET /v1/definitions/:id` returns it. Node types mirror Appian constructs plus two MGP-native extensions:

```mermaid
graph LR
    S([start]) --> T[task\nhuman task]
    T --> GW{gateway\nexclusive}
    GW -->|approved| T2[task]
    GW -->|rejected| T3[task]
    T2 --> ES[esign\ne-signature]
    ES --> AG[agent_step\nAI agent]
    AG --> TM[timer\ndelay]
    TM --> E([end])

    style S fill:#0f2040,color:#fff
    style E fill:#0f2040,color:#fff
    style GW fill:#fbbf24,color:#000
    style ES fill:#7c3aed,color:#fff
    style AG fill:#0891b2,color:#fff
```

| MGP node type | Description | Key config fields |
|---|---|---|
| `start` | Entry point, one per graph | — |
| `end` | Terminal node | — |
| `task` | Human task assigned by role | `role`, `form_schema` |
| `gateway` | Exclusive branch on signal value | edge `condition` expressions |
| `agent_step` | AI agent node (agent-service) | `agent_type` |
| `esign` | Electronic signature (esign-service) | `signers`, `document_ref` |
| `timer` | Timed delay before next node | `delay_seconds` |

> The executor (`spiff_executor.py`) converts this JSON to BPMN 2.0 XML internally via `bpmn_converter.py`. This is a private implementation detail — the API and UI never see BPMN.

---

## 5. Agent Pipeline (AI-Assisted Nodes)

```mermaid
graph LR
    WF["workflow-engine\n(agent_step node entered)"]
    -->|POST /v1/run {agent_type, context}| AG["agent-service :8006"]
    AG -->|POST /v1/generate| LLM["llm-gateway :8007"]
    LLM -->|chat completion| OL["Ollama\n(local LLM)"]
    OL --> LLM
    LLM --> AG
    AG --> AG2["Parse + structure\nLLM response"]
    AG2 -->|POST /v1/instances/:id/signal| WF2["workflow-engine\n(advance to next node)"]

    style AG fill:#0891b2,color:#fff
    style LLM fill:#0369a1,color:#fff
    style OL fill:#64748b,color:#fff
```

---

## 6. Audit Chain (21 CFR Part 11)

```mermaid
graph LR
    SVC["Any service\n(via AuditClient)"]
    -->|POST /v1/events| AC["audit-core :8001"]
    AC --> AC2["append_event()\n- Fetch last hash\n- Compute SHA-256\n- Write immutable row"]
    AC2 --> DB[(audit_events\nSQLite)]

    UI["Admin UI"] -->|GET /v1/events| AC
    UI -->|POST /v1/verify| AC
    AC --> VF["verify_chain()\nRecompute all hashes\nCheck prev_hash chain"]
    VF --> UI

    style AC fill:#0f2040,color:#fff
    style DB fill:#334155,color:#fff
```

Each `AuditEvent` row stores:
- `event_hash = SHA-256(id + entity + action + actor + payload + occurred_at + previous_hash)`
- `previous_hash` pointing to the preceding event

Any tampering (UPDATE/DELETE) breaks the chain and is detected by `verify_chain`.

---

## 7. Data Layer

```mermaid
erDiagram
    WorkflowDefinition {
        string id PK
        string slug
        int version
        text graph_json
        bool is_active
    }
    WorkflowInstance {
        string id PK
        string definition_id FK
        string status
        string current_node_id
        text context_json
    }
    WorkflowHistory {
        string id PK
        string instance_id FK
        string node_id
        string action
        text payload_json
    }
    Task {
        string id PK
        string workflow_instance_id FK
        string node_id
        string status
        text form_schema_json
        text form_data_json
    }
    AuditEvent {
        string id PK
        string entity_type
        string entity_id
        string action
        string previous_hash
        string event_hash
        text payload_json
    }

    WorkflowDefinition ||--o{ WorkflowInstance : "starts"
    WorkflowInstance ||--o{ WorkflowHistory : "records"
    WorkflowInstance ||--o{ Task : "creates"
    WorkflowInstance ||--o{ AuditEvent : "generates"
    Task ||--o{ AuditEvent : "generates"
```

---

## 8. Deployment Layers

```mermaid
graph TB
    subgraph "Local Dev (this setup)"
        PS["PowerShell dev.ps1\nStarts all 8 processes"]
        VENV[".venv\nShared Python env"]
        SQLITE["SQLite\nOne .db per service\nin data/"]
        VITE["Vite dev server\n:3000 with HMR"]
    end

    subgraph "Production Target"
        K8S["Kubernetes\nOne pod per service"]
        MSSQL["Azure SQL / MSSQL\nShared schema-per-service"]
        NGINX["nginx ingress\nTLS termination"]
        AZAD["Azure AD\nJWT via MSAL"]
        VLLM["vLLM\nGPU LLM inference"]
    end

    subgraph "Promotion path"
        ENV[".env.local →\nenv vars only\nNo code changes"]
    end

    PS -.->|same code| K8S
    SQLITE -.->|DB_URL=mssql://...| MSSQL
    VITE -.->|built static| NGINX
    VENV -.->|AUTH_ADAPTER=azure_ad| AZAD
    VENV -.->|LLM_ADAPTER=vllm| VLLM
```

**Key promotion env vars:**

| Variable | Local | Production |
|---|---|---|
| `DB_URL` | `sqlite+aiosqlite:///./data/...` | `mssql+aioodbc://...` |
| `AUTH_ADAPTER` | `stub` | `azure_ad` |
| `LLM_ADAPTER` | `ollama` | `vllm` |
| `AUDIT_CORE_URL` | `http://localhost:8001` | `http://audit-core.svc:8001` |
