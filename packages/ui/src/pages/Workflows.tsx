import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Clock, CheckCircle, XCircle, ChevronRight, Award, FileText, AlertTriangle } from 'lucide-react'
import { Button, Modal, statusBadge } from '../design-system'
import { workflowApi } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { formatDistanceToNow, format } from 'date-fns'

const TEMPLATES = [
  {
    slug: 'certificate_management',
    name: 'Certificate Management',
    description: 'Regulatory and non-regulatory certificate lifecycle with AI compliance review, risk-based routing, and ServiceNow registration.',
    Icon: Award,
    color: '#0e7490',
  },
  {
    slug: 'material_requisition',
    name: 'Material Requisition',
    description: 'End-to-end material requisition with QA review, cost governance, and finance e-sign.',
    Icon: FileText,
    color: '#7c3aed',
  },
  {
    slug: 'deviation_capa',
    name: 'Deviation & CAPA',
    description: 'AI-assisted deviation triage, root cause analysis drafting, and corrective action planning.',
    Icon: AlertTriangle,
    color: '#b45309',
  },
]

function statusIcon(status: string) {
  if (status === 'completed') return <CheckCircle size={14} color="var(--color-success)" />
  if (status === 'failed') return <XCircle size={14} color="var(--color-danger)" />
  return <Clock size={14} color="var(--color-slate-400)" />
}

function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function WorkflowsPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [starting, setStarting] = useState<typeof TEMPLATES[0] | null>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)

  const { data: instances, isLoading } = useQuery({
    queryKey: ['instances'],
    queryFn: () => workflowApi.listInstances({ limit: '100' }),
    refetchInterval: 10_000,
  })

  const { data: history, isLoading: histLoading } = useQuery({
    queryKey: ['history', historyFor],
    queryFn: () => workflowApi.getHistory(historyFor!),
    enabled: !!historyFor,
  })

  const startMutation = useMutation({
    mutationFn: (slug: string) =>
      workflowApi.startInstance(slug, {
        started_by_id: user!.id,
        started_by_email: user!.email,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instances'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setStarting(null)
    },
  })

  const rows: any[] = instances?.items ?? []

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-subtitle">Start and track governance workflow instances</p>
        </div>
      </div>

      {/* Template cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        {TEMPLATES.map(t => (
          <div key={t.slug} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-lg)', background: t.color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <t.Icon size={20} color={t.color} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>{t.name}</div>
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-600)', margin: 0, flexGrow: 1 }}>{t.description}</p>
            <Button
              variant="primary"
              size="sm"
              icon={<Play size={14} />}
              onClick={() => setStarting(t)}
            >
              Start New Instance
            </Button>
          </div>
        ))}
      </div>

      {/* Recent instances table */}
      <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--color-slate-700)' }}>
        Recent Instances
      </h2>
      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Status</th>
                <th>Current Step</th>
                <th>Started By</th>
                <th>Started</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6}><div className="table-empty">Loading...</div></td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={6}><div className="table-empty">No instances yet — click "Start New Instance" above</div></td></tr>
              )}
              {rows.map(inst => (
                <tr key={inst.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{titleCase(inst.definition_slug ?? '')}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-400)', fontFamily: 'var(--font-mono)' }}>
                      v{inst.definition_version}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      {statusIcon(inst.status)}
                      {statusBadge(inst.status)}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)' }}>
                      {inst.current_node_id ? titleCase(inst.current_node_id) : inst.status === 'completed' ? '—' : '—'}
                    </span>
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)' }}>
                    {inst.started_by_email}
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                    {formatDistanceToNow(new Date(inst.started_at), { addSuffix: true })}
                  </td>
                  <td>
                    <Button variant="ghost" size="sm" icon={<ChevronRight size={14} />} onClick={() => setHistoryFor(inst.id)}>
                      History
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Start confirm modal */}
      <Modal
        open={!!starting}
        onClose={() => { setStarting(null); startMutation.reset() }}
        title={`Start: ${starting?.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setStarting(null); startMutation.reset() }}>Cancel</Button>
            <Button
              variant="primary"
              icon={<Play size={14} />}
              loading={startMutation.isPending}
              onClick={() => startMutation.mutate(starting!.slug)}
            >
              Start Workflow
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {startMutation.isError && (
            <div className="alert alert-danger">
              {String((startMutation.error as any)?.message ?? startMutation.error)}
            </div>
          )}
          {startMutation.isSuccess && (
            <div className="alert alert-success">Workflow started! Check <strong>My Tasks</strong> for the first step.</div>
          )}
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-slate-700)' }}>
            A new <strong>{starting?.name}</strong> instance will be created. The first task will appear in <strong>My Tasks</strong> for the operator role.
          </p>
          <div className="alert alert-info" style={{ margin: 0 }}>{starting?.description}</div>
        </div>
      </Modal>

      {/* History modal */}
      <Modal
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        title="Workflow History"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 520, overflowY: 'auto' }}>
          {histLoading && <div className="table-empty">Loading history...</div>}
          {!histLoading && (!history || history.length === 0) && (
            <div className="table-empty">No history entries</div>
          )}
          {(history ?? []).map((h: any, i: number) => (
            <div key={h.id ?? i} style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: h.action.includes('completed') || h.action.includes('approved') ? 'var(--color-success)' : h.action.includes('rejected') ? 'var(--color-danger)' : 'var(--color-primary)', marginTop: 4 }} />
                {i < (history ?? []).length - 1 && <div style={{ width: 2, flexGrow: 1, background: 'var(--border-color)', marginTop: 4 }} />}
              </div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{h.node_label || titleCase(h.node_id)}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)', marginTop: 1 }}>{h.action}</div>
                {h.actor_email && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-400)' }}>by {h.actor_email}</div>
                )}
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
