import { Handle, Position, type NodeProps } from '@xyflow/react'

export function StartNode({ data, selected }: NodeProps) {
  return (
    <div className={`wf-node node-start ${selected ? 'selected' : ''}`} style={{ minWidth: 80 }}>
      <div className="wf-node-header" style={{ justifyContent: 'center', borderRadius: 'calc(var(--border-radius-md) - 1.5px)' }}>
        <span>{String(data?.label ?? 'Start')}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
