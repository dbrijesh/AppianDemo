import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Clock } from 'lucide-react'

export function TimerNode({ data, selected }: NodeProps) {
  const cfg: any = (data?.config as any) ?? {}
  return (
    <div className={`wf-node node-timer ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="wf-node-header">
        <Clock size={13} />
        <span>{String(data?.label ?? 'Timer')}</span>
      </div>
      {cfg.wait_hours && (
        <div className="wf-node-body">Wait: {cfg.wait_hours}h</div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
