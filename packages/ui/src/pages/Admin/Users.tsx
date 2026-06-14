import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { identityApi } from '../../api/client'
import { Button, Modal, statusBadge } from '../../design-system'
import { format } from 'date-fns'

export function Users() {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role_names: ['operator'] })

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => identityApi.listUsers(),
  })

  const createMutation = useMutation({
    mutationFn: () => identityApi.createUser(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setAddOpen(false) },
  })

  const users = data?.items ?? []

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage platform users and roles</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAddOpen(true)}>Add User</Button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5}><div className="table-empty">Loading...</div></td></tr>}
              {users.map((u: any) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.full_name || '—'}</td>
                  <td>{u.email}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {u.roles.map((r: any) => (
                        <span key={r.id} className="badge badge-navy">{r.name}</span>
                      ))}
                    </div>
                  </td>
                  <td>{statusBadge(u.is_active ? 'active' : 'cancelled')}</td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>{format(new Date(u.created_at), 'MMM d, yyyy')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add User"
        footer={<>
          <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={createMutation.isPending} onClick={() => createMutation.mutate()} disabled={!form.email || !form.password}>Create</Button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div className="form-field"><label className="form-label required">Email</label><input className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="form-field"><label className="form-label">Full Name</label><input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
          <div className="form-field"><label className="form-label required">Password</label><input type="password" className="form-input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div className="form-field">
            <label className="form-label">Role</label>
            <select className="form-select" value={form.role_names[0]} onChange={e => setForm(f => ({ ...f, role_names: [e.target.value] }))}>
              {['operator', 'qa_manager', 'admin', 'auditor', 'supplier'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  )
}
