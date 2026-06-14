import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Node } from '@xyflow/react'
import { X, Plus, Trash2, GripVertical } from 'lucide-react'
import { agentApi } from '../../api/client'

const TYPE_COLORS: Record<string, string> = {
  start: '#15803d', end: '#0f2040', task: '#0369a1',
  gateway: '#b45309', timer: '#7c3aed', agent_step: '#0891b2', esign: '#be185d',
  integration: '#0e7490', logic: '#9333ea',
}

const BUILTIN_AGENT_TYPES = ['deviation_triage', 'rca_drafting', 'capa_suggestion', 'sop_rag', 'batch_anomaly', 'cert_review']
const ROLES = ['operator', 'qa_manager', 'admin', 'auditor', 'supplier']
const HTTP_METHODS = ['POST', 'GET', 'PUT', 'PATCH', 'DELETE']

// ── Field types the builder supports ─────────────────────────────────────────
const FIELD_TYPES = [
  { value: 'text',     label: 'Text (single line)' },
  { value: 'textarea', label: 'Text (multi-line)' },
  { value: 'number',   label: 'Number' },
  { value: 'boolean',  label: 'Checkbox (yes/no)' },
  { value: 'date',     label: 'Date' },
  { value: 'dropdown', label: 'Dropdown (choices)' },
]

interface FieldDef {
  key: string
  title: string
  type: string
  required: boolean
  options: string   // comma-separated, only for dropdown
}

function schemaToFields(schema: any): FieldDef[] {
  if (!schema?.properties) return []
  return Object.entries(schema.properties).map(([key, prop]: [string, any]) => {
    let type = 'text'
    if (prop.type === 'number' || prop.type === 'integer') type = 'number'
    else if (prop.type === 'boolean') type = 'boolean'
    else if (prop.format === 'date') type = 'date'
    else if (prop.format === 'textarea') type = 'textarea'
    else if (prop.enum) type = 'dropdown'
    return {
      key,
      title: prop.title ?? key,
      type,
      required: (schema.required ?? []).includes(key),
      options: prop.enum ? prop.enum.join(', ') : '',
    }
  })
}

function fieldsToSchema(fields: FieldDef[]): any {
  const properties: Record<string, any> = {}
  const required: string[] = []
  for (const f of fields) {
    if (!f.key.trim()) continue
    let prop: any = {}
    if (f.type === 'number')   prop = { type: 'number',  title: f.title }
    else if (f.type === 'boolean')  prop = { type: 'boolean', title: f.title }
    else if (f.type === 'date')     prop = { type: 'string',  title: f.title, format: 'date' }
    else if (f.type === 'textarea') prop = { type: 'string',  title: f.title, format: 'textarea' }
    else if (f.type === 'dropdown') {
      const opts = f.options.split(',').map(o => o.trim()).filter(Boolean)
      prop = { type: 'string', title: f.title, enum: opts }
    } else {
      prop = { type: 'string', title: f.title }
    }
    properties[f.key.trim()] = prop
    if (f.required) required.push(f.key.trim())
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

// ── Form Schema Builder component ─────────────────────────────────────────────
function FormSchemaBuilder({ schema, onChange }: { schema: any; onChange: (s: any) => void }) {
  const [fields, setFields] = useState<FieldDef[]>(() => schemaToFields(schema))

  const commit = (updated: FieldDef[]) => {
    setFields(updated)
    onChange(fieldsToSchema(updated))
  }

  const addField = () => commit([...fields, { key: '', title: '', type: 'text', required: false, options: '' }])

  const removeField = (i: number) => commit(fields.filter((_, idx) => idx !== i))

  const updateField = (i: number, patch: Partial<FieldDef>) =>
    commit(fields.map((f, idx) => idx === i ? { ...f, ...patch } : f))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map((f, i) => (
        <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 10px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <GripVertical size={12} style={{ color: 'var(--color-slate-300)', flexShrink: 0 }} />
            <input
              className="form-input"
              placeholder="field_key (no spaces)"
              value={f.key}
              style={{ fontFamily: 'monospace', fontSize: 11, flex: 1 }}
              onChange={e => updateField(i, { key: e.target.value.replace(/\s/g, '_') })}
            />
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', padding: 2, flexShrink: 0 }}
              onClick={() => removeField(i)}
            >
              <Trash2 size={13} />
            </button>
          </div>
          <input
            className="form-input"
            placeholder="Label shown to user"
            value={f.title}
            style={{ fontSize: 12 }}
            onChange={e => updateField(i, { title: e.target.value })}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              className="form-select"
              value={f.type}
              style={{ fontSize: 12, flex: 1 }}
              onChange={e => updateField(i, { type: e.target.value, options: '' })}
            >
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.required} onChange={e => updateField(i, { required: e.target.checked })} />
              Required
            </label>
          </div>
          {f.type === 'dropdown' && (
            <input
              className="form-input"
              placeholder="Option A, Option B, Option C"
              value={f.options}
              style={{ fontSize: 11 }}
              onChange={e => updateField(i, { options: e.target.value })}
            />
          )}
        </div>
      ))}
      <button
        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-primary)', background: 'none', border: '1px dashed var(--border-color)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
        onClick={addField}
      >
        <Plus size={13} /> Add field
      </button>
      {fields.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ fontSize: 10, color: 'var(--color-slate-400)', cursor: 'pointer' }}>Preview JSON Schema</summary>
          <pre style={{ fontSize: 10, background: '#0f172a', color: '#e2e8f0', borderRadius: 4, padding: 8, marginTop: 4, overflow: 'auto', maxHeight: 200 }}>
            {JSON.stringify(fieldsToSchema(fields), null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
interface Props {
  node: Node
  onUpdateConfig: (id: string, config: Record<string, any>) => void
  onUpdateLabel: (id: string, label: string) => void
  onClose: () => void
}

export function NodeConfigPanel({ node, onUpdateConfig, onUpdateLabel, onClose }: Props) {
  const config: Record<string, any> = (node.data?.config as any) ?? {}
  const label: string = (node.data?.label as string) ?? ''
  const type: string = node.type ?? 'task'

  const { data: typesData } = useQuery({
    queryKey: ['agent-types'],
    queryFn: agentApi.listTypes,
    staleTime: 30_000,
  })
  const pipelineAgents = typesData?.pipelines ?? []
  const AGENT_TYPES = [
    ...BUILTIN_AGENT_TYPES,
    ...pipelineAgents.map((p: any) => p.id),
  ]

  const update = (key: string, value: any) => {
    onUpdateConfig(node.id, { ...config, [key]: value })
  }

  return (
    <div className="wf-config-panel">
      <div className="wf-config-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="wf-config-type" style={{ background: TYPE_COLORS[type] ?? '#64748b' }}>
            {type.replace(/_/g, ' ')}
          </span>
          <span>Properties</span>
        </div>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate-400)' }} onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      <div className="wf-config-body">
        {/* Label — all node types */}
        <div className="form-field">
          <label className="form-label">Label</label>
          <input className="form-input" value={label} onChange={e => onUpdateLabel(node.id, e.target.value)} />
        </div>

        {/* Task / ESign */}
        {(type === 'task' || type === 'esign') && (
          <>
            <div className="form-field">
              <label className="form-label">Assigned Role</label>
              <select className="form-select" value={config.role ?? 'operator'} onChange={e => update('role', e.target.value)}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">SLA (hours)</label>
              <input type="number" className="form-input" value={config.sla_hours ?? 24} min={1} onChange={e => update('sla_hours', Number(e.target.value))} />
            </div>
            <div className="form-field">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={config.description ?? ''} rows={3} onChange={e => update('description', e.target.value)} />
            </div>
            {type === 'esign' && (
              <div className="form-field">
                <label className="form-label">Meaning Statement</label>
                <input className="form-input" value={config.meaning ?? ''} placeholder="I approve this record..." onChange={e => update('meaning', e.target.value)} />
              </div>
            )}

            {/* Form Schema Builder */}
            <div className="form-field">
              <label className="form-label" style={{ marginBottom: 6 }}>
                Task Form Fields
                <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 10, color: 'var(--color-slate-400)' }}>
                  — shown to the assignee before they complete the task
                </span>
              </label>
              <FormSchemaBuilder
                schema={config.form_schema ?? {}}
                onChange={s => update('form_schema', s)}
              />
            </div>
          </>
        )}

        {/* Agent Step */}
        {type === 'agent_step' && (
          <>
            <div className="form-field">
              <label className="form-label">Agent Type</label>
              <select className="form-select" value={config.agent_type ?? ''} onChange={e => update('agent_type', e.target.value)}>
                <option value="">Select agent...</option>
                {BUILTIN_AGENT_TYPES.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
              {pipelineAgents.length > 0 && <option disabled>── Visual Pipelines ──</option>}
              {pipelineAgents.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={config.description ?? ''} rows={3} onChange={e => update('description', e.target.value)} />
            </div>
          </>
        )}

        {/* Timer */}
        {type === 'timer' && (
          <>
            <div className="form-field">
              <label className="form-label">Wait (hours)</label>
              <input type="number" className="form-input" value={config.wait_hours ?? 24} min={1} onChange={e => update('wait_hours', Number(e.target.value))} />
            </div>
            <div className="form-field">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={config.description ?? ''} rows={2} onChange={e => update('description', e.target.value)} />
            </div>
          </>
        )}

        {/* Gateway */}
        {type === 'gateway' && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)', background: 'var(--color-warning-bg)', padding: '10px 12px', borderRadius: 'var(--border-radius)', border: '1px solid #fde68a' }}>
            Connect outgoing edges and set conditions on each edge (e.g. "approved", "rejected", "default") by clicking an edge.
          </div>
        )}

        {/* Logic Branch */}
        {type === 'logic' && (
          <>
            <div className="form-field">
              <label className="form-label">Expression</label>
              <input
                className="form-input"
                value={config.expression ?? ''}
                placeholder="e.g. risk_score > 7"
                onChange={e => update('expression', e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <div style={{ fontSize: 10, color: 'var(--color-slate-400)', marginTop: 4 }}>
                Use context variable names. Nested dict keys available as key_subkey.
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">True path label</label>
              <input className="form-input" value={config.true_label ?? 'High Risk'} onChange={e => update('true_label', e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">False path label</label>
              <input className="form-input" value={config.false_label ?? 'Normal'} onChange={e => update('false_label', e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={config.description ?? ''} rows={2} onChange={e => update('description', e.target.value)} />
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)', background: '#faf5ff', padding: '8px 10px', borderRadius: 'var(--border-radius)', border: '1px solid #e9d5ff' }}>
              Add outgoing edges with conditions "true" and "false". The engine auto-evaluates the expression and routes accordingly.
            </div>
          </>
        )}

        {/* Integration */}
        {type === 'integration' && (
          <>
            <div className="form-field">
              <label className="form-label">URL</label>
              <input
                className="form-input"
                value={config.url ?? ''}
                placeholder="https://api.example.com/endpoint"
                onChange={e => update('url', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label">HTTP Method</label>
              <select className="form-select" value={config.method ?? 'POST'} onChange={e => update('method', e.target.value)}>
                {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Output Key</label>
              <input
                className="form-input"
                value={config.output_key ?? ''}
                placeholder="e.g. servicenow_record"
                onChange={e => update('output_key', e.target.value)}
              />
              <div style={{ fontSize: 10, color: 'var(--color-slate-400)', marginTop: 4 }}>Response stored in workflow context under this key.</div>
            </div>
            <div className="form-field">
              <label className="form-label">Timeout (seconds)</label>
              <input type="number" className="form-input" value={config.timeout_seconds ?? 30} min={1} max={300} onChange={e => update('timeout_seconds', Number(e.target.value))} />
            </div>
            <div className="form-field">
              <label className="form-label">Body Template (JSON)</label>
              <textarea
                className="form-textarea"
                value={typeof config.body_template === 'object' ? JSON.stringify(config.body_template, null, 2) : (config.body_template ?? '{}')}
                rows={5}
                placeholder={'{\n  "field": "{{context_variable}}"\n}'}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
                onChange={e => {
                  try { update('body_template', JSON.parse(e.target.value)) } catch { update('body_template', e.target.value) }
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--color-slate-400)', marginTop: 4 }}>
                Use {`{{variable_name}}`} to inject workflow context values.
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={config.description ?? ''} rows={2} onChange={e => update('description', e.target.value)} />
            </div>
          </>
        )}

        {/* Node ID (read-only) */}
        <div className="form-field">
          <label className="form-label">Node ID</label>
          <input className="form-input" value={node.id} readOnly style={{ background: 'var(--color-slate-50)', color: 'var(--color-slate-400)', fontFamily: 'monospace', fontSize: 11 }} />
        </div>
      </div>
    </div>
  )
}
