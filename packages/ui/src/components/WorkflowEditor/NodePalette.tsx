import { CheckSquare, GitFork, Clock, Bot, PenLine, Circle, Square, Plug, GitBranch } from 'lucide-react'

const PALETTE = [
  {
    section: 'Control',
    items: [
      { type: 'start',   label: 'Start',       icon: <Circle size={13} />,     color: '#15803d' },
      { type: 'end',     label: 'End',         icon: <Square size={13} />,     color: '#0f2040' },
    ],
  },
  {
    section: 'Process',
    items: [
      { type: 'task',    label: 'Human Task',  icon: <CheckSquare size={13} />, color: '#0369a1' },
      { type: 'gateway', label: 'Gateway',     icon: <GitFork size={13} />,     color: '#b45309' },
      { type: 'timer',   label: 'Timer / SLA', icon: <Clock size={13} />,       color: '#7c3aed' },
      { type: 'logic',   label: 'Logic Branch', icon: <GitBranch size={13} />,  color: '#9333ea' },
    ],
  },
  {
    section: 'AI & Compliance',
    items: [
      { type: 'agent_step',  label: 'AI Agent Step',  icon: <Bot size={13} />,    color: '#0891b2' },
      { type: 'esign',       label: 'E-Signature',    icon: <PenLine size={13} />, color: '#be185d' },
      { type: 'integration', label: 'Integration',    icon: <Plug size={13} />,    color: '#0e7490' },
    ],
  },
]

export function NodePalette() {
  const onDragStart = (e: React.DragEvent, type: string, label: string) => {
    e.dataTransfer.setData('application/mgp-node-type', type)
    e.dataTransfer.setData('application/mgp-node-label', label)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="wf-palette">
      {PALETTE.map(section => (
        <div key={section.section}>
          <div className="wf-palette-section">{section.section}</div>
          {section.items.map(item => (
            <div
              key={item.type}
              className="wf-palette-item"
              draggable
              onDragStart={e => onDragStart(e, item.type, item.label)}
              title={`Drag to add ${item.label}`}
            >
              <span className="wf-palette-dot" style={{ background: item.color }} />
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
