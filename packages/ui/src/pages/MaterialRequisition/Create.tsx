import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { workflowApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import { Button } from '../../design-system'

interface Material {
  part_number: string
  description: string
  uom: string
  required_qty: number
  available_stock: number
  requisition_qty: number
}

const DEFAULT_PROJECT = {
  project_id: 'PRJ-' + Date.now().toString().slice(-10),
  customer_name: '',
  customer_type: 'Existing',
  industry: '',
  start_date: '',
  completion_date: '',
  shipping_address: '',
  customer_po: '',
}

export function CreateMR() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [project, setProject] = useState(DEFAULT_PROJECT)
  const [materials, setMaterials] = useState<Material[]>([
    { part_number: '', description: '', uom: 'MTR', required_qty: 0, available_stock: 0, requisition_qty: 0 }
  ])

  const [submitError, setSubmitError] = useState('')

  const mutation = useMutation({
    mutationFn: () => workflowApi.startInstance('material_requisition', {
      started_by_id: user!.id,
      started_by_email: user!.email,
      entity_type: 'material_requisition',
      entity_id: project.project_id,
      context: { project, materials },
    }),
    onSuccess: () => navigate('/mr'),
    onError: (err: any) => setSubmitError(err?.message ?? 'Submission failed — check service logs'),
  })

  const addRow = () => setMaterials(m => [...m, { part_number: '', description: '', uom: 'MTR', required_qty: 0, available_stock: 0, requisition_qty: 0 }])
  const removeRow = (i: number) => setMaterials(m => m.filter((_, idx) => idx !== i))
  const updateRow = (i: number, key: keyof Material, value: any) => setMaterials(m => m.map((r, idx) => idx === i ? { ...r, [key]: value } : r))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Create Material Requisition</h1>
        </div>
        <div className="page-actions">
          <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={() => { setSubmitError(''); mutation.mutate() }}
            disabled={!project.customer_name || !project.start_date}
          >
            Submit for Review
          </Button>
        </div>
      </div>

      {submitError && (
        <div className="alert alert-danger" style={{ marginBottom: 'var(--space-5)' }}>{submitError}</div>
      )}

      {/* Customer Information */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div className="form-section">Customer Information</div>
        <div className="form-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
            <div className="form-field">
              <label className="form-label">Project ID</label>
              <input className="form-input" value={project.project_id} readOnly style={{ background: 'var(--color-slate-50)' }} />
            </div>
            <div className="form-field">
              <label className="form-label required">Start Date</label>
              <input type="date" className="form-input" value={project.start_date} onChange={e => setProject(p => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="form-label required">Customer Name</label>
              <input className="form-input" value={project.customer_name} onChange={e => setProject(p => ({ ...p, customer_name: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="form-label required">Completion Date</label>
              <input type="date" className="form-input" value={project.completion_date} onChange={e => setProject(p => ({ ...p, completion_date: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="form-label">Customer Type</label>
              <select className="form-select" value={project.customer_type} onChange={e => setProject(p => ({ ...p, customer_type: e.target.value }))}>
                <option>Existing</option><option>New</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Shipping Address</label>
              <input className="form-input" value={project.shipping_address} onChange={e => setProject(p => ({ ...p, shipping_address: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="form-label">Industry</label>
              <select className="form-select" value={project.industry} onChange={e => setProject(p => ({ ...p, industry: e.target.value }))}>
                <option value="">Select...</option>
                <option>Aerospace</option><option>Automotive</option><option>Chemical</option><option>Heavy Industry</option><option>Mining</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Customer PO#</label>
              <input className="form-input" value={project.customer_po} onChange={e => setProject(p => ({ ...p, customer_po: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>

      {/* Materials */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Materials</h2>
        </div>
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Part Number</th>
                  <th>Material Description</th>
                  <th>Unit of Measurement (UoM)</th>
                  <th>Required Quantity</th>
                  <th>Available Stock</th>
                  <th>Requisition Quantity</th>
                  <th>Total Qty (incl. safety)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {materials.map((row, i) => (
                  <tr key={i}>
                    <td><input className="form-input" value={row.part_number} onChange={e => updateRow(i, 'part_number', e.target.value)} placeholder="131917" /></td>
                    <td><input className="form-input" value={row.description} onChange={e => updateRow(i, 'description', e.target.value)} placeholder="BAR, STAINLESS STEEL80x30" /></td>
                    <td>
                      <select className="form-select" value={row.uom} onChange={e => updateRow(i, 'uom', e.target.value)}>
                        <option>MTR</option><option>KG</option><option>PCS</option><option>NOS</option>
                      </select>
                    </td>
                    <td><input type="number" className="form-input" value={row.required_qty} min={0} onChange={e => updateRow(i, 'required_qty', Number(e.target.value))} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="number" className="form-input" value={row.available_stock} min={0} onChange={e => updateRow(i, 'available_stock', Number(e.target.value))} />
                        {row.available_stock >= row.required_qty && <span style={{ color: 'var(--color-success)', fontSize: 16 }}>&#x2713;</span>}
                      </div>
                    </td>
                    <td><input type="number" className="form-input" value={row.requisition_qty} min={0} onChange={e => updateRow(i, 'requisition_qty', Number(e.target.value))} /></td>
                    <td style={{ fontWeight: 500 }}>{row.requisition_qty + 1}</td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => removeRow(i)} disabled={materials.length === 1}>
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--border-color)' }}>
            <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={addRow}>Add Row</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
