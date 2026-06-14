import { useAuthStore } from '../stores/auth'

// Use relative paths — nginx proxies /api/<svc>/ to the correct backend port.
// In dev, vite.config.ts proxy rules handle these same paths.
const IDENTITY = '/api/identity'
const WORKFLOW  = '/api/workflow'
const TASKS     = '/api/tasks'
const AUDIT     = '/api/audit'
const AGENT     = '/api/agents'

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) {
    useAuthStore.getState().clearAuth()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Identity API ────────────────────────────────────────────────────────────
export const identityApi = {
  login: (email: string, password: string) =>
    request<{ access_token: string; user: any }>(`${IDENTITY}/v1/auth/token`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<any>(`${IDENTITY}/v1/auth/me`),
  listUsers: (limit = 50) => request<any>(`${IDENTITY}/v1/users?limit=${limit}`),
  createUser: (body: any) => request<any>(`${IDENTITY}/v1/users`, { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id: string, body: any) => request<any>(`${IDENTITY}/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
}

// ── Workflow API ─────────────────────────────────────────────────────────────
export const workflowApi = {
  listDefinitions: () => request<any[]>(`${WORKFLOW}/v1/definitions`),
  getDefinition: (id: string) => request<any>(`${WORKFLOW}/v1/definitions/${id}`),
  createDefinition: (body: any, creatorId: string) =>
    request<any>(`${WORKFLOW}/v1/definitions?creator_id=${creatorId}`, { method: 'POST', body: JSON.stringify(body) }),
  updateDefinition: (id: string, body: any, updaterId: string) =>
    request<any>(`${WORKFLOW}/v1/definitions/${id}?updater_id=${updaterId}`, { method: 'PUT', body: JSON.stringify(body) }),
  startInstance: (slug: string, body: any) =>
    request<any>(`${WORKFLOW}/v1/definitions/${slug}/start`, { method: 'POST', body: JSON.stringify(body) }),
  listInstances: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {}).toString()
    return request<any>(`${WORKFLOW}/v1/instances${qs ? '?' + qs : ''}`)
  },
  getInstance: (id: string) => request<any>(`${WORKFLOW}/v1/instances/${id}`),
  getHistory: (id: string) => request<any[]>(`${WORKFLOW}/v1/instances/${id}/history`),
  signal: (id: string, body: any) =>
    request<any>(`${WORKFLOW}/v1/instances/${id}/signal`, { method: 'POST', body: JSON.stringify(body) }),
}

// ── Task API ─────────────────────────────────────────────────────────────────
export const taskApi = {
  listTasks: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {}).toString()
    return request<any>(`${TASKS}/v1/tasks${qs ? '?' + qs : ''}`)
  },
  getTask: (id: string) => request<any>(`${TASKS}/v1/tasks/${id}`),
  claimTask: (id: string, userId: string, email: string) =>
    request<any>(`${TASKS}/v1/tasks/${id}/claim`, { method: 'POST', body: JSON.stringify({ user_id: userId, user_email: email }) }),
  completeTask: (id: string, body: any) =>
    request<any>(`${TASKS}/v1/tasks/${id}/complete`, { method: 'POST', body: JSON.stringify(body) }),
  reassignTask: (id: string, body: any) =>
    request<any>(`${TASKS}/v1/tasks/${id}/reassign`, { method: 'POST', body: JSON.stringify(body) }),
  uploadAttachment: async (taskId: string, file: File): Promise<{ filename: string; url: string }> => {
    const token = useAuthStore.getState().token
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${TASKS}/v1/tasks/${taskId}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
}

// ── Audit API ─────────────────────────────────────────────────────────────────
export const auditApi = {
  listEvents: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {}).toString()
    return request<any>(`${AUDIT}/v1/events${qs ? '?' + qs : ''}`)
  },
  verifyChain: () => request<any>(`${AUDIT}/v1/chain/verify`),
}

// ── Agent API ─────────────────────────────────────────────────────────────────
export const agentApi = {
  invoke: (body: any) => request<any>(`${AGENT}/v1/agents/invoke`, { method: 'POST', body: JSON.stringify(body) }),
  listTypes: () => request<{ types: string[]; pipelines: { id: string; name: string; description: string }[] }>(`${AGENT}/v1/agents/types`),
  listTraces: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {}).toString()
    return request<any[]>(`${AGENT}/v1/agents/traces${qs ? '?' + qs : ''}`)
  },
  // Pipeline CRUD
  listPipelines: () => request<any[]>(`${AGENT}/v1/pipelines`),
  getPipeline: (id: string) => request<any>(`${AGENT}/v1/pipelines/${id}`),
  createPipeline: (body: any) => request<any>(`${AGENT}/v1/pipelines`, { method: 'POST', body: JSON.stringify(body) }),
  updatePipeline: (id: string, body: any) => request<any>(`${AGENT}/v1/pipelines/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePipeline: (id: string) => request<void>(`${AGENT}/v1/pipelines/${id}`, { method: 'DELETE' }),

  dbQuery: (question: string, maxRows = 50) =>
    request<{
      sql: string
      columns: string[]
      rows: unknown[][]
      row_count: number
      execution_ms: number
      explanation: string
      error: string | null
    }>(`${AGENT}/v1/admin/db-query`, {
      method: 'POST',
      body: JSON.stringify({ question, max_rows: maxRows }),
    }),
}
