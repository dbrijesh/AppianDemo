import { Handle, Position, type NodeProps } from '@xyflow/react'

export function EndNode({ data, selected }: NodeProps) {
  return (
    <div className={`wf-node node-end ${selected ? 'selected' : ''}`} style={{ minWidth: 80 }}>
      <Handle type="target" position={Position.Left} />
      <div className="wf-node-header" style={{ justifyContent: 'center', borderRadius: 'calc(var(--border-radius-md) - 1.5px)' }}>
        <span>{String(data?.label ?? 'End')}</span>
      </div>
    </div>
  )
}
