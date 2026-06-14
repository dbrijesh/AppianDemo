import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CheckSquare, Clock } from 'lucide-react'

export function TaskNode({ data, selected }: NodeProps) {
  const cfg: any = (data?.config as any) ?? {}
  return (
    <div className={`wf-node node-task ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="wf-node-header">
        <CheckSquare size={13} />
        <span>{String(data?.label ?? 'Task')}</span>
      </div>
      {cfg.description && (
        <div className="wf-node-body">{cfg.description}</div>
      )}
      <div className="wf-node-footer">
        <span className="wf-node-role">{cfg.role ?? 'operator'}</span>
        {cfg.sla_hours && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-slate-400)' }}>
            <Clock size={10} />{cfg.sla_hours}h
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
