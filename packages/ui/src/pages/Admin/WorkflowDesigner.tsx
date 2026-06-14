import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ChevronRight } from 'lucide-react'
import { workflowApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import { WorkflowEditor } from '../../components/WorkflowEditor'
import { Button, Badge, statusBadge } from '../../design-system'
import type { Node, Edge } from '@xyflow/react'
import './WorkflowDesigner.css'

function graphToFlow(graph: any): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = (graph.nodes ?? []).map((n: any) => ({
    id: n.id,
    type: n.type,
    position: n.position ?? { x: 0, y: 0 },
    data: { label: n.label, config: n.config ?? {} },
  }))
  const edges: Edge[] = (graph.edges ?? []).map((e: any) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label ?? '',
    data: { condition: e.condition },
    type: 'smoothstep',
    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed' as const, width: 16, height: 16, color: '#94a3b8' },
  }))
  return { nodes, edges }
}

function flowToGraph(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: (n.data?.label as string) ?? '',
      config: (n.data?.config as Record<string, any>) ?? {},
      position: n.position,
    })),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label ?? '',
      condition: (e.data as any)?.condition,
    })),
  }
}

export function WorkflowDesigner() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [selected, setSelected] = useState<any>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const { data: definitions, isLoading } = useQuery({
    queryKey: ['workflow-definitions'],
    queryFn: workflowApi.listDefinitions,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
      const graph = flowToGraph(nodes, edges)
      return workflowApi.updateDefinition(
        selected.id,
        { graph },
        user?.id ?? 'system',
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-definitions'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: () => workflowApi.createDefinition(
      {
        name: newName,
        slug: newSlug,
        description: newDesc,
        graph: {
          nodes: [
            { id: 'start', type: 'start', label: 'Start', config: {}, position: { x: 100, y: 200 } },
            { id: 'end', type: 'end', label: 'End', config: {}, position: { x: 500, y: 200 } },
          ],
          edges: [{ id: 'e1', source: 'start', target: 'end' }],
        },
      },
      user?.id ?? 'system',
    ),
    onSuccess: (def: any) => {
      qc.invalidateQueries({ queryKey: ['workflow-definitions'] })
      setSelected(def)
      setNewOpen(false)
      setNewName(''); setNewSlug(''); setNewDesc('')
    },
  })

  const flow = selected ? graphToFlow(selected.graph) : null

  return (
    <div className="wf-designer-page">
      {/* Definition list sidebar */}
      <div className="wf-def-list">
        <div className="wf-def-list-header">
          <span>Workflow Definitions</span>
          <button className="btn btn-sm btn-primary" onClick={() => setNewOpen(true)} style={{ padding: '4px 10px' }}>
            <Plus size={13} /> New
          </button>
        </div>

        {isLoading && <div style={{ padding: 'var(--space-4)', color: 'var(--color-slate-400)', fontSize: 'var(--text-sm)' }}>Loading...</div>}

        {/* Group by slug, show active version first */}
        {(() => {
          const bySlug = new Map<string, any[]>()
          for (const def of (definitions ?? [])) {
            const group = bySlug.get(def.slug) ?? []
            group.push(def)
            bySlug.set(def.slug, group)
          }
          return Array.from(bySlug.values()).map(group => {
            const active = group.find(d => d.is_active) ?? group[0]
            const versions = group.sort((a: any, b: any) => b.version - a.version)
            return (
              <div key={active.slug}>
                {versions.map((def: any) => (
                  <button
                    key={def.id}
                    className={`wf-def-item ${selected?.id === def.id ? 'selected' : ''}`}
                    onClick={() => setSelected(def)}
                  >
                    <div className="wf-def-item-name">{def.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--color-slate-400)' }}>v{def.version}</span>
                      <span className={`badge badge-${def.is_active ? 'success' : 'default'}`} style={{ fontSize: 9, padding: '1px 6px' }}>
                        {def.is_active ? 'Active' : 'Old'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )
          })
        })()}
      </div>

      {/* Editor area */}
      <div className="wf-editor-area">
        {!selected ? (
          <div className="wf-empty">
            <div className="wf-empty-icon">
              <ChevronRight size={32} />
            </div>
            <div className="wf-empty-title">Select a workflow definition</div>
            <div className="wf-empty-sub">Choose from the list on the left, or create a new one</div>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setNewOpen(true)}>
              Create Workflow
            </Button>
          </div>
        ) : (
          <WorkflowEditor
            key={selected.id}
            definitionName={`${selected.name} (v${selected.version})`}
            initialNodes={flow!.nodes}
            initialEdges={flow!.edges}
            onSave={({ nodes, edges }) => saveMutation.mutateAsync({ nodes, edges })}
          />
        )}
      </div>

      {/* New Workflow Modal */}
      {newOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setNewOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Create Workflow</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setNewOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                <div className="form-field">
                  <label className="form-label required">Name</label>
                  <input className="form-input" value={newName} onChange={e => { setNewName(e.target.value); setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '_')) }} placeholder="Material Requisition" />
                </div>
                <div className="form-field">
                  <label className="form-label required">Slug (ID)</label>
                  <input className="form-input" value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="material_requisition" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }} />
                </div>
                <div className="form-field">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!newName || !newSlug}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
