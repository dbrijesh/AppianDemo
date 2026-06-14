import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, Play, RefreshCw, Clock, Zap, ChevronDown, ChevronUp, AlertCircle, Loader2 } from 'lucide-react'
import { agentApi } from '../../api/client'
import { Button, Modal, Badge } from '../../design-system'
import './AgentPlayground.css'

// ── Agent metadata ────────────────────────────────────────────────────────────

interface AgentMeta {
  label: string
  description: string
  exampleInput: object
}

const AGENT_META: Record<string, AgentMeta> = {
  deviation_triage: {
    label: 'Deviation Triage',
    description: 'Classifies deviation severity, identifies root causes, and recommends CAPA types.',
    exampleInput: {
      description: 'Temperature excursion in cold storage Unit 3. Product exposed to 12 °C for ~4 hours during a power interruption. Affected units quarantined pending investigation.',
      product: 'VaccinePro-A',
      batch_id: 'BT-2024-0312',
      facility: 'Building 4 — Cold Chain Storage',
      discovered_by: 'QA Technician',
    },
  },
  rca_drafting: {
    label: 'RCA Drafting',
    description: 'Drafts a root cause analysis narrative from deviation details and severity context.',
    exampleInput: {
      deviation_description: 'Equipment malfunction in mixing tank T-02 caused batch loss. Agitator motor failed mid-cycle at step 3, resulting in incomplete homogenisation and out-of-spec viscosity readings.',
      severity: 'major',
      product: 'TheraBio-X',
      batch_id: 'BT-2024-0187',
      affected_quantity: '450 kg',
      detection_method: 'In-process viscosity check',
    },
  },
  capa_suggestion: {
    label: 'CAPA Suggestion',
    description: 'Proposes corrective and preventive actions with owner roles and timeline estimates.',
    exampleInput: {
      root_causes: [
        'Inadequate preventive maintenance schedule for mixing equipment',
        'Operator training gap on early fault detection',
        'No real-time motor health monitoring',
      ],
      deviation_type: 'equipment_failure',
      severity: 'major',
      product: 'TheraBio-X',
      recurrence_count: 2,
    },
  },
  batch_anomaly: {
    label: 'Batch Anomaly',
    description: 'Detects out-of-spec batch parameters and flags anomalies for QA review.',
    exampleInput: {
      batch_id: 'BT-2024-0312',
      product: 'VaccinePro-A',
      manufacturing_date: '2024-03-12',
      parameters: [
        { name: 'pH',          value: 7.8,  expected_min: 6.8,  expected_max: 7.2,  unit: '' },
        { name: 'temperature', value: 36.5, expected_min: 35.0, expected_max: 37.0, unit: '°C' },
        { name: 'viscosity',   value: 142,  expected_min: 80,   expected_max: 120,  unit: 'cP' },
        { name: 'pH_step2',    value: 6.9,  expected_min: 6.8,  expected_max: 7.2,  unit: '' },
      ],
    },
  },
  cert_review: {
    label: 'Certificate Review',
    description: 'AI compliance review of certificate requests — produces risk score, compliance checklist, and recommendation.',
    exampleInput: {
      cert_name: 'ISO 9001 Annual Renewal 2026',
      cert_type: 'ISO 9001',
      applicant_name: 'Jane Smith',
      applicant_department: 'Quality Assurance',
      authorised_by: 'Bureau Veritas India Pvt. Ltd.',
      scope_description: 'Quality management system covering design, development, manufacturing, and post-market surveillance of Class II medical devices at the Chennai facility. Includes supplier qualification and calibration programme.',
      target_date: '2026-09-30',
      expires_on: '2027-03-31',
    },
  },
}

// Example inputs for visual pipelines — matched by pipeline name (case-insensitive)
const PIPELINE_EXAMPLES_BY_NAME: Record<string, object> = {
  'risk scorer': {
    cert_name: 'ISO 9001 Annual Renewal 2026',
    cert_type: 'ISO 9001',
    applicant_name: 'Jane Smith',
    applicant_department: 'Quality Assurance',
    authorised_by: 'Bureau Veritas India Pvt. Ltd.',
    scope_description: 'Quality management system for medical device manufacturing. Covers design, production, and post-market surveillance across three sites.',
    target_date: '2026-09-30',
  },
  'deviation classifier': {
    description: 'Contamination detected in cleanroom Area C during environmental monitoring. Particle count exceeded ISO Class 7 limits at two sampling points.',
    product: 'InjectaPure-B',
    batch_id: 'BT-2024-0501',
    area: 'Cleanroom Area C',
  },
  'document summariser': {
    document_text: 'This SOP governs the cleaning and sanitisation of manufacturing equipment to prevent cross-contamination between batches. Personnel must complete training before operating.',
    document_type: 'SOP',
    document_id: 'SOP-MFG-042',
  },
}

function pipelineExampleInput(pipelineName: string): object {
  const key = pipelineName.toLowerCase()
  return PIPELINE_EXAMPLES_BY_NAME[key] ?? { input_key: 'value', context: 'Add your JSON input here' }
}

function agentMeta(type: string): AgentMeta {
  return AGENT_META[type] ?? {
    label: type.startsWith('pipeline:') ? type.replace('pipeline:', '') : type,
    description: 'Visual agent pipeline.',
    exampleInput: {},
  }
}

// ── Trace row ─────────────────────────────────────────────────────────────────

function TraceRow({ trace }: { trace: any }) {
  const [open, setOpen] = useState(false)
  const meta = agentMeta(trace.agent_type)
  const invoked = new Date(trace.invoked_at)

  return (
    <>
      <tr className="ab-trace-row" onClick={() => setOpen(v => !v)}>
        <td>
          <span className="ab-agent-chip">{meta.label}</span>
        </td>
        <td className="ab-mono">{trace.trace_id.slice(0, 12)}…</td>
        <td>{trace.workflow_instance_id ? <span className="ab-mono">{trace.workflow_instance_id.slice(0, 12)}…</span> : <span className="ab-muted">—</span>}</td>
        <td>{invoked.toLocaleDateString()} {invoked.toLocaleTimeString()}</td>
        <td>
          <span className="ab-stat"><Clock size={12} /> {trace.duration_ms} ms</span>
        </td>
        <td>
          <span className="ab-stat"><Zap size={12} /> {(trace.prompt_tokens ?? 0) + (trace.completion_tokens ?? 0)}</span>
        </td>
        <td className="ab-toggle-cell">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>
      {open && (
        <tr className="ab-trace-detail">
          <td colSpan={7}>
            <pre className="ab-json">{JSON.stringify(trace.output, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Test-invoke modal ─────────────────────────────────────────────────────────

interface InvokeModalProps {
  open: boolean
  onClose: () => void
  initialType?: string
  availableTypes: string[]
  pipelineAgents: { id: string; name: string; description: string }[]
}

function InvokeModal({ open, onClose, initialType, availableTypes, pipelineAgents }: InvokeModalProps) {
  const getExample = (t: string) => {
    if (t.startsWith('pipeline:')) {
      const pl = pipelineAgents.find(p => p.id === t)
      return pl ? pipelineExampleInput(pl.name) : { input_key: 'value' }
    }
    return agentMeta(t).exampleInput
  }

  const [agentType, setAgentType] = useState(initialType ?? availableTypes[0] ?? '')
  const [inputJson, setInputJson] = useState(() => JSON.stringify(getExample(initialType ?? ''), null, 2))
  const [result, setResult] = useState<any>(null)
  const [parseError, setParseError] = useState('')

  const handleTypeChange = (t: string) => {
    setAgentType(t)
    setInputJson(JSON.stringify(getExample(t), null, 2))
    setResult(null)
    setParseError('')
  }

  const mutation = useMutation({
    mutationFn: (body: object) => agentApi.invoke(body),
    onSuccess: (data) => setResult(data),
  })

  const handleInvoke = () => {
    setParseError('')
    let parsed: object
    try {
      parsed = JSON.parse(inputJson)
    } catch (e: any) {
      setParseError(e.message)
      return
    }
    mutation.mutate({ agent_type: agentType, input: parsed })
  }

  const handleClose = () => {
    setResult(null)
    setParseError('')
    mutation.reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Test Agent Invocation">
      <div className="ab-invoke-form">
        <label className="ab-label">Agent type</label>
        <select
          className="ab-select"
          value={agentType}
          onChange={e => handleTypeChange(e.target.value)}
          disabled={mutation.isPending}
        >
          {availableTypes.map(t => (
            <option key={t} value={t}>{agentMeta(t).label}</option>
          ))}
        </select>

        <label className="ab-label">
          Input JSON
          <button className="ab-fill-example" onClick={() => setInputJson(JSON.stringify(getExample(agentType), null, 2))}>
            fill example
          </button>
        </label>
        <textarea
          className="ab-json-input"
          value={inputJson}
          onChange={e => { setInputJson(e.target.value); setParseError('') }}
          rows={10}
          spellCheck={false}
          disabled={mutation.isPending}
        />
        {parseError && (
          <div className="ab-parse-error"><AlertCircle size={12} /> {parseError}</div>
        )}

        <div className="ab-invoke-actions">
          <Button variant="ghost" onClick={handleClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" onClick={handleInvoke} disabled={mutation.isPending}>
            {mutation.isPending ? <><Loader2 size={14} className="ab-spin" /> Running…</> : <><Play size={14} /> Invoke</>}
          </Button>
        </div>

        {mutation.isError && (
          <div className="ab-invoke-error">
            <AlertCircle size={14} />
            <span>{(mutation.error as Error).message}</span>
          </div>
        )}

        {result && (
          <div className="ab-invoke-result">
            <div className="ab-result-meta">
              <span><Clock size={12} /> {result.duration_ms} ms</span>
              <span><Zap size={12} /> {result.prompt_tokens + result.completion_tokens} tokens</span>
              <span className="ab-mono ab-muted">{result.trace_id?.slice(0, 16)}…</span>
            </div>
            <pre className="ab-json">{JSON.stringify(result.output, null, 2)}</pre>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AgentPlayground() {
  const qc = useQueryClient()
  const [filterType, setFilterType] = useState<string>('')
  const [invokeOpen, setInvokeOpen] = useState(false)
  const [invokeType, setInvokeType] = useState<string | undefined>(undefined)

  const { data: typesData } = useQuery({
    queryKey: ['agent-types'],
    queryFn: () => agentApi.listTypes(),
  })

  const builtinTypes   = typesData?.types ?? []
  const pipelineAgents: { id: string; name: string; description: string }[] = typesData?.pipelines ?? []
  const availableTypes = [...builtinTypes, ...pipelineAgents.map(p => p.id)]

  const traceParams: Record<string, string> = {}
  if (filterType) traceParams.agent_type = filterType
  traceParams.limit = '100'

  const { data: traces, isLoading, refetch } = useQuery({
    queryKey: ['agent-traces', filterType],
    queryFn: () => agentApi.listTraces(traceParams),
    refetchInterval: 30_000,
  })

  const openInvoke = (type?: string) => {
    setInvokeType(type)
    setInvokeOpen(true)
  }

  return (
    <div className="page ab-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Bot size={20} style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--color-accent)' }} />
            Agent Playground
          </h1>
          <p className="page-subtitle">Test and monitor GxP AI agents used in workflow automation</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" onClick={() => { qc.invalidateQueries({ queryKey: ['agent-traces'] }) }}>
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button variant="primary" onClick={() => openInvoke()}>
            <Play size={14} /> Test Invoke
          </Button>
        </div>
      </div>

      {/* Agent registry cards */}
      <div className="ab-registry">
        <button
          className={`ab-agent-card ${filterType === '' ? 'ab-agent-card-active' : ''}`}
          onClick={() => setFilterType('')}
        >
          <div className="ab-card-icon"><Bot size={20} /></div>
          <div className="ab-card-body">
            <div className="ab-card-label">All Agents</div>
            <div className="ab-card-desc">Show traces for all agent types</div>
          </div>
        </button>
        {builtinTypes.map(type => {
          const meta = agentMeta(type)
          return (
            <button
              key={type}
              className={`ab-agent-card ${filterType === type ? 'ab-agent-card-active' : ''}`}
              onClick={() => setFilterType(prev => prev === type ? '' : type)}
            >
              <div className="ab-card-icon"><Bot size={20} /></div>
              <div className="ab-card-body">
                <div className="ab-card-label">{meta.label}</div>
                <div className="ab-card-desc">{meta.description}</div>
              </div>
              <button className="ab-card-run" title="Test invoke" onClick={e => { e.stopPropagation(); openInvoke(type) }}>
                <Play size={12} />
              </button>
            </button>
          )
        })}
        {pipelineAgents.length > 0 && (
          <>
            <div className="ab-registry-divider">
              <span>Visual Pipelines</span>
            </div>
            {pipelineAgents.map(p => {
              const hasExample = Object.keys(pipelineExampleInput(p.name)).length > 1
              return (
                <button
                  key={p.id}
                  className={`ab-agent-card ab-agent-card-pipeline ${filterType === p.id ? 'ab-agent-card-active' : ''}`}
                  onClick={() => setFilterType(prev => prev === p.id ? '' : p.id)}
                >
                  <div className="ab-card-icon"><Bot size={20} /></div>
                  <div className="ab-card-body">
                    <div className="ab-card-label">{p.name}</div>
                    <div className="ab-card-desc">{p.description || 'Visual agent pipeline'}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      <span className="ab-pipeline-tag">Pipeline</span>
                      {hasExample && <span className="ab-pipeline-tag" style={{ background: '#dcfce7', color: '#16a34a', borderColor: '#86efac' }}>example ready</span>}
                    </div>
                  </div>
                  <button className="ab-card-run" title="Test invoke" onClick={e => { e.stopPropagation(); openInvoke(p.id) }}>
                    <Play size={12} />
                  </button>
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* Trace history */}
      <div className="card">
        <div className="ab-table-header">
          <span className="ab-table-title">
            Invocation History
            {filterType && <span style={{ marginLeft: 8 }}><Badge variant="info">{agentMeta(filterType).label}</Badge></span>}
          </span>
          {isLoading && <Loader2 size={14} className="ab-spin" style={{ color: 'var(--color-slate-400)' }} />}
        </div>

        {!isLoading && (!traces || traces.length === 0) ? (
          <div className="ab-empty">
            <Bot size={32} style={{ color: 'var(--color-slate-300)', marginBottom: 8 }} />
            <p>No invocations recorded yet.</p>
            <p className="ab-muted">Agents run automatically when workflow nodes execute, or use Test Invoke above.</p>
          </div>
        ) : (
          <div className="ab-table-scroll">
            <table className="ab-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Trace ID</th>
                  <th>Workflow Instance</th>
                  <th>Invoked At</th>
                  <th>Duration</th>
                  <th>Tokens</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {traces?.map(t => <TraceRow key={t.id} trace={t} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InvokeModal
        open={invokeOpen}
        onClose={() => setInvokeOpen(false)}
        initialType={invokeType ?? availableTypes[0]}
        availableTypes={availableTypes}
        pipelineAgents={pipelineAgents}
      />
    </div>
  )
}
