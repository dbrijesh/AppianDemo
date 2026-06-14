import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Award, AlertTriangle, Package, CheckSquare, TrendingUp, TrendingDown } from 'lucide-react'
import { taskApi, workflowApi } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { formatDistanceToNow } from 'date-fns'
import './Dashboard.css'

const COST_TABLE = [
  { process: 'D&E',                 labor: 3790,  material: 0,       overhead: 1263 },
  { process: 'Stores',              labor: 1520,  material: 23336,   overhead: 8285 },
  { process: 'Purchase',            labor: 1290,  material: 4952,    overhead: 2081 },
  { process: 'Production Planning', labor: 2510,  material: 0,       overhead: 837  },
  { process: 'Production',          labor: 3805,  material: 0,       overhead: 1268 },
  { process: 'Inspection',          labor: 2415,  material: 0,       overhead: 805  },
  { process: 'Rework',              labor: 3290,  material: 0,       overhead: 1097 },
  { process: 'Dispatch',            labor: 1950,  material: 0,       overhead: 650  },
]
const PIE_PROCESS = [
  { name: 'Inventory',           value: 50.9, color: '#0f2040' },
  { name: 'D&E',                 value: 7.8,  color: '#0369a1' },
  { name: 'Dispatch',            value: 4.0,  color: '#64748b' },
  { name: 'Rework',              value: 6.7,  color: '#be185d' },
  { name: 'Inspection',          value: 4.9,  color: '#7c3aed' },
  { name: 'Production',          value: 7.8,  color: '#0891b2' },
  { name: 'Prod Planning',       value: 5.1,  color: '#b45309' },
  { name: 'Purchase',            value: 12.8, color: '#15803d' },
]
const COST_STRUCT = [
  { name: 'Material', pct: 43.4, color: '#0891b2' },
  { name: 'Labor',    pct: 31.6, color: '#0369a1' },
  { name: 'Overhead', pct: 25.0, color: '#64748b' },
]

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const { data: myTasks } = useQuery({
    queryKey: ['tasks', 'open'],
    queryFn: () => taskApi.listTasks({ status: 'open', limit: '100' }),
    refetchInterval: 30_000,
  })
  const { data: certs } = useQuery({
    queryKey: ['dash-certs'],
    queryFn: () => workflowApi.listInstances({ slug: 'certificate_management', limit: '100' }),
    refetchInterval: 30_000,
  })
  const { data: mrs } = useQuery({
    queryKey: ['dash-mrs'],
    queryFn: () => workflowApi.listInstances({ slug: 'material_requisition', limit: '100' }),
    refetchInterval: 30_000,
  })
  const { data: devs } = useQuery({
    queryKey: ['dash-devs'],
    queryFn: () => workflowApi.listInstances({ slug: 'deviation_capa', limit: '100' }),
    refetchInterval: 30_000,
  })

  const certItems: any[]  = certs?.items ?? []
  const mrItems: any[]    = mrs?.items ?? []
  const devItems: any[]   = devs?.items ?? []
  const taskItems: any[]  = myTasks?.items ?? []

  const certsInReview = certItems.filter(c => c.status === 'running').length
  const certsActive   = certItems.filter(c => c.status === 'completed').length
  const mrsInProgress = mrItems.filter(m => m.status === 'running').length
  const mrsReleased   = mrItems.filter(m => m.status === 'completed').length
  const devsOpen      = devItems.filter(d => d.status === 'running').length
  const devsClosed    = devItems.filter(d => d.status === 'completed').length
  const myOpenTasks   = taskItems.length
  const overdueTasks  = taskItems.filter((t: any) => t.due_at && new Date(t.due_at) < new Date()).length

  const totalLabor    = COST_TABLE.reduce((s, r) => s + r.labor, 0)
  const totalMaterial = COST_TABLE.reduce((s, r) => s + r.material, 0)
  const totalOverhead = COST_TABLE.reduce((s, r) => s + r.overhead, 0)
  const totalCost     = totalLabor + totalMaterial + totalOverhead
  const revenue       = 74097
  const marginPct     = ((revenue - totalCost) / revenue * 100).toFixed(2)

  const allInstances: any[] = [
    ...(certItems), ...(mrItems), ...(devItems),
  ].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()).slice(0, 10)

  // Workflow throughput: running vs completed by slug
  const throughput = [
    { name: 'Certificates', running: certsInReview, done: certsActive },
    { name: 'Mat. Req.',    running: mrsInProgress,  done: mrsReleased },
    { name: 'Deviations',   running: devsOpen,        done: devsClosed },
  ]

  // MR customer bar data (now works after _payload unwrap in schema)
  const mrCustomerData = Object.values(
    mrItems.reduce((acc: any, m: any) => {
      const name = (m.context?.project?.customer_name ?? '').split(' ')[0] || '—'
      if (!name || name === '—') return acc
      acc[name] = acc[name] ?? { name, value: 0 }
      acc[name].value += Math.round((m.context?.total_cost ?? 0) / 1000)
      return acc
    }, {})
  ).sort((a: any, b: any) => b.value - a.value).slice(0, 8)

  const certRate = certItems.length > 0 ? Math.round(certsActive / certItems.length * 100) : 0
  const devRate  = devItems.length  > 0 ? Math.round(devsClosed  / devItems.length  * 100) : 0
  const mrRate   = mrItems.length   > 0 ? Math.round(mrsReleased / mrItems.length   * 100) : 0

  const KPI_CARDS = [
    { label: 'Certificates In Review', value: certsInReview, sub: `${certsActive} active`, color: '#0e7490', bg: '#ecfeff', Icon: Award,          to: '/certificates' },
    { label: 'Material Requisitions',   value: mrsInProgress,  sub: `${mrsReleased} released`, color: '#7c3aed', bg: '#f5f3ff', Icon: Package,        to: '/mr' },
    { label: 'Open Deviations',          value: devsOpen,       sub: `${devsClosed} closed`,   color: '#b45309', bg: '#fffbeb', Icon: AlertTriangle,  to: '/deviations' },
    { label: 'My Open Tasks',            value: myOpenTasks,    sub: overdueTasks > 0 ? `⚠ ${overdueTasks} overdue` : 'all on track', color: overdueTasks > 0 ? '#dc2626' : '#15803d', bg: overdueTasks > 0 ? '#fef2f2' : '#f0fdf4', Icon: CheckSquare, to: '/tasks' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.full_name || user?.email}</p>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="dash-kpi-row">
        {KPI_CARDS.map(k => (
          <div key={k.label} className="dash-kpi-card" style={{ borderTop: `3px solid ${k.color}`, cursor: 'pointer' }} onClick={() => navigate(k.to)}>
            <div className="dash-kpi-icon" style={{ background: k.bg }}>
              <k.Icon size={20} color={k.color} />
            </div>
            <div className="dash-kpi-body">
              <div className="dash-kpi-label">{k.label}</div>
              <div className="dash-kpi-number" style={{ color: k.color }}>{k.value}</div>
              <div className="dash-kpi-sub">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main 3-col row ─────────────────────────────────────────────────── */}
      <div className="dash-main-row">

        {/* Recent Activity */}
        <div className="card dash-activity-col">
          <div className="card-header"><h2 className="card-title">Recent Workflow Activity</h2></div>
          <div style={{ padding: '0 var(--space-5)', overflowY: 'auto', maxHeight: 420 }}>
            {allInstances.length === 0 && (
              <div style={{ color: 'var(--color-slate-400)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-6) 0' }}>No activity yet</div>
            )}
            {allInstances.map((inst: any) => {
              const slug = inst.definition_slug ?? ''
              const Icon = slug.includes('cert') ? Award : slug.includes('material') ? Package : AlertTriangle
              const color = slug.includes('cert') ? '#0e7490' : slug.includes('material') ? '#7c3aed' : '#b45309'
              const ctx = inst.context ?? {}
              const label = ctx.cert_name || ctx.project?.project_id || ctx.title || inst.id.slice(0, 8)
              const statusColor = inst.status === 'completed' ? 'var(--color-success)' : inst.status === 'failed' ? 'var(--color-danger)' : '#0891b2'
              const statusLabel = inst.status === 'completed' ? 'Done' : inst.status === 'running' ? 'Active' : inst.status
              return (
                <div key={inst.id} className="dash-activity-row">
                  <div className="dash-activity-icon" style={{ background: color + '18' }}>
                    <Icon size={13} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-slate-500)' }}>
                      {titleCase(slug)} · {inst.current_node_id ? titleCase(inst.current_node_id) : inst.status}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: statusColor }}>{statusLabel}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-slate-400)' }}>
                      {formatDistanceToNow(new Date(inst.started_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Financial + Compliance stacked */}
        <div className="dash-right-col">

          {/* Financial summary */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Financial Summary</h2></div>
            <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                {[
                  { label: 'Revenue', value: fmt(revenue), color: '#15803d' },
                  { label: 'Total Cost', value: fmt(totalCost), color: '#0369a1' },
                  { label: 'Margin', value: `${marginPct}%`, color: Number(marginPct) > 0 ? '#15803d' : '#dc2626' },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center', padding: 'var(--space-2)', background: 'var(--color-slate-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--color-slate-500)', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
              {/* Cost structure as compact horizontal bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {COST_STRUCT.map(c => (
                  <div key={c.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-slate-600)', marginBottom: 3 }}>
                      <span>{c.name}</span><span style={{ fontWeight: 600 }}>{c.pct}%</span>
                    </div>
                    <div style={{ height: 7, background: 'var(--color-slate-100)', borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${c.pct}%`, background: c.color, borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Compliance tiles */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Compliance Health</h2></div>
            <div style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[
                { label: 'Certificate Approval', rate: certRate, ok: certRate >= 80, detail: `${certsActive}/${certItems.length}` },
                { label: 'Deviation Closure',    rate: devRate,  ok: devRate >= 70,  detail: `${devsClosed}/${devItems.length}` },
                { label: 'MR Release Rate',       rate: mrRate,   ok: mrRate >= 70,   detail: `${mrsReleased}/${mrItems.length}` },
              ].map(({ label, rate, ok, detail }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-slate-600)' }}>{label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--color-slate-400)' }}>{detail}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: ok ? '#15803d' : '#f97316' }}>{rate}%</span>
                      {ok ? <TrendingUp size={13} color="#15803d" /> : <TrendingDown size={13} color="#f97316" />}
                    </div>
                  </div>
                  <div style={{ height: 8, background: 'var(--color-slate-100)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${rate}%`, borderRadius: 4,
                      background: ok ? 'linear-gradient(90deg, #15803d, #22c55e)' : 'linear-gradient(90deg, #f97316, #fb923c)',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts row ──────────────────────────────────────────────────────── */}
      <div className="dash-charts-row">

        {/* Workflow throughput */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">Workflow Throughput</h2></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={throughput} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend iconType="circle" iconSize={8} />
                <Bar dataKey="running" name="In Progress" fill="#0891b2" radius={[3, 3, 0, 0]} />
                <Bar dataKey="done"    name="Completed"   fill="#15803d" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* MR value by customer */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">MR Material Value by Customer</h2></div>
          <div className="card-body">
            {mrCustomerData.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 230, color: 'var(--color-slate-400)', fontSize: 'var(--text-sm)' }}>
                No MR data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={mrCustomerData as any} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="K" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip formatter={(v: number) => [`$${v}K`, 'Material Value']} />
                  <Bar dataKey="value" fill="#7c3aed" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Functional area donut */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">Cost by Functional Area</h2></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={PIE_PROCESS} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value">
                  {PIE_PROCESS.map(e => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Cost Incurred Table ──────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 'var(--space-6)' }}>
        <div className="card-header"><h2 className="card-title">Cost Incurred — Reference Project</h2></div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 160 }}></th>
                {COST_TABLE.map(r => <th key={r.process} style={{ fontSize: 11 }}>{r.process}</th>)}
                <th>Total</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Labor',    key: 'labor' as const,    total: totalLabor },
                { label: 'Material', key: 'material' as const, total: totalMaterial },
                { label: 'Overhead', key: 'overhead' as const, total: totalOverhead },
              ].map(row => (
                <tr key={row.label}>
                  <td style={{ fontWeight: 600 }}>{row.label}</td>
                  {COST_TABLE.map(r => (
                    <td key={r.process} style={{ fontSize: 12 }}>
                      {r[row.key] ? fmt(r[row.key]) : <span style={{ color: 'var(--color-slate-300)' }}>—</span>}
                    </td>
                  ))}
                  <td style={{ fontWeight: 600, fontSize: 12 }}>{fmt(row.total)}</td>
                  <td style={{ fontSize: 12 }}>{(row.total / totalCost * 100).toFixed(1)}%</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--color-slate-50)', fontWeight: 600 }}>
                <td>Total</td>
                {COST_TABLE.map(r => <td key={r.process} style={{ fontSize: 12 }}>{fmt(r.labor + r.material + r.overhead)}</td>)}
                <td style={{ fontSize: 12 }}>{fmt(totalCost)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
