type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'navy'

interface Props {
  variant?: Variant
  dot?: boolean
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'default', dot, children, className = '' }: Props) {
  return (
    <span className={`badge badge-${variant} ${dot ? 'badge-dot' : ''} ${className}`}>
      {children}
    </span>
  )
}

export function statusBadge(status: string) {
  const map: Record<string, { variant: Variant; label: string }> = {
    open:       { variant: 'info',    label: 'Open' },
    claimed:    { variant: 'warning', label: 'In Progress' },
    completed:  { variant: 'success', label: 'Completed' },
    cancelled:  { variant: 'default', label: 'Cancelled' },
    escalated:  { variant: 'danger',  label: 'Escalated' },
    running:    { variant: 'info',    label: 'Running' },
    error:      { variant: 'danger',  label: 'Error' },
    approved:   { variant: 'success', label: 'Approved' },
    rejected:   { variant: 'danger',  label: 'Rejected' },
    active:     { variant: 'success', label: 'Active' },
    expired:    { variant: 'danger',  label: 'Expired' },
    expiring:   { variant: 'warning', label: 'Expiring' },
    pending:    { variant: 'default', label: 'Pending' },
  }
  const config = map[status?.toLowerCase()] ?? { variant: 'default', label: status }
  return <Badge variant={config.variant} dot>{config.label}</Badge>
}
