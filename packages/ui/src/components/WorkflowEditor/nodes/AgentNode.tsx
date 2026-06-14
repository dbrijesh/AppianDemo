import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bot } from 'lucide-react'

export function AgentNode({ data, selected }: NodeProps) {
  const cfg: any = (data?.config as any) ?? {}
  return (
    <div className={`wf-node node-agent ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="wf-node-header">
        <Bot size={13} />
        <span>{String(data?.label ?? 'AI Agent')}</span>
      </div>
      {cfg.agent_type && (
        <div className="wf-node-body">{cfg.agent_type.replace(/_/g, ' ')}</div>
      )}
      <div className="wf-node-footer">
        <span style={{ fontSize: 10, color: 'var(--color-slate-400)' }}>Proposes only — human approves</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
