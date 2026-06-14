import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PenLine } from 'lucide-react'

export function ESignNode({ data, selected }: NodeProps) {
  const cfg: any = (data?.config as any) ?? {}
  return (
    <div className={`wf-node node-esign ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="wf-node-header">
        <PenLine size={13} />
        <span>{String(data?.label ?? 'E-Signature')}</span>
      </div>
      {cfg.meaning && (
        <div className="wf-node-body" style={{ fontStyle: 'italic' }}>"{cfg.meaning}"</div>
      )}
      <div className="wf-node-footer">
        <span className="wf-node-role">21 CFR Part 11</span>
        <span className="wf-node-role">{cfg.role ?? 'admin'}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
