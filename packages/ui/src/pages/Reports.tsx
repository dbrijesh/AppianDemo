import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { workflowApi } from '../api/client'

// ── Static cost reference data (Hexaware manufacturing project dataset) ────────
const TOP_CUSTOMERS = [
  { name: 'Mahindra', value: 190 },
  { name: 'Tata Motors', value: 170 },
  { name: 'Honda', value: 150 },
  { name: 'Hyundai', value: 120 },
  { name: 'Maruti Suzuki', value: 100 },
  { name: 'Nissan Mo.', value: 80 },
  { name: 'Ashok Ley.', value: 60 },
  { name: 'Mercedes', value: 45 },
  { name: 'Bajaj Auto', value: 30 },
]
const TOP_INDUSTRIES = [
  { name: 'Heavy Industry', value: 205 },
  { name: 'Chemical',       value: 185 },
  { name: 'Aerospace',      value: 180 },
  { name: 'Automotive',     value: 183 },
  { name: 'Mining',         value: 130 },
]
const COST_TYPE = [
  { name: 'Labor',    value: 31.9, color: '#0369a1' },
  { name: 'Material', value: 43.1, color: '#0891b2' },
  { name: 'Overhead', value: 25.0, color: '#64748b' },
]
const COST_PROCESS = [
  { name: 'Inventory',      value: 55.7, color: '#0f2040' },
  { name: 'D&E',            value: 7.7,  color: '#0369a1' },
  { name: 'Dispatch',       value: 4.8,  color: '#64748b' },
  { name: 'Rework',         value: 5.3,  color: '#be185d' },
  { name: 'Inspection',     value: 5.4,  color: '#7c3aed' },
  { name: 'Production',     value: 6.0,  color: '#0891b2' },
  { name: 'Prod Planning',  value: 6.4,  color: '#b45309' },
  { name: 'Purchase',       value: 8.7,  color: '#15803d' },
]

const DEEP_DIVE_DATA: Record<string, any> = {
  Aerospace: {
    customers: ['Boeing Supplier', 'Safran', 'Honeywell Aero'],
    projects: { 'Boeing Supplier': ['PRJ-AE-001', 'PRJ-AE-002'], 'Safran': ['PRJ-AE-003'], 'Honeywell Aero': ['PRJ-AE-004'] },
    kpi: { sales: 1_240_000, cost: 1_108_000, margin: 10.65, budgetVar: 1.2 },
    costType: [
      { name: 'Labor', value: 38.0, color: '#0369a1' },
      { name: 'Material', value: 42.0, color: '#0891b2' },
      { name: 'Overhead', value: 20.0, color: '#64748b' },
    ],
    costProcess: COST_PROCESS,
    budgetVsActual: [{ name: 'Avg Budget', v: 48000 }, { name: 'Avg Actual', v: 43000 }],
  },
  Automotive: {
    customers: ['Tata Motors', 'Honda', 'Maruti Suzuki'],
    projects: { 'Tata Motors': ['PRJ-AU-101', 'PRJ-AU-102'], 'Honda': ['PRJ-AU-103'], 'Maruti Suzuki': ['PRJ-AU-104'] },
    kpi: { sales: 909_161, cost: 866_072, margin: 4.74, budgetVar: -0.0 },
    costType: COST_TYPE,
    costProcess: COST_PROCESS,
    budgetVsActual: [{ name: 'Avg Budget', v: 32000 }, { name: 'Avg Actual', v: 28000 }],
  },
  Chemical: {
    customers: ['BASF India', 'Reliance Chem', 'UPL Ltd'],
    projects: { 'BASF India': ['PRJ-CH-201'], 'Reliance Chem': ['PRJ-CH-202', 'PRJ-CH-203'], 'UPL Ltd': ['PRJ-CH-204'] },
    kpi: { sales: 780_500, cost: 742_000, margin: 4.93, budgetVar: 0.8 },
    costType: [
      { name: 'Labor', value: 25.0, color: '#0369a1' },
      { name: 'Material', value: 52.0, color: '#0891b2' },
      { name: 'Overhead', value: 23.0, color: '#64748b' },
    ],
    costProcess: COST_PROCESS,
    budgetVsActual: [{ name: 'Avg Budget', v: 27000 }, { name: 'Avg Actual', v: 25700 }],
  },
  Mining: {
    customers: ['Rio Tinto', 'BHP Billiton', 'Coal India'],
    projects: { 'Rio Tinto': ['PRJ-MI-301', 'PRJ-MI-302'], 'BHP Billiton': ['PRJ-MI-303'], 'Coal India': ['PRJ-MI-304'] },
    kpi: { sales: 620_000, cost: 589_000, margin: 5.0, budgetVar: 1.5 },
    costType: [
      { name: 'Labor', value: 28.0, color: '#0369a1' },
      { name: 'Material', value: 48.0, color: '#0891b2' },
      { name: 'Overhead', value: 24.0, color: '#64748b' },
    ],
    costProcess: COST_PROCESS,
    budgetVsActual: [{ name: 'Avg Budget', v: 38000 }, { name: 'Avg Actual', v: 35000 }],
  },
}

function fmt(n: number) { return '$' + n.toLocaleString() }

// ── Macro Tab ─────────────────────────────────────────────────────────────────
function MacroTab({ mrItems }: { mrItems: any[] }) {
  // Derive live customer data from real MRs where possible
  const liveCustMap: Record<string, number> = {}
  mrItems.forEach(m => {
    const name = m.context?.project?.customer_name?.split(' ')[0]
    const cost = m.context?.total_cost ?? 0
    if (name) liveCustMap[name] = (liveCustMap[name] ?? 0) + Math.round(cost / 1000)
  })

  // Merge live data into static customer chart
  const customerData = TOP_CUSTOMERS.map(c => ({
    name: c.name,
    value: liveCustMap[c.name] !== undefined ? liveCustMap[c.name] + c.value : c.value,
    live: liveCustMap[c.name] ?? 0,
  })).sort((a, b) => b.value - a.value)

  const industryData = TOP_INDUSTRIES.map(i => {
    const liveVal = mrItems
      .filter(m => m.context?.project?.industry?.includes(i.name.split(' ')[0]))
      .reduce((s: number, m: any) => s + Math.round((m.context?.total_cost ?? 0) / 1000), 0)
    return { name: i.name, value: i.value + liveVal }
  }).sort((a, b) => b.value - a.value)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
      <div className="card">
        <div className="card-header"><h3 className="card-title">Top Customers by Revenue (000 USD)</h3></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={customerData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v: number) => [`$${v}K`, 'Revenue']} />
              <Bar dataKey="value" fill="#0f2040" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Industry Segments by Revenue (000 USD)</h3></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={industryData} layout="vertical" margin={{ left: 110 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
              <Tooltip formatter={(v: number) => [`$${v}K`, 'Revenue']} />
              <Bar dataKey="value" fill="#0891b2" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-header"><h3 className="card-title">MR Material Value by Project</h3></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={mrItems
                  .filter(m => m.context?.project?.project_id && m.context?.total_cost)
                  .map(m => ({ project: m.context.project.project_id, budget: Math.round(m.context.total_cost * 1.15), actual: m.context.total_cost }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="project" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="budget" name="Budget" fill="#0f2040" />
                <Bar dataKey="actual" name="Actual Cost" fill="#0891b2" />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', justifyContent: 'center' }}>
              {[
                { label: 'Total MR Value', value: fmt(mrItems.reduce((s, m) => s + (m.context?.total_cost ?? 0), 0)) },
                { label: 'Completed / Released', value: mrItems.filter(m => m.status === 'completed').length },
                { label: 'Avg Cost per MR', value: mrItems.length > 0 ? fmt(Math.round(mrItems.reduce((s, m) => s + (m.context?.total_cost ?? 0), 0) / mrItems.length)) : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: 'var(--space-3)', background: 'var(--color-slate-50)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">High-Level Cost Structure</h3></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={COST_TYPE} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                dataKey="value" label={({ name, value }) => `${name} ${value}%`} labelLine>
                {COST_TYPE.map(e => <Cell key={e.name} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Cost by Functional Area</h3></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={COST_PROCESS} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value">
                {COST_PROCESS.map(e => <Cell key={e.name} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Legend iconType="circle" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ── Deep Dive Tab ─────────────────────────────────────────────────────────────
function DeepDiveTab({ mrItems }: { mrItems: any[] }) {
  const [industry, setIndustry] = useState('')
  const [customer, setCustomer] = useState('')
  const [project, setProject] = useState('')

  const ALL_INDUSTRIES = Object.keys(DEEP_DIVE_DATA)
  const indData = industry ? DEEP_DIVE_DATA[industry] : null
  const customers = indData ? indData.customers : []
  const projects = (indData && customer && indData.projects[customer]) ? indData.projects[customer] : []
  const kpi = indData ? indData.kpi : { sales: 909_161, cost: 866_072, margin: 4.74, budgetVar: -0.0 }
  const costType = indData ? indData.costType : COST_TYPE
  const costProcess = indData ? indData.costProcess : COST_PROCESS
  const budgetVsActual = indData ? indData.budgetVsActual : [{ name: 'Avg Budget', v: 32000 }, { name: 'Avg Actual', v: 28000 }]

  // Live MRs for selected industry
  const liveMRs = industry
    ? mrItems.filter(m => m.context?.project?.industry?.toLowerCase().includes(industry.toLowerCase()))
    : mrItems

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="form-field">
          <label className="form-label">Industry</label>
          <select className="form-select" value={industry} onChange={e => { setIndustry(e.target.value); setCustomer(''); setProject('') }}>
            <option value="">— All Industries —</option>
            {ALL_INDUSTRIES.map(i => <option key={i}>{i}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label">Customer</label>
          <select className="form-select" value={customer} onChange={e => { setCustomer(e.target.value); setProject('') }} disabled={!industry}>
            <option value="">— All Customers —</option>
            {customers.map((c: string) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label">Project Reference</label>
          <select className="form-select" value={project} onChange={e => setProject(e.target.value)} disabled={!customer}>
            <option value="">— All Projects —</option>
            {projects.map((p: string) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="kpi-row" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="kpi-tile"><div className="kpi-label">Total Sales</div><div className="kpi-value">{fmt(kpi.sales)}</div></div>
        <div className="kpi-tile"><div className="kpi-label">Total Cost</div><div className="kpi-value">{fmt(kpi.cost)}</div></div>
        <div className="kpi-tile">
          <div className="kpi-label">Margin</div>
          <div className={`kpi-value ${kpi.margin >= 0 ? 'positive' : 'negative'}`}>{kpi.margin.toFixed(2)}%</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Budget Variance</div>
          <div className="kpi-value" style={{ color: kpi.budgetVar >= 0 ? 'var(--color-success)' : 'var(--color-slate-400)' }}>
            {kpi.budgetVar >= 0 ? '+' : ''}{kpi.budgetVar.toFixed(2)}%
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-6)' }}>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Cost Structure by Type</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={costType} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" label={({ name, value }) => `${name} ${value}%`} labelLine>
                  {costType.map((e: any) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Cost Structure by Process</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={costProcess} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value">
                  {costProcess.map((e: any) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Budget vs Actual</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={budgetVsActual} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip />
                <Bar dataKey="v" name="USD" radius={[0, 2, 2, 0]}>
                  <Cell fill="#0f2040" />
                  <Cell fill="#0891b2" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {liveMRs.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-6)' }}>
          <div className="card-header"><h3 className="card-title">Live MRs — {industry || 'All Industries'}</h3></div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr><th>Project ID</th><th>Customer</th><th>Industry</th><th>Material Value</th><th>Status</th></tr>
              </thead>
              <tbody>
                {liveMRs.map((m: any) => (
                  <tr key={m.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{m.context?.project?.project_id || m.id.slice(0, 10)}</td>
                    <td>{m.context?.project?.customer_name || '—'}</td>
                    <td>{m.context?.project?.industry || '—'}</td>
                    <td>{m.context?.total_cost ? fmt(m.context.total_cost) : '—'}</td>
                    <td><span className={`badge badge-${m.status === 'completed' ? 'success' : 'info'}`}>{m.status === 'completed' ? 'Released' : 'In Progress'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compliance Tab ────────────────────────────────────────────────────────────
function ComplianceTab({ certItems, devItems }: { certItems: any[], devItems: any[] }) {
  // Certificate type breakdown
  const certTypeMap: Record<string, number> = {}
  certItems.forEach(c => {
    const t = c.context?.cert_type || 'Other'
    certTypeMap[t] = (certTypeMap[t] ?? 0) + 1
  })
  const certTypeData = Object.entries(certTypeMap).map(([name, value]) => ({ name, value }))

  // Cert status breakdown
  const certStatusData = [
    { name: 'Active',    value: certItems.filter(c => c.status === 'completed').length, color: '#16a34a' },
    { name: 'In Review', value: certItems.filter(c => c.status === 'running').length,   color: '#0891b2' },
    { name: 'Rejected',  value: certItems.filter(c => c.status === 'failed').length,    color: '#dc2626' },
  ].filter(d => d.value > 0)

  // Deviation severity distribution
  const sevMap: Record<string, number> = {}
  devItems.forEach(d => {
    const s = d.context?.severity || 'Unknown'
    sevMap[s] = (sevMap[s] ?? 0) + 1
  })
  const SEV_COLORS: Record<string, string> = { Critical: '#dc2626', Major: '#f97316', Minor: '#eab308', Observation: '#64748b' }
  const sevData = Object.entries(sevMap).map(([name, value]) => ({ name, value, color: SEV_COLORS[name] || '#64748b' }))

  // Deviation category distribution
  const catMap: Record<string, number> = {}
  devItems.forEach(d => {
    const c = d.context?.category || 'Unknown'
    catMap[c] = (catMap[c] ?? 0) + 1
  })
  const CAT_COLORS = ['#0f2040', '#0369a1', '#0891b2', '#64748b', '#7c3aed', '#b45309']
  const catData = Object.entries(catMap).map(([name, value], i) => ({ name, value, color: CAT_COLORS[i % CAT_COLORS.length] }))

  // Deviation open vs closed by severity
  const devStatusBySev = ['Critical', 'Major', 'Minor', 'Observation'].map(sev => ({
    severity: sev,
    open:   devItems.filter(d => d.context?.severity === sev && d.status === 'running').length,
    closed: devItems.filter(d => d.context?.severity === sev && d.status === 'completed').length,
  })).filter(r => r.open + r.closed > 0)

  // KPI numbers
  const totalCerts = certItems.length
  const activeCerts = certItems.filter(c => c.status === 'completed').length
  const certRate = totalCerts > 0 ? Math.round(activeCerts / totalCerts * 100) : 0
  const totalDevs = devItems.length
  const closedDevs = devItems.filter(d => d.status === 'completed').length
  const openCritical = devItems.filter(d => d.context?.severity === 'Critical' && d.status === 'running').length
  const devRate = totalDevs > 0 ? Math.round(closedDevs / totalDevs * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top KPIs */}
      <div className="kpi-row">
        <div className="kpi-tile">
          <div className="kpi-label">Total Certificates</div>
          <div className="kpi-value">{totalCerts}</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Certificate Approval Rate</div>
          <div className={`kpi-value ${certRate >= 80 ? 'positive' : ''}`}>{certRate}%</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Total Deviations</div>
          <div className="kpi-value">{totalDevs}</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Deviation Closure Rate</div>
          <div className={`kpi-value ${devRate >= 70 ? 'positive' : ''}`}>{devRate}%</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Critical Deviations Open</div>
          <div className="kpi-value" style={{ color: openCritical > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{openCritical}</div>
        </div>
      </div>

      {/* Charts row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-6)' }}>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Certificate Status</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={certStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine>
                  {certStatusData.map(e => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Certificates by Type</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={certTypeData} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                <Tooltip />
                <Bar dataKey="value" name="Count" fill="#0e7490" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Deviation Severity Distribution</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sevData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine>
                  {sevData.map(e => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Deviations Open vs Closed by Severity</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={devStatusBySev}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="severity" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="open"   name="Open"   fill="#f97316" radius={[2, 2, 0, 0]} />
                <Bar dataKey="closed" name="Closed" fill="#16a34a" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Deviations by Category</h3></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={catData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="value" name="Count" radius={[0, 3, 3, 0]}>
                  {catData.map(e => <Cell key={e.name} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Deviation detail table */}
      <div className="card">
        <div className="card-header"><h3 className="card-title">Open Deviations</h3></div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>ID</th><th>Title</th><th>Severity</th><th>Category</th><th>Current Step</th><th>Reported</th></tr>
            </thead>
            <tbody>
              {devItems.filter(d => d.status === 'running').map((d: any) => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{d.entity_id || d.id.slice(0, 10)}</td>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.context?.title || '—'}</td>
                  <td>
                    <span className={`badge badge-${d.context?.severity === 'Critical' ? 'danger' : d.context?.severity === 'Major' ? 'warning' : 'default'}`}>
                      {d.context?.severity || '—'}
                    </span>
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)' }}>{d.context?.category || '—'}</td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)' }}>
                    {d.current_node_id?.replace(/_/g, ' ') || '—'}
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                    {new Date(d.started_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {devItems.filter(d => d.status === 'running').length === 0 && (
                <tr><td colSpan={6}><div className="table-empty">No open deviations</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main Reports Page ─────────────────────────────────────────────────────────
const TABS = ['Macro-Level Cost Governance', 'Deep-Dive Cost Governance', 'Compliance & Governance']

export function Reports() {
  const [activeTab, setActiveTab] = useState(0)

  const { data: certResp } = useQuery({
    queryKey: ['rep-certs'],
    queryFn: () => workflowApi.listInstances({ slug: 'certificate_management', limit: '200' }),
  })
  const { data: mrResp } = useQuery({
    queryKey: ['rep-mrs'],
    queryFn: () => workflowApi.listInstances({ slug: 'material_requisition', limit: '200' }),
  })
  const { data: devResp } = useQuery({
    queryKey: ['rep-devs'],
    queryFn: () => workflowApi.listInstances({ slug: 'deviation_capa', limit: '200' }),
  })

  const certItems: any[] = certResp?.items ?? []
  const mrItems: any[]   = mrResp?.items ?? []
  const devItems: any[]  = devResp?.items ?? []

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
      </div>

      <div className="tabs" style={{ marginBottom: 'var(--space-6)' }}>
        {TABS.map((t, i) => (
          <button key={t} className={`tab ${activeTab === i ? 'active' : ''}`} onClick={() => setActiveTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 0 && <MacroTab mrItems={mrItems} />}
      {activeTab === 1 && <DeepDiveTab mrItems={mrItems} />}
      {activeTab === 2 && <ComplianceTab certItems={certItems} devItems={devItems} />}
    </div>
  )
}
