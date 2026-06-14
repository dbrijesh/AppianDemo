import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, Package, ChevronRight } from 'lucide-react'
import { Button, Modal, statusBadge } from '../../design-system'
import { workflowApi } from '../../api/client'
import { format, formatDistanceToNow } from 'date-fns'

function wfStatus(status: string): { label: string; badge: string } {
  if (status === 'completed') return { label: 'Released',   badge: 'success' }
  if (status === 'running')   return { label: 'In Progress', badge: 'info' }
  if (status === 'failed')    return { label: 'Failed',      badge: 'danger' }
  return                             { label: status,        badge: 'default' }
}

function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function MaterialRequisitionList() {
  const navigate = useNavigate()
  const [viewing, setViewing] = useState<any>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)

  const { data: resp, isLoading } = useQuery({
    queryKey: ['material-requisitions'],
    queryFn: () => workflowApi.listInstances({ slug: 'material_requisition', limit: '100' }),
    refetchInterval: 10_000,
  })
  const mrs: any[] = resp?.items ?? []

  const { data: history, isLoading: histLoading } = useQuery({
    queryKey: ['history', historyFor],
    queryFn: () => workflowApi.getHistory(historyFor!),
    enabled: !!historyFor,
  })

  const total = mrs.length
  const inProgress = mrs.filter(m => m.status === 'running').length
  const released = mrs.filter(m => m.status === 'completed').length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Material Requisition</h1>
          <p className="page-subtitle">Requisitions tracked through QA review, cost governance, and finance e-sign</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/mr/new')}>
            New Requisition
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row" style={{ marginBottom: 'var(--space-6)' }}>
        {[
          { label: 'Total', value: total, color: '' },
          { label: 'In Progress', value: inProgress, color: 'var(--color-accent)' },
          { label: 'Released', value: released, color: 'var(--color-success)' },
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
                <th>Project ID</th>
                <th>Customer</th>
                <th>Industry</th>
                <th>Materials</th>
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
              {!isLoading && mrs.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="table-empty" style={{ padding: 'var(--space-10) 0' }}>
                      <Package size={28} style={{ marginBottom: 8, color: 'var(--color-slate-300)' }} />
                      <div>No requisitions yet.</div>
                      <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--color-slate-400)' }}>
                        Click "New Requisition" to create and submit for approval.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {mrs.map((m: any) => {
                const ctx = m.context ?? {}
                const project = ctx.project ?? {}
                const materials: any[] = ctx.materials ?? []
                const { label: stLabel, badge: stBadge } = wfStatus(m.status)
                return (
                  <tr key={m.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                        {project.project_id || m.entity_id || m.id.slice(0, 10)}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{project.customer_name || '—'}</div>
                      {project.customer_type && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>{project.customer_type}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-600)' }}>
                      {project.industry || '—'}
                    </td>
                    <td>
                      <span className="badge badge-default">{materials.length} item{materials.length !== 1 ? 's' : ''}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)' }}>
                        {m.current_node_id ? titleCase(m.current_node_id) : m.status === 'completed' ? 'Complete' : '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${stBadge}`}>{stLabel}</span>
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                      {formatDistanceToNow(new Date(m.started_at), { addSuffix: true })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                        <Button variant="ghost" size="sm" title="View details" onClick={() => setViewing(m)}>
                          <Eye size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" title="Workflow history" onClick={() => setHistoryFor(m.id)}>
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

      {/* View Detail Modal */}
      {viewing && (
        <Modal open={!!viewing} onClose={() => setViewing(null)} title={`MR — ${viewing.context?.project?.project_id || viewing.id.slice(0, 10)}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {([
              ['Status',       <span className={`badge badge-${wfStatus(viewing.status).badge}`}>{wfStatus(viewing.status).label}</span>],
              ['Project ID',   viewing.context?.project?.project_id],
              ['Customer',     viewing.context?.project?.customer_name],
              ['Customer Type',viewing.context?.project?.customer_type],
              ['Industry',     viewing.context?.project?.industry || '—'],
              ['Start Date',   viewing.context?.project?.start_date || '—'],
              ['Completion',   viewing.context?.project?.completion_date || '—'],
              ['Customer PO',  viewing.context?.project?.customer_po || '—'],
              ['Current Step', viewing.current_node_id ? titleCase(viewing.current_node_id) : viewing.status === 'completed' ? 'Complete' : '—'],
              ['Submitted By', viewing.started_by_email],
              ['Submitted',    format(new Date(viewing.started_at), 'PPpp')],
            ] as [string, any][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-slate-600)', minWidth: 130 }}>{k}</span>
                <span style={{ fontSize: 'var(--text-sm)', textAlign: 'right' }}>{v ?? '—'}</span>
              </div>
            ))}
            {viewing.context?.materials?.length > 0 && (
              <div style={{ paddingTop: 'var(--space-3)' }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-slate-600)', marginBottom: 'var(--space-2)' }}>
                  Materials ({viewing.context.materials.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  {viewing.context.materials.map((mat: any, i: number) => (
                    <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-700)', padding: 'var(--space-2)', background: 'var(--color-slate-50)', borderRadius: 'var(--radius-sm)' }}>
                      <strong>{mat.part_number || `Item ${i + 1}`}</strong>
                      {mat.description && ` — ${mat.description}`}
                      {mat.requisition_qty > 0 && ` (qty: ${mat.requisition_qty} ${mat.uom})`}
                    </div>
                  ))}
                </div>
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
