import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Plug } from 'lucide-react'

export function IntegrationNode({ data, selected }: NodeProps) {
  const cfg: any = (data?.config as any) ?? {}
  const method = cfg.method || 'POST'
  const urlShort = cfg.url ? cfg.url.replace(/^https?:\/\//, '').split('/')[0] : 'No URL'
  return (
    <div className={`wf-node node-integration ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="wf-node-header">
        <Plug size={13} />
        <span>{String(data?.label ?? 'Integration')}</span>
      </div>
      <div className="wf-node-body">
        <span className="wf-badge" style={{ background: '#0e7490', color: '#fff', fontFamily: 'monospace' }}>{method}</span>
        &nbsp;{urlShort}
      </div>
      <div className="wf-node-footer">
        <span style={{ fontSize: 10, color: 'var(--color-slate-400)' }}>Auto-executes · REST / DB / ITSM</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
