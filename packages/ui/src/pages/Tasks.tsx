import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, AlertTriangle, Bot, PenLine, FileText, Upload, X } from 'lucide-react'
import { taskApi } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { Button, Modal, statusBadge } from '../design-system'
import { formatDistanceToNow } from 'date-fns'

// ── AI Agent Context Panel ──────────────────────────────────────────────────

function riskColor(level: string) {
  return level === 'critical' ? 'var(--color-danger)'
    : level === 'high' ? '#f97316'
    : level === 'medium' ? '#eab308'
    : 'var(--color-success)'
}

function AgentContextPanel({ context }: { context: Record<string, any> }) {
  return (
    <div style={{ border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ background: 'var(--color-primary)', color: '#fff', padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
        <Bot size={16} /> AI Agent Assessment
      </div>
      <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', background: '#eff6ff' }}>
        {Object.entries(context).map(([key, output]) => {
          const label = key.replace(/^agent_/, '').replace(/_/g, ' ')
          if (!output || typeof output !== 'object') return null
          return (
            <div key={key}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--color-slate-500)', marginBottom: 'var(--space-2)' }}>{label}</div>

              {output.risk_score !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: riskColor(output.risk_level ?? '') }}>{output.risk_score}/10</span>
                  <span className="badge" style={{ background: riskColor(output.risk_level ?? ''), color: '#fff', textTransform: 'capitalize' }}>{output.risk_level}</span>
                </div>
              )}

              {output.summary && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-700)', margin: '0 0 var(--space-3)' }}>{output.summary}</p>}

              {output.recommendation && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-slate-500)' }}>Recommendation: </span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, textTransform: 'capitalize', color: output.recommendation === 'approve' ? 'var(--color-success)' : output.recommendation === 'reject' ? 'var(--color-danger)' : '#f97316' }}>
                    {output.recommendation.replace(/_/g, ' ')}
                  </span>
                  {output.recommendation_rationale && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}> — {output.recommendation_rationale}</span>}
                </div>
              )}

              {Array.isArray(output.compliance_checklist) && output.compliance_checklist.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-slate-500)', marginBottom: 'var(--space-1)' }}>Compliance Checklist</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {output.compliance_checklist.map((item: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
                        <span style={{ color: item.status === 'pass' ? 'var(--color-success)' : item.status === 'fail' ? 'var(--color-danger)' : '#f97316', fontWeight: 700, flexShrink: 0 }}>
                          {item.status === 'pass' ? '✓' : item.status === 'fail' ? '✗' : '~'}
                        </span>
                        <span><strong>{item.item}</strong>{item.note ? ` — ${item.note}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(output.missing_documents) && output.missing_documents.length > 0 && (
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-danger)', marginBottom: 'var(--space-1)' }}>Missing Documents</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 'var(--text-xs)', color: 'var(--color-slate-700)' }}>
                    {output.missing_documents.map((d: string, i: number) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}

              {!output.risk_score && !output.summary && (
                <pre style={{ fontSize: 'var(--text-xs)', background: '#fff', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', overflow: 'auto', maxHeight: 200 }}>
                  {JSON.stringify(output, null, 2)}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Workflow Context Panel (shows prior form data to operators) ─────────────

const INTERNAL_KEYS = new Set(['signal', 'task_id', 'comments', '_spiff'])

function WorkflowContextPanel({ context }: { context: Record<string, any> }) {
  const entries = Object.entries(context).filter(
    ([k, v]) => !k.startsWith('agent_') && !INTERNAL_KEYS.has(k) && v !== null && v !== undefined && v !== ''
  )
  if (entries.length === 0) return null

  return (
    <div style={{ border: '1px solid var(--color-slate-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ background: 'var(--color-slate-100)', color: 'var(--color-slate-700)', padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
        <FileText size={16} /> Request Details
      </div>
      <div style={{ padding: 'var(--space-4)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
        {entries.map(([key, value]) => {
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          const display = Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value)
          return (
            <div key={key}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-800)', wordBreak: 'break-word' }}>{display}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── JSON Schema Form Renderer ───────────────────────────────────────────────

function FileUploadField({
  taskId, value, onChange,
}: {
  taskId: string | undefined
  value: any
  onChange: (v: any) => void
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const files: Array<{ filename: string; url: string }> = Array.isArray(value) ? value : []

  const handleFiles = async (selected: FileList | null) => {
    if (!selected || !taskId) return
    setUploading(true)
    try {
      const results = await Promise.all(
        Array.from(selected).map(f => taskApi.uploadAttachment(taskId, f))
      )
      onChange([...files, ...results])
    } catch (err: any) {
      alert('Upload failed: ' + (err?.message ?? err))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = (idx: number) => onChange(files.filter((_, i) => i !== idx))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div
        style={{ border: '2px dashed var(--color-slate-300)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', textAlign: 'center', cursor: 'pointer', background: 'var(--color-slate-50)' }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={20} style={{ color: 'var(--color-slate-400)', marginBottom: 6 }} />
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-600)' }}>
          {uploading ? 'Uploading…' : 'Click to select files'}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-400)', marginTop: 2 }}>PDF, Word, Excel, images accepted</div>
      </div>
      <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
              <FileText size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate-400)', padding: 0, display: 'flex' }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FieldInput({
  fieldKey, prop, value, onChange, taskId,
}: {
  fieldKey: string
  prop: any
  value: any
  onChange: (v: any) => void
  taskId?: string
}) {
  if (prop.format === 'file-upload') {
    return <FileUploadField taskId={taskId} value={value} onChange={onChange} />
  }

  if (prop.enum) {
    return (
      <select className="form-select" value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">Select…</option>
        {prop.enum.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    )
  }

  if (prop.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-700)' }}>
          {prop.description || prop.title}
        </span>
      </label>
    )
  }

  if (prop.type === 'array') {
    return (
      <textarea
        className="form-textarea"
        rows={4}
        placeholder={prop.description ?? 'One item per line'}
        value={Array.isArray(value) ? value.join('\n') : (value ?? '')}
        onChange={e => onChange(e.target.value.split('\n').filter(Boolean))}
      />
    )
  }

  if (prop.format === 'textarea') {
    return (
      <textarea
        className="form-textarea"
        rows={3}
        placeholder={prop.description}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      />
    )
  }

  if (prop.format === 'date') {
    return (
      <input
        type="date"
        className="form-input"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      />
    )
  }

  if (prop.type === 'integer' || prop.type === 'number') {
    return (
      <input
        type="number"
        className="form-input"
        value={value ?? ''}
        onChange={e => onChange(Number(e.target.value))}
      />
    )
  }

  return (
    <input
      type="text"
      className="form-input"
      value={value ?? ''}
      placeholder={prop.description}
      onChange={e => onChange(e.target.value)}
    />
  )
}

function SchemaForm({
  schema,
  value,
  onChange,
  taskId,
}: {
  schema: any
  value: Record<string, any>
  onChange: (v: Record<string, any>) => void
  taskId?: string
}) {
  if (!schema?.properties) return null
  return (
    <>
      {Object.entries(schema.properties as Record<string, any>).map(([key, prop]) => {
        const required = (schema.required ?? []).includes(key)
        return (
          <div key={key} className="form-field">
            <label className="form-label">
              {(prop as any).title || key}
              {required && <span style={{ color: 'var(--color-danger)', marginLeft: 3 }}>*</span>}
            </label>
            <FieldInput
              fieldKey={key}
              prop={prop}
              value={value[key]}
              onChange={val => onChange({ ...value, [key]: val })}
              taskId={taskId}
            />
          </div>
        )
      })}
    </>
  )
}

// ── Main Tasks Page ─────────────────────────────────────────────────────────

export function Tasks() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'open' | 'claimed' | 'completed'>('open')
  const [completing, setCompleting] = useState<any | null>(null)
  const [signal, setSignal] = useState('approved')
  const [comments, setComments] = useState('')
  const [formData, setFormData] = useState<Record<string, any>>({})

  const openComplete = (task: any) => {
    setCompleting(task)
    setSignal('approved')
    setComments('')
    setFormData({})
  }

  const isAdmin = user?.roles?.includes('admin') ?? false
  const userRole = user?.roles?.find(r => r !== 'admin') ?? user?.roles?.[0]

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', activeTab, user?.id, userRole],
    queryFn: () => taskApi.listTasks({
      status: activeTab,
      limit: '100',
      // Admin sees all tasks; everyone else only sees tasks for their role
      ...(isAdmin ? {} : { role: userRole ?? '' }),
    }),
    refetchInterval: 8_000,
  })

  const claimMutation = useMutation({
    mutationFn: (taskId: string) => taskApi.claimTask(taskId, user!.id, user!.email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const completeMutation = useMutation({
    mutationFn: ({ id, sig }: { id: string; sig: string }) =>
      taskApi.completeTask(id, {
        user_id: user!.id,
        user_email: user!.email,
        signal: sig,
        form_data: formData,
        comments,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['instances'] })
      setCompleting(null)
    },
  })

  const tasks = data?.items ?? []
  const isEsign = completing?.title?.toLowerCase().includes('e-sign') || completing?.title?.toLowerCase().includes('sign')

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Tasks</h1>
          <p className="page-subtitle">Tasks assigned to your role</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 'var(--space-6)' }}>
        {(['open', 'claimed', 'completed'] as const).map(tab => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Role</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6}><div className="table-empty">Loading...</div></td></tr>
              )}
              {!isLoading && tasks.length === 0 && (
                <tr><td colSpan={6}><div className="table-empty">No {activeTab} tasks</div></td></tr>
              )}
              {tasks.map((task: any) => {
                const isOverdue = task.due_at && new Date(task.due_at) < new Date()
                return (
                  <tr key={task.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{task.title}</div>
                      {task.description && (
                        <div style={{ color: 'var(--color-slate-500)', fontSize: 'var(--text-xs)', marginTop: 2 }}>{task.description}</div>
                      )}
                      {task.escalated && (
                        <span className="badge badge-danger badge-dot" style={{ marginTop: 4 }}>Escalated</span>
                      )}
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize', fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)' }}>
                        {task.assigned_role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${task.priority === 'high' ? 'danger' : 'default'}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td>
                      {task.due_at && (
                        <span style={{ fontSize: 'var(--text-xs)', color: isOverdue ? 'var(--color-danger)' : 'var(--color-slate-600)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isOverdue && <AlertTriangle size={12} />}
                          {formatDistanceToNow(new Date(task.due_at), { addSuffix: true })}
                        </span>
                      )}
                    </td>
                    <td>{statusBadge(task.status)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        {task.status === 'open' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => claimMutation.mutate(task.id)}
                            loading={claimMutation.isPending}
                          >
                            Claim
                          </Button>
                        )}
                        {(task.status === 'claimed' || task.status === 'open') && (
                          <Button variant="secondary" size="sm" onClick={() => openComplete(task)}>
                            Complete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Complete Task Modal */}
      <Modal
        open={!!completing}
        onClose={() => { setCompleting(null); completeMutation.reset() }}
        title={completing?.title ?? ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setCompleting(null); completeMutation.reset() }}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => completeMutation.mutate({ id: completing.id, sig: 'rejected' })}
              loading={completeMutation.isPending}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              icon={isEsign ? <PenLine size={14} /> : undefined}
              onClick={() => completeMutation.mutate({ id: completing.id, sig: signal })}
              loading={completeMutation.isPending}
            >
              {isEsign ? 'Sign & Approve' : 'Approve'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {completeMutation.isError && (
            <div className="alert alert-danger" style={{ margin: 0 }}>
              {String((completeMutation.error as any)?.message ?? completeMutation.error)}
            </div>
          )}

          {/* Task description */}
          {completing?.description && (
            <div className="alert alert-info" style={{ margin: 0 }}>{completing.description}</div>
          )}

          {/* E-Sign: show legal meaning prominently */}
          {isEsign && (
            <div style={{ border: '2px solid var(--color-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: '#f0f9ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-primary)' }}>
                <PenLine size={16} /> Electronic Signature
              </div>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-slate-700)', fontStyle: 'italic' }}>
                "{completing?.description || 'I approve this record'}"
              </p>
              <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                Signed by: <strong>{user?.email}</strong>
              </p>
            </div>
          )}

          {/* Prior step data (cert request details, etc.) */}
          {completing?.agent_context && (
            <WorkflowContextPanel context={completing.agent_context} />
          )}

          {/* AI Agent Assessment */}
          {completing?.agent_context && Object.keys(completing.agent_context).some(k => k.startsWith('agent_')) && (
            <AgentContextPanel context={
              Object.fromEntries(Object.entries(completing.agent_context).filter(([k]) => k.startsWith('agent_')))
            } />
          )}

          {/* Dynamic form from form_schema */}
          {completing?.form_schema && (
            <SchemaForm
              schema={completing.form_schema}
              value={formData}
              onChange={setFormData}
              taskId={completing?.id}
            />
          )}

          {/* Signal selector (only for gateway-routed tasks without a clear approve/reject) */}
          {!isEsign && !completing?.form_schema && (
            <div className="form-field">
              <label className="form-label">Decision</label>
              <select className="form-select" value={signal} onChange={e => setSignal(e.target.value)}>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="task_complete">Completed</option>
              </select>
            </div>
          )}

          {/* Comments */}
          <div className="form-field">
            <label className="form-label">Comments</label>
            <textarea
              className="form-textarea"
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Optional comments..."
              rows={2}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
