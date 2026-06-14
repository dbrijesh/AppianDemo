import { useCallback, useState, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  Panel,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Save, Undo2, Redo2, Code2, X } from 'lucide-react'
import { Button } from '../../design-system'
import { NodePalette } from './NodePalette'
import { NodeConfigPanel } from './NodeConfigPanel'
import { TaskNode } from './nodes/TaskNode'
import { GatewayNode } from './nodes/GatewayNode'
import { TimerNode } from './nodes/TimerNode'
import { AgentNode } from './nodes/AgentNode'
import { ESignNode } from './nodes/ESignNode'
import { StartNode } from './nodes/StartNode'
import { EndNode } from './nodes/EndNode'
import { IntegrationNode } from './nodes/IntegrationNode'
import { LogicNode } from './nodes/LogicNode'
import './WorkflowEditor.css'

const nodeTypes = {
  start:       StartNode,
  end:         EndNode,
  task:        TaskNode,
  gateway:     GatewayNode,
  timer:       TimerNode,
  agent_step:  AgentNode,
  esign:       ESignNode,
  integration: IntegrationNode,
  logic:       LogicNode,
}

const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#94a3b8' },
  style: { stroke: '#94a3b8', strokeWidth: 1.5 },
  labelStyle: { fontSize: 11, fill: '#64748b', fontWeight: 500 },
  labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
}

interface Props {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onSave: (graph: { nodes: Node[]; edges: Edge[] }) => Promise<void>
  readOnly?: boolean
  definitionName?: string
}

export function WorkflowEditor({ initialNodes = [], initialEdges = [], onSave, readOnly, definitionName }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<Array<{ nodes: Node[]; edges: Edge[] }>>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null)
  const [showSource, setShowSource] = useState(false)
  const nodeIdCounter = useRef(100)

  const pushHistory = useCallback((n: Node[], e: Edge[]) => {
    setHistory(h => [...h.slice(0, historyIdx + 1), { nodes: n, edges: e }])
    setHistoryIdx(i => i + 1)
  }, [historyIdx])

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => {
      const newEdges = addEdge({ ...connection, ...defaultEdgeOptions }, eds)
      return newEdges
    })
  }, [setEdges])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/mgp-node-type')
    const label = event.dataTransfer.getData('application/mgp-node-label')
    if (!type || !reactFlowInstance) return

    const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const id = `node_${++nodeIdCounter.current}`
    const newNode: Node = {
      id,
      type,
      position,
      data: { label, config: { role: 'operator', sla_hours: 24, description: '' } },
    }
    setNodes(nds => [...nds, newNode])
    pushHistory([...nodes, newNode], edges)
  }, [reactFlowInstance, nodes, edges, setNodes, pushHistory])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => setSelectedNode(null), [])

  const updateNodeConfig = useCallback((nodeId: string, config: Record<string, any>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, config } } : n))
  }, [setNodes])

  const updateNodeLabel = useCallback((nodeId: string, label: string) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, label } } : n))
  }, [setNodes])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ nodes: nodes.map(n => ({ ...n })), edges: edges.map(e => ({ ...e })) })
    } finally {
      setSaving(false)
    }
  }

  const undo = () => {
    if (historyIdx <= 0) return
    const prev = history[historyIdx - 1]
    setNodes(prev.nodes)
    setEdges(prev.edges)
    setHistoryIdx(i => i - 1)
  }

  const redo = () => {
    if (historyIdx >= history.length - 1) return
    const next = history[historyIdx + 1]
    setNodes(next.nodes)
    setEdges(next.edges)
    setHistoryIdx(i => i + 1)
  }

  return (
    <div className="wf-editor">
      {/* Toolbar */}
      <div className="wf-toolbar">
        <div className="wf-toolbar-left">
          <span className="wf-def-name">{definitionName ?? 'Untitled Workflow'}</span>
        </div>
        <div className="wf-toolbar-right">
          <Button variant="ghost" size="sm" onClick={() => setShowSource(s => !s)} title="View source JSON">
            <Code2 size={15} /> {showSource ? 'Hide Source' : 'View Source'}
          </Button>
          {!readOnly && (
            <>
              <div className="wf-divider" />
              <Button variant="ghost" size="sm" onClick={undo} disabled={historyIdx <= 0} title="Undo">
                <Undo2 size={15} />
              </Button>
              <Button variant="ghost" size="sm" onClick={redo} disabled={historyIdx >= history.length - 1} title="Redo">
                <Redo2 size={15} />
              </Button>
              <div className="wf-divider" />
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving} icon={<Save size={14} />}>
                Save & Publish
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="wf-body">
        {/* Node Palette */}
        {!readOnly && <NodePalette />}

        {/* Canvas */}
        <div className="wf-canvas" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            proOptions={{ hideAttribution: true }}
            deleteKeyCode="Delete"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
            <Controls showInteractive={!readOnly} />
            <MiniMap
              nodeColor={n => {
                const map: Record<string, string> = { start: '#15803d', end: '#0f2040', task: '#0369a1', gateway: '#b45309', timer: '#7c3aed', agent_step: '#0891b2', esign: '#be185d' }
                return map[n.type ?? ''] ?? '#94a3b8'
              }}
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
            />
            <Panel position="top-right">
              <div className="wf-legend">
                {[
                  { type: 'start',      color: '#15803d', label: 'Start' },
                  { type: 'task',       color: '#0369a1', label: 'Task' },
                  { type: 'gateway',    color: '#b45309', label: 'Gateway' },
                  { type: 'timer',      color: '#7c3aed', label: 'Timer' },
                  { type: 'agent_step', color: '#0891b2', label: 'AI Agent' },
                  { type: 'esign',      color: '#be185d', label: 'E-Sign' },
                  { type: 'end',        color: '#0f2040', label: 'End' },
                ].map(item => (
                  <div key={item.type} className="wf-legend-item">
                    <span className="wf-legend-dot" style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Config Panel — derive live node so controlled inputs reflect current state */}
        {selectedNode && !readOnly && !showSource && (() => {
          const liveNode = nodes.find(n => n.id === selectedNode.id) ?? null
          if (!liveNode) return null
          return (
            <NodeConfigPanel
              node={liveNode}
              onUpdateConfig={updateNodeConfig}
              onUpdateLabel={updateNodeLabel}
              onClose={() => setSelectedNode(null)}
            />
          )
        })()}

        {/* Source Panel */}
        {showSource && (
          <div className="wf-source-panel">
            <div className="wf-source-header">
              <div>
                <span className="wf-source-title">Workflow Source</span>
                <span className="wf-source-badge">MGP JSON — not BPMN</span>
              </div>
              <button className="wf-source-close" onClick={() => setShowSource(false)}><X size={14} /></button>
            </div>
            <div className="wf-source-note">
              This platform uses a proprietary JSON graph format (nodes + edges), not BPMN 2.0 XML.
              It covers the same constructs as Appian: Start/End, Human Task, Gateway, Timer, plus
              MGP-native AI Agent Step and E-Signature nodes. Export/import via the API at{' '}
              <code>GET /v1/definitions/:id</code>.
            </div>
            <pre className="wf-source-pre">
              {JSON.stringify(
                {
                  nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.data?.label, config: n.data?.config, position: n.position })),
                  edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label, condition: (e as any).data?.condition })),
                },
                null, 2
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
