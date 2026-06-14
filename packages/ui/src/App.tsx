import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './components/AppShell'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Tasks } from './pages/Tasks'
import { Certificates } from './pages/Certificates'
import { Reports } from './pages/Reports'
import { WorkflowDesigner } from './pages/Admin/WorkflowDesigner'
import { Users } from './pages/Admin/Users'
import { AuditLog } from './pages/Admin/AuditLog'
import { DBAgent } from './pages/Admin/DBAgent'
import { AgentPlayground } from './pages/Admin/AgentPlayground'
import { AgentBuilder } from './pages/Admin/AgentBuilder'
import { Deviations } from './pages/Deviations'
import { MaterialRequisitionList } from './pages/MaterialRequisition/List'
import { CreateMR } from './pages/MaterialRequisition/Create'
import { WorkflowsPage } from './pages/Workflows'
import { useAuthStore } from './stores/auth'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="mr" element={<MaterialRequisitionList />} />
            <Route path="mr/new" element={<CreateMR />} />
            <Route path="certificates" element={<Certificates />} />
            <Route path="reports" element={<Reports />} />
            <Route path="admin/workflows" element={<WorkflowDesigner />} />
            <Route path="admin/users" element={<Users />} />
            <Route path="admin/audit" element={<AuditLog />} />
            <Route path="admin/db-agent" element={<DBAgent />} />
            <Route path="admin/agents" element={<AgentPlayground />} />
            <Route path="admin/agent-builder" element={<AgentBuilder />} />
            <Route path="deviations" element={<Deviations />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
