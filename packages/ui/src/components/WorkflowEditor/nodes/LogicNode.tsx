import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'

export function LogicNode({ data, selected }: NodeProps) {
  const cfg: any = (data?.config as any) ?? {}
  const expr = cfg.expression || 'expression'
  const exprShort = expr.length > 30 ? expr.slice(0, 28) + '…' : expr
  return (
    <div className={`wf-node node-logic ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="wf-node-header">
        <GitBranch size={13} />
        <span>{String(data?.label ?? 'Logic Branch')}</span>
      </div>
      <div className="wf-node-body" style={{ fontFamily: 'monospace', fontSize: 10 }}>
        if ({exprShort})
      </div>
      <div className="wf-node-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: '#16a34a' }}>true →</span>
        <span style={{ fontSize: 10, color: '#dc2626' }}>false →</span>
      </div>
      <Handle type="source" position={Position.Right} id="true" style={{ top: '35%' }} />
      <Handle type="source" position={Position.Right} id="false" style={{ top: '65%' }} />
    </div>
  )
}
