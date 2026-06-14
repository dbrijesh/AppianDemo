import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, Award, ChevronRight } from 'lucide-react'
import { Button, Modal, statusBadge } from '../design-system'
import { workflowApi } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { format, formatDistanceToNow } from 'date-fns'

const CERT_TYPES = ['ISO 9001', 'ISO 13485', 'GMP', 'FDA 510k', 'CE Mark', 'CMMI5', 'Other']

function wfStatus(status: string): { label: string; badge: string } {
  if (status === 'completed') return { label: 'Active',    badge: 'success' }
  if (status === 'running')   return { label: 'In Review', badge: 'info' }
  if (status === 'failed')    return { label: 'Rejected',  badge: 'danger' }
  return                             { label: status,      badge: 'default' }
}

function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function Certificates() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [viewing, setViewing] = useState<any>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [form, setForm] = useState({
    cert_name: '',
    cert_type: 'ISO 9001',
    authorised_by: '',
    applicant_name: '',
    applicant_department: '',
    expires_on: '',
  })

  const { data: resp, isLoading } = useQuery({
    queryKey: ['certificates'],
    queryFn: () => workflowApi.listInstances({ slug: 'certificate_management', limit: '100' }),
    refetchInterval: 10_000,
  })
  const certs: any[] = resp?.items ?? []

  const { data: history, isLoading: histLoading } = useQuery({
    queryKey: ['history', historyFor],
    queryFn: () => workflowApi.getHistory(historyFor!),
    enabled: !!historyFor,
  })

  const createMutation = useMutation({
    mutationFn: () => workflowApi.startInstance('certificate_management', {
      started_by_id: user!.id,
      started_by_email: user!.email,
      entity_type: 'certificate',
      entity_id: `CERT-${Date.now().toString().slice(-8)}`,
      context: { ...form },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['certificates'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setAddOpen(false)
      setForm({ cert_name: '', cert_type: 'ISO 9001', authorised_by: '', applicant_name: '', applicant_department: '', expires_on: '' })
    },
  })

  const total = certs.length
  const inReview = certs.filter(c => c.status === 'running').length
  const active = certs.filter(c => c.status === 'completed').length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Certificates</h1>
          <p className="page-subtitle">Certificate requests tracked through the governance approval workflow</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => { createMutation.reset(); setAddOpen(true) }}>
            Add New Certificate
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row" style={{ marginBottom: 'var(--space-6)' }}>
        {[
          { label: 'Total', value: total, color: '' },
          { label: 'In Review', value: inReview, color: 'var(--color-accent)' },
          { label: 'Active', value: active, color: 'var(--color-success)' },
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
                <th>Certificate ID</th>
                <th>Name / Type</th>
                <th>Authorised By</th>
                <th>Applicant</th>
                <th>Current Step</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8}><div className="table-empty">Loading…</div></td></tr>
              )}
              {!isLoading && certs.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="table-empty" style={{ padding: 'var(--space-10) 0' }}>
                      <Award size={28} style={{ marginBottom: 8, color: 'var(--color-slate-300)' }} />
                      <div>No certificates yet.</div>
                      <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--color-slate-400)' }}>
                        Click "Add New Certificate" to start the governance approval workflow.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {certs.map((c: any) => {
                const ctx = c.context ?? {}
                const { label: stLabel, badge: stBadge } = wfStatus(c.status)
                return (
                  <tr key={c.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                        {c.entity_id ?? c.id.slice(0, 12)}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                        {ctx.cert_name || ctx.cert_type || '—'}
                      </div>
                      {ctx.cert_type && ctx.cert_name && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>{ctx.cert_type}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)' }}>{ctx.authorised_by || '—'}</td>
                    <td>
                      <div style={{ fontSize: 'var(--text-sm)' }}>{ctx.applicant_name || '—'}</div>
                      {ctx.applicant_department && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>{ctx.applicant_department}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)' }}>
                        {c.current_node_id ? titleCase(c.current_node_id) : c.status === 'completed' ? 'Complete' : '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${stBadge}`}>{stLabel}</span>
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                      {formatDistanceToNow(new Date(c.started_at), { addSuffix: true })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                        <Button variant="ghost" size="sm" title="View details" onClick={() => setViewing(c)}>
                          <Eye size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" title="Workflow history" onClick={() => setHistoryFor(c.id)}>
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Certificate Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add New Certificate"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={createMutation.isPending}
              disabled={!form.cert_name || !form.authorised_by}
              onClick={() => createMutation.mutate()}
            >
              Submit &amp; Start Approval
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {createMutation.isError && (
            <div className="alert alert-danger" style={{ margin: 0 }}>
              {String((createMutation.error as any)?.message ?? createMutation.error)}
            </div>
          )}
          <div className="alert alert-info" style={{ margin: 0 }}>
            Submitting starts the Certificate Management workflow: AI compliance review → risk check → QA approval → e-sign → ServiceNow registration.
          </div>
          <div className="form-field">
            <label className="form-label">Certificate Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <input className="form-input" value={form.cert_name} placeholder="e.g. ISO 9001 Annual Renewal 2026"
              onChange={e => setForm(f => ({ ...f, cert_name: e.target.value }))} />
          </div>
          <div className="form-field">
            <label className="form-label">Certificate Type</label>
            <select className="form-select" value={form.cert_type} onChange={e => setForm(f => ({ ...f, cert_type: e.target.value }))}>
              {CERT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">Authorised By <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <input className="form-input" value={form.authorised_by} placeholder="e.g. Bureau Veritas, Government of India"
              onChange={e => setForm(f => ({ ...f, authorised_by: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="form-field">
              <label className="form-label">Applicant Name</label>
              <input className="form-input" value={form.applicant_name} placeholder="e.g. Jane Smith"
                onChange={e => setForm(f => ({ ...f, applicant_name: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="form-label">Department</label>
              <input className="form-input" value={form.applicant_department} placeholder="e.g. Quality"
                onChange={e => setForm(f => ({ ...f, applicant_department: e.target.value }))} />
            </div>
          </div>
          <div className="form-field">
            <label className="form-label">Expected Expiry Date</label>
            <input type="date" className="form-input" value={form.expires_on}
              onChange={e => setForm(f => ({ ...f, expires_on: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* View Detail Modal */}
      {viewing && (
        <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing.context?.cert_name || 'Certificate Details'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {([
              ['Status',       <span className={`badge badge-${wfStatus(viewing.status).badge}`}>{wfStatus(viewing.status).label}</span>],
              ['Type',         viewing.context?.cert_type],
              ['Authorised By',viewing.context?.authorised_by],
              ['Applicant',    viewing.context?.applicant_name],
              ['Department',   viewing.context?.applicant_department],
              ['Expires On',   viewing.context?.expires_on || '—'],
              ['Current Step', viewing.current_node_id ? titleCase(viewing.current_node_id) : viewing.status === 'completed' ? 'Complete' : '—'],
              ['Submitted By', viewing.started_by_email],
              ['Submitted',    format(new Date(viewing.started_at), 'PPpp')],
              ['Completed',    viewing.completed_at ? format(new Date(viewing.completed_at), 'PPpp') : '—'],
              ['Workflow ID',  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{viewing.id}</span>],
            ] as [string, any][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-slate-600)', minWidth: 130 }}>{k}</span>
                <span style={{ fontSize: 'var(--text-sm)', textAlign: 'right' }}>{v ?? '—'}</span>
              </div>
            ))}
            {viewing.context?.scope_description && (
              <div style={{ paddingTop: 'var(--space-2)' }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-slate-600)', marginBottom: 'var(--space-2)' }}>Scope</div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-700)', lineHeight: 1.6, margin: 0 }}>{viewing.context.scope_description}</p>
              </div>
            )}
          </div>
          <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-color)' }}>
            <Button variant="outline" size="sm" icon={<ChevronRight size={14} />}
              onClick={() => { setViewing(null); setHistoryFor(viewing.id) }}>
              View Workflow History
            </Button>
          </div>
        </Modal>
      )}

      {/* History Modal */}
      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title="Workflow History">
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 520, overflowY: 'auto' }}>
          {histLoading && <div className="table-empty">Loading history…</div>}
          {!histLoading && (!history || history.length === 0) && <div className="table-empty">No history yet</div>}
          {(history ?? []).map((h: any, i: number) => (
            <div key={h.id ?? i} style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', marginTop: 4,
                  background: h.action.includes('completed') || h.action.includes('approved') ? 'var(--color-success)'
                    : h.action.includes('rejected') ? 'var(--color-danger)'
                    : 'var(--color-primary)',
                }} />
                {i < (history ?? []).length - 1 && <div style={{ width: 2, flexGrow: 1, background: 'var(--border-color)', marginTop: 4 }} />}
              </div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{h.node_label || titleCase(h.node_id)}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)', marginTop: 1 }}>{h.action}</div>
                {h.actor_email && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-400)' }}>by {h.actor_email}</div>}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-400)', flexShrink: 0 }}>
                {format(new Date(h.occurred_at), 'HH:mm:ss')}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
