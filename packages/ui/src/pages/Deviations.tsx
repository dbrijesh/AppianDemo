import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, AlertTriangle, Bot } from 'lucide-react'
import { workflowApi } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { Button, Modal, statusBadge } from '../design-system'
import { format, formatDistanceToNow } from 'date-fns'

const SEVERITY = ['Critical', 'Major', 'Minor', 'Observation']
const CATEGORIES = ['Process', 'Equipment', 'Material', 'Environmental', 'Personnel', 'Documentation']

export function Deviations() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)
  const [viewing, setViewing] = useState<any>(null)
  const [submitErr, setSubmitErr] = useState('')
  const [form, setForm] = useState({
    title: '', description: '', severity: 'Major', category: 'Process',
    batch_number: '', equipment_id: '', detected_by: user?.email ?? '',
  })

  const { data: resp, isLoading } = useQuery({
    queryKey: ['deviations'],
    queryFn: () => workflowApi.listInstances({ slug: 'deviation_capa', limit: '100' }),
    refetchInterval: 15000,
  })
  const deviations: any[] = (resp as any)?.items ?? []

  const createMutation = useMutation({
    mutationFn: () => workflowApi.startInstance('deviation_capa', {
      started_by_id: user!.id,
      started_by_email: user!.email,
      entity_type: 'deviation',
      entity_id: `DEV-${Date.now().toString().slice(-8)}`,
      context: { ...form },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deviations'] })
      setNewOpen(false)
      setForm({ title: '', description: '', severity: 'Major', category: 'Process', batch_number: '', equipment_id: '', detected_by: user?.email ?? '' })
    },
    onError: (err: any) => setSubmitErr(err?.message ?? 'Failed to submit deviation'),
  })

  const statusColor = (s: string) => ({ running: 'info', completed: 'success', error: 'danger' } as any)[s] ?? 'default'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Deviations &amp; CAPA</h1>
          <p className="page-subtitle">
            Deviation detection → AI triage → RCA → CAPA → E-Sign → Close
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => { setSubmitErr(''); setNewOpen(true) }}>
            Report Deviation
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-row" style={{ marginBottom: 'var(--space-6)' }}>
        {[
          { label: 'Total', value: deviations.length, color: '' },
          { label: 'Open / In Progress', value: deviations.filter(d => d.status === 'running').length, color: 'var(--color-accent)' },
          { label: 'Completed', value: deviations.filter(d => d.status === 'completed').length, color: 'var(--color-success)' },
        ].map(k => (
          <div className="kpi-tile" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={k.color ? { color: k.color } : {}}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Deviation ID</th>
                <th>Title</th>
                <th>Severity</th>
                <th>Category</th>
                <th>Current Step</th>
                <th>Status</th>
                <th>Reported</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8}><div className="table-empty">Loading…</div></td></tr>
              )}
              {!isLoading && deviations.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="table-empty" style={{ padding: 'var(--space-10) 0' }}>
                      <AlertTriangle size={28} style={{ marginBottom: 8, color: 'var(--color-slate-300)' }} />
                      <div>No deviations reported yet.</div>
                      <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--color-slate-400)' }}>
                        Click "Report Deviation" to start the AI-assisted CAPA workflow.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {deviations.map((d: any) => {
                const ctx = d.context ?? {}
                return (
                  <tr key={d.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                      {ctx.entity_id ?? d.entity_id ?? d.id.slice(0, 8)}
                    </td>
                    <td style={{ fontWeight: 500, maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ctx.title ?? '(no title)'}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${ctx.severity === 'Critical' ? 'danger' : ctx.severity === 'Major' ? 'warning' : 'default'}`}>
                        {ctx.severity ?? '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)' }}>{ctx.category ?? '—'}</td>
                    <td>
                      <span style={{ fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {d.current_node_id?.includes('agent') && <Bot size={12} style={{ color: 'var(--color-accent)' }} />}
                        {d.current_node_id ?? '—'}
                      </span>
                    </td>
                    <td>{statusBadge(d.status)}</td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                      {formatDistanceToNow(new Date(d.started_at), { addSuffix: true })}
                    </td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => setViewing(d)} title="View details">
                        <Eye size={14} />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Report Deviation Modal */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Report Deviation"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              disabled={!form.title || !form.description}
            >
              Submit &amp; Start CAPA
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {submitErr && <div className="alert alert-danger" style={{ margin: 0 }}>{submitErr}</div>}
          <div className="alert alert-info" style={{ margin: 0 }}>
            Submission triggers the AI-assisted CAPA workflow: Triage → RCA Draft → CAPA Suggestion → Human Review → E-Sign → Close.
          </div>
          <div className="form-field">
            <label className="form-label required">Deviation Title</label>
            <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Out-of-spec viscosity on Batch B-4421" />
          </div>
          <div className="form-field">
            <label className="form-label required">Description</label>
            <textarea className="form-textarea" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe what happened, when, and initial observations…" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="form-field">
              <label className="form-label required">Severity</label>
              <select className="form-select" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                {SEVERITY.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label required">Category</label>
              <select className="form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Batch / Lot Number</label>
              <input className="form-input" value={form.batch_number} onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))} placeholder="B-4421" />
            </div>
            <div className="form-field">
              <label className="form-label">Equipment ID</label>
              <input className="form-input" value={form.equipment_id} onChange={e => setForm(f => ({ ...f, equipment_id: e.target.value }))} placeholder="EQ-007" />
            </div>
          </div>
          <div className="form-field">
            <label className="form-label">Detected By</label>
            <input className="form-input" value={form.detected_by} onChange={e => setForm(f => ({ ...f, detected_by: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* View Deviation Detail */}
      {viewing && (
        <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Deviation — ${viewing.context?.title ?? viewing.id.slice(0, 8)}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {[
              ['Status', statusBadge(viewing.status)],
              ['Current Step', viewing.current_node_id ?? '—'],
              ['Severity', viewing.context?.severity],
              ['Category', viewing.context?.category],
              ['Batch', viewing.context?.batch_number || '—'],
              ['Equipment', viewing.context?.equipment_id || '—'],
              ['Detected By', viewing.context?.detected_by],
              ['Started', format(new Date(viewing.started_at), 'PPpp')],
              ['Completed', viewing.completed_at ? format(new Date(viewing.completed_at), 'PPpp') : '—'],
            ].map(([k, v]) => (
              <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-slate-600)', minWidth: 120 }}>{k}</span>
                <span style={{ fontSize: 'var(--text-sm)', textAlign: 'right' }}>{v as any}</span>
              </div>
            ))}
            {viewing.context?.description && (
              <div style={{ paddingTop: 'var(--space-3)' }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-slate-600)', marginBottom: 'var(--space-2)' }}>Description</div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-700)', lineHeight: 1.6 }}>{viewing.context.description}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
