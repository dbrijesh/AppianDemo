import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitFork } from 'lucide-react'

export function GatewayNode({ data, selected }: NodeProps) {
  return (
    <div className={`wf-node node-gateway ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="wf-node-header">
        <GitFork size={13} />
        <span>{String(data?.label ?? 'Gateway')}</span>
      </div>
      <div className="wf-node-body" style={{ fontSize: 10, color: 'var(--color-slate-400)' }}>
        Routes on: approved / rejected
      </div>
      <Handle type="source" position={Position.Right} id="approved" style={{ top: '35%' }} />
      <Handle type="source" position={Position.Right} id="rejected" style={{ top: '65%' }} />
    </div>
  )
}
