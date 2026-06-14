import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ShieldCheck, ShieldAlert, Search } from 'lucide-react'
import { auditApi } from '../../api/client'
import { Button, statusBadge } from '../../design-system'
import { format } from 'date-fns'

export function AuditLog() {
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [params, setParams] = useState<Record<string, string>>({})

  const { data: resp, isLoading } = useQuery({
    queryKey: ['audit-events', params],
    queryFn: () => auditApi.listEvents(params),
  })
  const events: any[] = (resp as any)?.items ?? []
  const total: number  = (resp as any)?.total ?? 0

  const verifyMutation = useMutation({
    mutationFn: () => auditApi.verifyChain(),
  })

  const search = () => {
    const p: Record<string, string> = {}
    if (entityType.trim()) p.entity_type = entityType.trim()
    if (entityId.trim()) p.entity_id = entityId.trim()
    setParams(p)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle">Append-only, hash-chained event record (21 CFR Part 11) — {total} events</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {verifyMutation.data && (
            <span className={`badge badge-${verifyMutation.data.valid ? 'success' : 'danger'}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {verifyMutation.data.valid
                ? <><ShieldCheck size={13} /> Chain intact ({verifyMutation.data.checked} events)</>
                : <><ShieldAlert size={13} /> Chain tampered — {verifyMutation.data.message}</>}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => verifyMutation.mutate()}
            loading={verifyMutation.isPending}
          >
            <ShieldCheck size={14} /> Verify Chain
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
          <label className="form-label">Entity type</label>
          <input className="form-input" placeholder="e.g. workflow_instance" value={entityType} onChange={e => setEntityType(e.target.value)} />
        </div>
        <div className="form-field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
          <label className="form-label">Entity ID</label>
          <input className="form-input" placeholder="UUID" value={entityId} onChange={e => setEntityId(e.target.value)} />
        </div>
        <Button variant="primary" size="sm" onClick={search}>
          <Search size={14} /> Search
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setEntityType(''); setEntityId(''); setParams({}) }}>
          Clear
        </Button>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Occurred at</th>
                <th>Action</th>
                <th>Entity type</th>
                <th>Entity ID</th>
                <th>Actor</th>
                <th style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>Hash (first 12)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6}><div className="table-empty">Loading...</div></td></tr>
              )}
              {!isLoading && events.length === 0 && (
                <tr><td colSpan={6}><div className="table-empty">No events match the current filter.</div></td></tr>
              )}
              {events.map((ev: any) => (
                <tr key={ev.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                    {format(new Date(ev.occurred_at), 'yyyy-MM-dd HH:mm:ss')}
                  </td>
                  <td>
                    <span className="badge badge-default" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10 }}>
                      {ev.action}
                    </span>
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)' }}>{ev.entity_type}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                    {ev.entity_id?.slice(0, 8)}…
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)' }}>{ev.actor_id}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-slate-400)' }}>
                    {ev.event_hash?.slice(0, 12)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
