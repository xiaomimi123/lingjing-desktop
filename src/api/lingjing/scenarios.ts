/**
 * 灵境工坊 / 虚拟公司 持久化 REST 客户端
 * server/scenarios-routes.js 的对端,数据落地本地 SQLite (data/wizard.db)。
 *
 * 用 fetch 走 vite proxy → 本地 server :3000;Authorization 走 auth_token。
 */
import { useAuthStore } from '@/stores/auth'

export interface Scenario {
  id: string
  name: string
  description: string
  status: 'draft' | 'active' | 'completed' | string
  scenarioType: 'workshop' | 'company'
  templateKey: string | null
  roleAssignments: Record<string, string>
  agents: string[]
  executionLog: any[]
  createdAt: number
  updatedAt: number
}

export interface ScenarioTask {
  id: string
  scenarioId: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | string
  assignedAgents: string[]
  priority: 'low' | 'medium' | 'high' | string
  mode: string
  createdAt: number
  updatedAt: number
}

export interface ScenarioMessage {
  id: string
  scenarioId: string
  fromAgent: string
  toAgent: string
  content: string
  type: 'task' | 'system' | 'reply' | string
  timestamp: number
}

interface RestEnvelope<T> {
  ok: boolean
  error?: { message: string }
}

function authHeader(): Record<string, string> {
  const token = useAuthStore().getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeader(),
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json()) as RestEnvelope<unknown> & T
  if (!res.ok || !data.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`)
  }
  return data
}

// ============ Scenarios ============
export async function listScenarios(type?: 'workshop' | 'company'): Promise<Scenario[]> {
  const r = await request<{ scenarios: Scenario[] }>(
    'GET',
    `/api/scenarios${type ? `?type=${type}` : ''}`,
  )
  return r.scenarios
}

export async function getScenario(id: string): Promise<Scenario> {
  const r = await request<{ scenario: Scenario }>('GET', `/api/scenarios/${id}`)
  return r.scenario
}

export async function createScenario(params: {
  name: string
  description?: string
  scenarioType: 'workshop' | 'company'
  templateKey?: string | null
  roleAssignments?: Record<string, string>
  agents?: string[]
  status?: string
  id?: string
}): Promise<Scenario> {
  const r = await request<{ scenario: Scenario }>('POST', `/api/scenarios`, params)
  return r.scenario
}

export async function updateScenario(
  id: string,
  patch: Partial<Pick<Scenario, 'name' | 'description' | 'status' | 'roleAssignments' | 'agents'>>,
): Promise<Scenario> {
  const r = await request<{ scenario: Scenario }>('PUT', `/api/scenarios/${id}`, patch)
  return r.scenario
}

export async function deleteScenario(id: string): Promise<void> {
  await request('DELETE', `/api/scenarios/${id}`)
}

// ============ Tasks ============
export async function listTasks(scenarioId: string): Promise<ScenarioTask[]> {
  const r = await request<{ tasks: ScenarioTask[] }>('GET', `/api/scenarios/${scenarioId}/tasks`)
  return r.tasks
}

export async function createTask(
  scenarioId: string,
  params: {
    title: string
    description?: string
    status?: string
    assignedAgents?: string[]
    priority?: string
    mode?: string
  },
): Promise<ScenarioTask> {
  const r = await request<{ task: ScenarioTask }>(
    'POST',
    `/api/scenarios/${scenarioId}/tasks`,
    params,
  )
  return r.task
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<ScenarioTask, 'title' | 'description' | 'status' | 'assignedAgents' | 'priority'>>,
): Promise<ScenarioTask> {
  const r = await request<{ task: ScenarioTask }>('PUT', `/api/tasks/${id}`, patch)
  return r.task
}

export async function deleteTask(id: string): Promise<void> {
  await request('DELETE', `/api/tasks/${id}`)
}

// ============ Messages ============
export async function listMessages(scenarioId: string): Promise<ScenarioMessage[]> {
  const r = await request<{ messages: ScenarioMessage[] }>(
    'GET',
    `/api/scenarios/${scenarioId}/messages`,
  )
  return r.messages
}

export async function appendMessage(
  scenarioId: string,
  params: { fromAgent: string; toAgent: string; content: string; type?: string },
): Promise<void> {
  await request('POST', `/api/scenarios/${scenarioId}/messages`, params)
}
