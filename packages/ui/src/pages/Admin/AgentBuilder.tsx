import { useCallback, useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow,
  Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
  Handle, Position, MarkerType, BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './AgentBuilder.css'
import {
  Plus, Save, Trash2, X, Play, Loader2, AlertCircle,
  LogIn, MessageSquare, Cpu, Code2, GitBranch, LogOut,
  Globe, Shuffle, Workflow,
} from 'lucide-react'
import { agentApi } from '../../api/client'
import { Button } from '../../design-system'

// ── Node type definitions ────────────────────────────────────────────────────

const NODE_DEFS = [
  // Core pipeline nodes
  { type: 'ap_input',     label: 'Input',     color: '#0369a1', Icon: LogIn,        desc: 'Receive context',    group: 'core' },
  { type: 'ap_prompt',    label: 'Prompt',    color: '#4338ca', Icon: MessageSquare, desc: 'Build LLM messages', group: 'core' },
  { type: 'ap_llm',       label: 'LLM Call',  color: '#0f766e', Icon: Cpu,           desc: 'Run model',          group: 'core' },
  { type: 'ap_extract',   label: 'Extract',   color: '#6d28d9', Icon: Code2,         desc: 'Parse output',       group: 'core' },
  { type: 'ap_condition', label: 'Condition', color: '#b45309', Icon: GitBranch,     desc: 'Branch logic',       group: 'core' },
  { type: 'ap_output',    label: 'Output',    color: '#166534', Icon: LogOut,        desc: 'Return result',      group: 'core' },
  // Tool nodes
  { type: 'ap_http',      label: 'HTTP',      color: '#0e7490', Icon: Globe,         desc: 'Call REST API',      group: 'tool' },
  { type: 'ap_transform', label: 'Transform', color: '#9333ea', Icon: Shuffle,       desc: 'Reshape data',       group: 'tool' },
]

const DEF_BY_TYPE = Object.fromEntries(NODE_DEFS.map(d => [d.type, d]))

// Short class names for CSS header colors
const TYPE_SHORT: Record<string, string> = {
  ap_input: 'input', ap_prompt: 'prompt', ap_llm: 'llm',
  ap_extract: 'extract', ap_condition: 'condition', ap_output: 'output',
  ap_http: 'http', ap_transform: 'transform',
}

// ── Node component — same structure as wf-node ────────────────────────────────

function AgentNode({ data, type, selected }: { data: any; type: string; selected?: boolean }) {
  const def = DEF_BY_TYPE[type] ?? { label: type, color: '#64748b', Icon: Workflow }
  const cfg  = data.config ?? {}
  const { Icon } = def
  const short   = TYPE_SHORT[type] ?? type.replace('ap_', '')
  const isInput  = type === 'ap_input'
  const isOutput = type === 'ap_output'

  let preview = ''
  if (type === 'ap_prompt' && cfg.template)
    preview = cfg.template.slice(0, 36) + (cfg.template.length > 36 ? '…' : '')
  else if (type === 'ap_llm')
    preview = `→ ${cfg.output_key || 'llm_response'}`
  else if (type === 'ap_extract')
    preview = `${cfg.mode || 'json'} → ${cfg.output_key || 'extracted'}`
  else if (type === 'ap_condition' && cfg.expression)
    preview = cfg.expression.slice(0, 30)
  else if (type === 'ap_output')
    preview = `${(cfg.mappings ?? []).length} mapping${(cfg.mappings ?? []).length !== 1 ? 's' : ''}`
  else if (type === 'ap_http' && cfg.url)
    preview = `${cfg.method || 'GET'} ${cfg.url.slice(0, 22)}${cfg.url.length > 22 ? '…' : ''}`
  else if (type === 'ap_transform' && cfg.expression)
    preview = cfg.expression.slice(0, 30)

  return (
    <div className={`ab-node abn-${short}${selected ? ' selected' : ''}`}>
      {!isInput  && <Handle type="target" position={Position.Left}
        style={{ background: def.color, width: 8, height: 8, border: '2px solid #fff' }} />}
      <div className="ab-node-header">
        <Icon size={10} strokeWidth={2.5} />
        <span>{def.label}</span>
      </div>
      <div className="ab-node-body">
        <div className="ab-node-label">
          {data.label || <span className="ab-node-unnamed">untitled</span>}
        </div>
        <div className="ab-node-desc">{def.desc}</div>
        {preview && <div className="ab-node-preview">{preview}</div>}
      </div>
      {!isOutput && <Handle type="source" position={Position.Right}
        style={{ background: def.color, width: 8, height: 8, border: '2px solid #fff' }} />}
    </div>
  )
}

const nodeTypes = Object.fromEntries(NODE_DEFS.map(d => [
  d.type,
  (props: any) => <AgentNode {...props} type={d.type} />,
]))

// ── Node palette ──────────────────────────────────────────────────────────────

function NodePalette() {
  const coreNodes = NODE_DEFS.filter(d => d.group === 'core')
  const toolNodes = NODE_DEFS.filter(d => d.group === 'tool')

  const Item = ({ def }: { def: (typeof NODE_DEFS)[0] }) => (
    <div
      className="ab-palette-item"
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('ap-type', def.type)
        e.dataTransfer.setData('ap-label', def.label)
      }}
    >
      <div className="ab-palette-dot" style={{ background: def.color }} />
      <div>
        <div className="ab-palette-label">{def.label}</div>
        <div className="ab-palette-desc">{def.desc}</div>
      </div>
    </div>
  )

  return (
    <div className="ab-palette">
      <div className="ab-palette-title">Node Types</div>
      {coreNodes.map(d => <Item key={d.type} def={d} />)}
      <div className="ab-palette-section">Tools</div>
      {toolNodes.map(d => <Item key={d.type} def={d} />)}
    </div>
  )
}

// ── Config panel ──────────────────────────────────────────────────────────────

interface MappingRow { from: string; to: string }

function ConfigPanel({ node, onUpdateConfig, onUpdateLabel, onClose }: {
  node: Node
  onUpdateConfig: (id: string, cfg: any) => void
  onUpdateLabel: (id: string, label: string) => void
  onClose: () => void
}) {
  const type  = node.type ?? ''
  const cfg   = (node.data?.config as any) ?? {}
  const label = (node.data?.label as string) ?? ''
  const upd   = (key: string, val: any) => onUpdateConfig(node.id, { ...cfg, [key]: val })
  const def   = DEF_BY_TYPE[type] ?? { label: type, color: '#64748b' }

  return (
    <div className="ab-config-panel">
      <div className="ab-config-hd" style={{ '--node-header-bg': def.color } as React.CSSProperties}>
        <span className="ab-config-hd-label">{def.label}</span>
        <button className="ab-config-close" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="ab-config-body">

        {/* Label — all types */}
        <div className="form-field">
          <label className="form-label">Label</label>
          <input className="form-input" value={label} onChange={e => onUpdateLabel(node.id, e.target.value)} placeholder="e.g. Build review prompt" />
        </div>

        {/* ap_prompt */}
        {type === 'ap_prompt' && <>
          <div className="form-field">
            <label className="form-label">System Message <span style={{ fontWeight: 400, fontSize: 10, color: '#94a3b8' }}>(optional)</span></label>
            <textarea className="form-textarea" rows={2} value={cfg.system_message ?? ''} onChange={e => upd('system_message', e.target.value)} placeholder="You are a GxP compliance expert..." />
          </div>
          <div className="form-field">
            <label className="form-label">Prompt Template</label>
            <textarea className="form-textarea" rows={5} value={cfg.template ?? ''} onChange={e => upd('template', e.target.value)}
              placeholder={"Review {{cert_name}} (type: {{cert_type}}).\n\nReturn JSON with risk_score (1-10)."} />
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>Use <code>{'{{variable}}'}</code> to inject context keys.</div>
          </div>
          <div className="form-field">
            <label className="form-label">Role</label>
            <select className="form-select" value={cfg.role ?? 'user'} onChange={e => upd('role', e.target.value)}>
              <option value="user">user</option>
              <option value="assistant">assistant</option>
            </select>
          </div>
        </>}

        {/* ap_llm */}
        {type === 'ap_llm' && <>
          <div className="form-field">
            <label className="form-label">Model</label>
            <select className="form-select" value={cfg.model ?? ''} onChange={e => upd('model', e.target.value)}>
              <option value="">Default (gpt-4.1-mini)</option>
              <option value="gpt-4.1-mini">gpt-4.1-mini — fast, cost-effective</option>
              <option value="gpt-4o">gpt-4o — most capable</option>
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">Max Tokens</label>
            <input className="form-input" type="number" style={{ fontFamily: 'monospace', fontSize: 12 }} value={cfg.max_tokens ?? ''} onChange={e => upd('max_tokens', e.target.value ? Number(e.target.value) : undefined)} placeholder="512" />
          </div>
          <div className="form-field">
            <label className="form-label">Temperature</label>
            <input className="form-input" type="number" step="0.1" min="0" max="2" style={{ fontFamily: 'monospace', fontSize: 12 }} value={cfg.temperature ?? ''} onChange={e => upd('temperature', e.target.value ? Number(e.target.value) : undefined)} placeholder="0.1" />
          </div>
          <div className="form-field">
            <label className="form-label">Output Key</label>
            <input className="form-input" style={{ fontFamily: 'monospace', fontSize: 12 }} value={cfg.output_key ?? 'llm_response'} onChange={e => upd('output_key', e.target.value)} placeholder="llm_response" />
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>Context key where the raw LLM text is stored.</div>
          </div>
        </>}

        {/* ap_extract */}
        {type === 'ap_extract' && <>
          <div className="form-field">
            <label className="form-label">Source Key</label>
            <input className="form-input" style={{ fontFamily: 'monospace', fontSize: 12 }} value={cfg.source_key ?? 'llm_response'} onChange={e => upd('source_key', e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Mode</label>
            <select className="form-select" value={cfg.mode ?? 'json'} onChange={e => upd('mode', e.target.value)}>
              <option value="json">JSON parse</option>
              <option value="field">Field pick</option>
              <option value="raw">Raw (pass through)</option>
            </select>
          </div>
          {cfg.mode === 'field' && (
            <div className="form-field">
              <label className="form-label">Field Name</label>
              <input className="form-input" style={{ fontFamily: 'monospace', fontSize: 12 }} value={cfg.field ?? ''} onChange={e => upd('field', e.target.value)} />
            </div>
          )}
          <div className="form-field">
            <label className="form-label">Output Key</label>
            <input className="form-input" style={{ fontFamily: 'monospace', fontSize: 12 }} value={cfg.output_key ?? 'extracted'} onChange={e => upd('output_key', e.target.value)} />
          </div>
        </>}

        {/* ap_condition */}
        {type === 'ap_condition' && <>
          <div className="form-field">
            <label className="form-label">Expression</label>
            <input className="form-input" style={{ fontFamily: 'monospace', fontSize: 12 }} value={cfg.expression ?? ''} onChange={e => upd('expression', e.target.value)} placeholder="risk_score > 7" />
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>Evaluated against context. Result stored as <code>condition_result</code>.</div>
          </div>
        </>}

        {/* ap_output */}
        {type === 'ap_output' && <>
          <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>Map context keys to output fields. Leave empty to return all.</div>
          {((cfg.mappings ?? []) as MappingRow[]).map((m, i) => (
            <div key={i} className="ab-mapping-row">
              <input className="form-input" style={{ fontFamily: 'monospace', fontSize: 11, flex: 1 }} placeholder="from" value={m.from}
                onChange={e => { const rows = [...(cfg.mappings ?? [])]; rows[i] = { ...rows[i], from: e.target.value }; upd('mappings', rows) }} />
              <span className="ab-mapping-arrow">→</span>
              <input className="form-input" style={{ fontFamily: 'monospace', fontSize: 11, flex: 1 }} placeholder="to" value={m.to}
                onChange={e => { const rows = [...(cfg.mappings ?? [])]; rows[i] = { ...rows[i], to: e.target.value }; upd('mappings', rows) }} />
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}
                onClick={() => upd('mappings', (cfg.mappings ?? []).filter((_: any, idx: number) => idx !== i))}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button className="ab-add-mapping"
            onClick={() => upd('mappings', [...(cfg.mappings ?? []), { from: '', to: '' }])}>
            <Plus size={11} /> Add mapping
          </button>
        </>}

        {/* ap_http */}
        {type === 'ap_http' && <>
          <div className="form-field">
            <label className="form-label">Method</label>
            <select className="form-select" value={cfg.method ?? 'GET'} onChange={e => upd('method', e.target.value)}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">URL</label>
            <input className="form-input" style={{ fontFamily: 'monospace', fontSize: 12 }} value={cfg.url ?? ''} onChange={e => upd('url', e.target.value)} placeholder="https://api.example.com/{{resource_id}}" />
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>Use <code>{'{{variable}}'}</code> for context values.</div>
          </div>
          {['POST', 'PUT', 'PATCH'].includes(cfg.method ?? 'GET') && (
            <div className="form-field">
              <label className="form-label">Body Template (JSON)</label>
              <textarea className="form-textarea" rows={4} style={{ fontFamily: 'monospace', fontSize: 11 }}
                value={cfg.body_template ?? ''} onChange={e => upd('body_template', e.target.value)}
                placeholder={'{"id": "{{resource_id}}", "status": "{{status}}"}'} />
            </div>
          )}
          <div className="form-field">
            <label className="form-label">Output Key</label>
            <input className="form-input" style={{ fontFamily: 'monospace', fontSize: 12 }} value={cfg.output_key ?? 'http_response'} onChange={e => upd('output_key', e.target.value)} />
          </div>
        </>}

        {/* ap_transform */}
        {type === 'ap_transform' && <>
          <div className="form-field">
            <label className="form-label">Expression</label>
            <textarea className="form-textarea" rows={4} style={{ fontFamily: 'monospace', fontSize: 12 }}
              value={cfg.expression ?? ''} onChange={e => upd('expression', e.target.value)}
              placeholder={"{'score': extracted.get('risk_score', 0), 'flag': extracted.get('risk_score', 0) > 7}"} />
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>Python expression evaluated against context. Access any key directly by name.</div>
          </div>
          <div className="form-field">
            <label className="form-label">Output Key</label>
            <input className="form-input" style={{ fontFamily: 'monospace', fontSize: 12 }} value={cfg.output_key ?? 'transformed'} onChange={e => upd('output_key', e.target.value)} />
          </div>
        </>}

        <div className="form-field">
          <label className="form-label" style={{ color: '#94a3b8' }}>Node ID</label>
          <input className="form-input" value={node.id} readOnly
            style={{ background: 'var(--surface-muted)', fontFamily: 'monospace', fontSize: 10, color: '#94a3b8' }} />
        </div>
      </div>
    </div>
  )
}

// ── Main AgentBuilder page ─────────────────────────────────────────────────────

let _nodeCounter = 100

export function AgentBuilder() {
  const qc = useQueryClient()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newOpen, setNewOpen]   = useState(false)
  const [newName, setNewName]   = useState('')
  const [newDesc, setNewDesc]   = useState('')

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode]  = useState<Node | null>(null)
  const [saveMsg, setSaveMsg]            = useState('')
  const rfInstance = useRef<any>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [testOpen, setTestOpen]     = useState(false)
  const [testInput, setTestInput]   = useState('{}')
  const [testResult, setTestResult] = useState<any>(null)
  const [testRunning, setTestRunning] = useState(false)
  const [testError, setTestError]   = useState('')

  const { data: pipelines, isLoading } = useQuery({
    queryKey: ['agent-pipelines'],
    queryFn: agentApi.listPipelines,
  })

  const createMutation = useMutation({
    mutationFn: () => agentApi.createPipeline({
      name: newName, description: newDesc,
      pipeline: { nodes: [
        { id: 'start', type: 'ap_input',  label: 'Input',  config: {}, position: { x: 60,  y: 150 } },
        { id: 'end',   type: 'ap_output', label: 'Output', config: {}, position: { x: 480, y: 150 } },
      ], edges: [] },
    }),
    onSuccess: (p: any) => {
      qc.invalidateQueries({ queryKey: ['agent-pipelines'] })
      qc.invalidateQueries({ queryKey: ['agent-types'] })
      setNewOpen(false); setNewName(''); setNewDesc('')
      loadPipeline(p)
    },
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const graph = {
        nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.data?.label, config: n.data?.config, position: n.position })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
      }
      return agentApi.updatePipeline(selectedId!, { pipeline: graph })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-pipelines'] })
      qc.invalidateQueries({ queryKey: ['agent-types'] })
      setSaveMsg('Saved'); setTimeout(() => setSaveMsg(''), 2000)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => agentApi.deletePipeline(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-pipelines'] })
      qc.invalidateQueries({ queryKey: ['agent-types'] })
      setSelectedId(null); setNodes([] as Node[]); setEdges([] as Edge[])
    },
  })

  const loadPipeline = (p: any) => {
    setSelectedId(p.id)
    const ns: Node[] = (p.pipeline?.nodes ?? []).map((n: any) => ({
      id: n.id, type: n.type, position: n.position ?? { x: 0, y: 0 },
      data: { label: n.label ?? '', config: n.config ?? {} },
    }))
    const es: Edge[] = (p.pipeline?.edges ?? []).map((e: any) => ({
      id: e.id, source: e.source, target: e.target,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    }))
    setNodes(ns); setEdges(es); setSelectedNode(null)
    // Fit view after nodes render — generous padding so a 2-node pipeline isn't zoomed in
    setTimeout(() => rfInstance.current?.fitView({ padding: 0.45, duration: 250, maxZoom: 1.0 }), 80)
  }

  const onConnect = useCallback((conn: Connection) => {
    setEdges(eds => addEdge({
      ...conn, type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    } as Edge, eds as Edge[]) as Edge[])
  }, [setEdges])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type  = e.dataTransfer.getData('ap-type')
    const label = e.dataTransfer.getData('ap-label')
    if (!type || !rfInstance.current) return
    const pos = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setNodes(nds => [...nds, {
      id: `node_${++_nodeCounter}`, type, position: pos,
      data: { label, config: {} },
    }])
  }, [setNodes])

  const updateNodeConfig = useCallback((nodeId: string, config: any) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, config } } : n))
  }, [setNodes])

  const updateNodeLabel = useCallback((nodeId: string, label: string) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, label } } : n))
  }, [setNodes])

  const runTest = async () => {
    if (!selectedId) return
    setTestRunning(true); setTestError(''); setTestResult(null)
    try {
      let input: any
      try { input = JSON.parse(testInput) } catch { setTestError('Invalid JSON input'); setTestRunning(false); return }
      const result = await agentApi.invoke({ agent_type: `pipeline:${selectedId}`, input })
      setTestResult(result)
    } catch (e: any) {
      setTestError(e.message ?? 'Invocation failed')
    } finally {
      setTestRunning(false)
    }
  }

  const selected = (pipelines ?? []).find((p: any) => p.id === selectedId)
  const liveSelectedNode = selectedNode ? nodes.find(n => n.id === selectedNode.id) ?? null : null

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

      {/* ── Pipeline list sidebar ─────────────────────────────────────────── */}
      <div className="ab-builder-sidebar">
        <div className="ab-builder-sidebar-hd">
          <span className="ab-builder-sidebar-title">Agent Pipelines</span>
          <button onClick={() => setNewOpen(true)}
            style={{ background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 5, padding: '3px 9px', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Plus size={11} /> New
          </button>
        </div>
        <div className="ab-builder-sidebar-body">
          {isLoading && (
            <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8' }}>
              <Loader2 size={14} className="ab-spin" />
            </div>
          )}
          {(pipelines ?? []).length === 0 && !isLoading && (
            <div style={{ padding: '24px 16px', color: '#94a3b8', fontSize: 12.5, textAlign: 'center', lineHeight: 1.6 }}>
              No pipelines yet.<br />Click <strong>New</strong> to get started.
            </div>
          )}
          {(pipelines ?? []).map((p: any) => (
            <button key={p.id}
              className={`ab-pl-item${selectedId === p.id ? ' selected' : ''}`}
              onClick={() => loadPipeline(p)}>
              <div className="ab-pl-name">{p.name}</div>
              {p.description && <div className="ab-pl-desc">{p.description}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Editor area ───────────────────────────────────────────────────── */}
      {!selectedId ? (
        <div className="ab-empty-state">
          <div className="ab-empty-icon"><Workflow size={28} /></div>
          <div className="ab-empty-title">Select or create a pipeline</div>
          <div className="ab-empty-sub">Visual pipelines run as <code>agent_step</code> nodes inside workflows</div>
          <Button variant="primary" size="sm" style={{ marginTop: 6 }} onClick={() => setNewOpen(true)}>
            <Plus size={13} /> New Pipeline
          </Button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Toolbar */}
          <div className="ab-toolbar">
            <div className="ab-toolbar-info">
              <span className="ab-toolbar-name">{selected?.name}</span>
              {selected?.description && <>
                <span className="ab-toolbar-sep">/</span>
                <span className="ab-toolbar-desc">{selected.description}</span>
              </>}
            </div>
            <div className="ab-toolbar-actions">
              {saveMsg && <span className="ab-save-msg">✓ {saveMsg}</span>}
              <Button variant="ghost" size="sm" onClick={() => setTestOpen(true)}>
                <Play size={13} /> Test Run
              </Button>
              <Button variant="ghost" size="sm" style={{ color: 'var(--color-danger, #b91c1c)' }}
                onClick={() => { if (confirm('Delete this pipeline?')) deleteMutation.mutate(selectedId) }}>
                <Trash2 size={13} />
              </Button>
              <Button variant="primary" size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                <Save size={13} /> Save & Register
              </Button>
            </div>
          </div>

          {/* Canvas + palette + config panel */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <NodePalette />
            <div ref={wrapperRef} className="ab-canvas-wrap">
              <ReactFlow
                nodes={nodes} edges={edges}
                onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                onConnect={onConnect} onInit={r => { rfInstance.current = r }}
                onDrop={onDrop} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onNodeClick={(_, n) => setSelectedNode(n)}
                onPaneClick={() => setSelectedNode(null)}
                nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.45, maxZoom: 1.0 }} deleteKeyCode="Delete"
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#cbd5e1" />
                <Controls style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }} />
                <MiniMap
                  nodeColor={n => DEF_BY_TYPE[n.type ?? '']?.color ?? '#94a3b8'}
                  style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 8 }}
                />
              </ReactFlow>
            </div>
            {liveSelectedNode && (
              <ConfigPanel
                node={liveSelectedNode}
                onUpdateConfig={updateNodeConfig}
                onUpdateLabel={updateNodeLabel}
                onClose={() => setSelectedNode(null)}
              />
            )}
          </div>
        </div>
      )}

      {/* ── New pipeline modal ────────────────────────────────────────────── */}
      {newOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setNewOpen(false) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title">New Agent Pipeline</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setNewOpen(false)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label className="form-label required">Name</label>
                <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Certificate Review Agent" autoFocus />
              </div>
              <div className="form-field">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" rows={2} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Reviews certificate requests for compliance..." />
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button variant="primary" loading={createMutation.isPending} disabled={!newName.trim()} onClick={() => createMutation.mutate()}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Test run modal ────────────────────────────────────────────────── */}
      {testOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setTestOpen(false) }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2 className="modal-title">Test Run — {selected?.name}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setTestOpen(false)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>
                Save first, then provide JSON context to test end-to-end via the agent service.
              </p>
              <div className="form-field">
                <label className="form-label">Input Context (JSON)</label>
                <textarea className="form-textarea" rows={6} value={testInput} onChange={e => setTestInput(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  placeholder={'{\n  "cert_name": "ISO 9001",\n  "cert_type": "Quality"\n}'} />
              </div>
              {testError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5 }}>
                  <AlertCircle size={13} /> {testError}
                </div>
              )}
              {testResult && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'flex', gap: 12 }}>
                    <span>✓ {testResult.duration_ms} ms</span>
                    <span>{(testResult.prompt_tokens ?? 0) + (testResult.completion_tokens ?? 0)} tokens</span>
                  </div>
                  <pre style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 7, padding: 12, fontSize: 11, maxHeight: 220, overflowY: 'auto', margin: 0, lineHeight: 1.5 }}>
                    {JSON.stringify(testResult.output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setTestOpen(false)}>Close</Button>
              <Button variant="primary" loading={testRunning} onClick={runTest}><Play size={13} /> Run</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
