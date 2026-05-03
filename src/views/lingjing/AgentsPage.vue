<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NSpin, NTag, NButton, NIcon, NModal, NInput, NSpace, NForm, NFormItem,
  useMessage, useDialog,
} from 'naive-ui'
import {
  PersonCircleOutline, AddOutline, TrashOutline,
  ChatbubblesOutline, CreateOutline, TrashBinOutline,
} from '@vicons/ionicons5'
import { useWebSocketStore } from '@/stores/websocket'

interface AgentRow {
  id: string
  name: string
  emoji?: string
  model?: string
  workspace?: string
  isDefault: boolean
}

const message = useMessage()
const dialog = useDialog()
const wsStore = useWebSocketStore()
const router = useRouter()

const agents = ref<AgentRow[]>([])
const loading = ref(false)
const lastError = ref('')
const defaultId = ref<string>('')
const cleaningE2E = ref(false)
const deletingId = ref<string | null>(null)

// 测试残留(开头是 e2e- 的)
const e2eAgents = computed(() => agents.value.filter((a) => /^e2e-/i.test(a.id)))

// 简化模型显示:lingjing/deepseek/deepseek-chat → deepseek-chat
function shortModel(model?: string): string {
  if (!model) return ''
  const parts = model.split('/').filter(Boolean)
  return parts[parts.length - 1] || model
}

// 取首字母作为头像 fallback(无 emoji 时)
function avatarLetter(agent: AgentRow): string {
  if (agent.emoji) return agent.emoji
  return (agent.name || agent.id).slice(0, 1).toUpperCase()
}

// 编辑/新建 modal
const showModal = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const formAgentId = ref('')
const formName = ref('')
const formWorkspace = ref('')
const submitting = ref(false)

onMounted(loadAgents)

async function loadAgents() {
  loading.value = true
  lastError.value = ''
  try {
    const result = await wsStore.rpc.listAgents()
    const list = (result as any)?.agents || []
    defaultId.value = (result as any)?.defaultId || ''
    agents.value = list.map((a: any) => ({
      id: a.id,
      name: a.identity?.name || a.name || a.id,
      emoji: a.identity?.emoji,
      model: a.model,
      workspace: a.workspace,
      isDefault: a.id === defaultId.value,
    }))
  } catch (err: any) {
    lastError.value = err?.message || '加载智能体列表失败'
    message.error(lastError.value)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  modalMode.value = 'create'
  formAgentId.value = ''
  formName.value = ''
  formWorkspace.value = ''
  showModal.value = true
}

function openEdit(agent: AgentRow) {
  modalMode.value = 'edit'
  formAgentId.value = agent.id
  formName.value = agent.name
  formWorkspace.value = agent.workspace || ''
  showModal.value = true
}

async function handleSubmit() {
  const name = formName.value.trim()
  if (!name) {
    message.warning('请填写名称')
    return
  }
  submitting.value = true
  try {
    if (modalMode.value === 'create') {
      const ws = formWorkspace.value.trim() ||
        `${'~'}/.openclaw/workspaces/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const r = await wsStore.rpc.createAgent({ name, workspace: ws })
      message.success(`已创建 ${r.name}`)
    } else {
      await wsStore.rpc.updateAgent({
        agentId: formAgentId.value,
        name,
        ...(formWorkspace.value.trim() ? { workspace: formWorkspace.value.trim() } : {}),
      })
      message.success(`已更新 ${name}`)
    }
    showModal.value = false
    await loadAgents()
  } catch (err: any) {
    message.error(err?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete() {
  if (!formAgentId.value) return
  if (formAgentId.value === defaultId.value) {
    message.warning('默认智能体不能删除,请先在 OpenClaw 里切换默认')
    return
  }
  dialog.warning({
    title: '确认删除',
    content: `删除 "${formName.value}" 后,关联的会话将解绑。此操作不可撤销,确认继续?`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      submitting.value = true
      try {
        await wsStore.rpc.deleteAgent(formAgentId.value)
        message.success('已删除')
        showModal.value = false
        await loadAgents()
      } catch (err: any) {
        message.error(err?.message || '删除失败')
      } finally {
        submitting.value = false
      }
    },
  })
}

// 卡片上的快捷操作
function openChat(agent: AgentRow) {
  // 跳到 chat 页,sessionKey = agent:<id>:main(OpenClaw 默认会话规则)
  router.push({ path: '/chat', query: { session: `agent:${agent.id}:main` } })
}

function quickDelete(agent: AgentRow) {
  if (agent.id === defaultId.value) {
    message.warning('默认智能体不能删除')
    return
  }
  dialog.warning({
    title: '确认删除',
    content: `删除 "${agent.name}"?关联的会话将解绑,此操作不可撤销。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingId.value = agent.id
      try {
        await wsStore.rpc.deleteAgent(agent.id)
        message.success(`已删除 ${agent.name}`)
        await loadAgents()
      } catch (err: any) {
        message.error(err?.message || '删除失败')
      } finally {
        deletingId.value = null
      }
    },
  })
}

async function cleanupE2E() {
  const targets = e2eAgents.value
  if (targets.length === 0) return
  dialog.warning({
    title: '清理测试残留',
    content: `将删除 ${targets.length} 个 e2e- 前缀的测试智能体:${targets.map((a) => a.id).join(', ')}。确认?`,
    positiveText: '全部删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      cleaningE2E.value = true
      let okCount = 0
      let failCount = 0
      for (const a of targets) {
        if (a.id === defaultId.value) continue // 防御:不删默认
        try {
          await wsStore.rpc.deleteAgent(a.id)
          okCount++
        } catch {
          failCount++
        }
      }
      cleaningE2E.value = false
      if (failCount > 0) {
        message.warning(`清理完成:成功 ${okCount},失败 ${failCount}`)
      } else {
        message.success(`已清理 ${okCount} 个测试残留`)
      }
      await loadAgents()
    },
  })
}
</script>

<template>
  <div class="agents-page">
    <header class="page-head">
      <div>
        <h1 class="page-title">多智能体</h1>
        <p class="page-subtitle">
          管理你的 AI 助手,每个智能体有独立的人设、记忆和工具配置。
          共 {{ agents.length }} 个 · 默认 {{ defaultId || '—' }}
        </p>
      </div>
      <NSpace :size="8">
        <NButton
          v-if="e2eAgents.length > 0"
          size="medium"
          quaternary
          :loading="cleaningE2E"
          @click="cleanupE2E"
        >
          清理测试残留 ({{ e2eAgents.length }})
        </NButton>
        <NButton type="primary" size="medium" @click="openCreate">
          <template #icon><NIcon><AddOutline /></NIcon></template>
          新建智能体
        </NButton>
      </NSpace>
    </header>

    <NSpin :show="loading">
      <div v-if="!loading && agents.length === 0" class="empty-card">
        <NIcon size="32" class="empty-icon">
          <PersonCircleOutline />
        </NIcon>
        <p class="empty-text">{{ lastError || '还没有智能体,点击右上角新建一个' }}</p>
        <NButton v-if="lastError" size="small" @click="loadAgents">重试</NButton>
      </div>

      <div v-else class="agent-grid">
        <div
          v-for="agent in agents"
          :key="agent.id"
          class="agent-card"
          :class="{ 'is-default': agent.isDefault, 'is-deleting': deletingId === agent.id }"
        >
          <div class="agent-avatar">
            <span class="agent-emoji">{{ avatarLetter(agent) }}</span>
          </div>
          <div class="agent-body" @click="openChat(agent)">
            <div class="agent-name-row">
              <span class="agent-name">{{ agent.name }}</span>
              <NTag
                v-if="agent.isDefault"
                size="small"
                :bordered="false"
                type="success"
                round
              >
                默认
              </NTag>
            </div>
            <div class="agent-meta">
              <span class="meta-id">{{ agent.id }}</span>
              <span v-if="agent.model" class="meta-sep">·</span>
              <span v-if="agent.model" class="meta-model">{{ shortModel(agent.model) }}</span>
            </div>
          </div>
          <div class="agent-actions">
            <button
              class="action-btn primary"
              title="进入对话"
              @click.stop="openChat(agent)"
            >
              <NIcon size="16"><ChatbubblesOutline /></NIcon>
            </button>
            <button
              class="action-btn"
              title="编辑"
              @click.stop="openEdit(agent)"
            >
              <NIcon size="14"><CreateOutline /></NIcon>
            </button>
            <button
              v-if="!agent.isDefault"
              class="action-btn danger"
              title="删除"
              @click.stop="quickDelete(agent)"
            >
              <NIcon size="14"><TrashBinOutline /></NIcon>
            </button>
          </div>
        </div>
      </div>
    </NSpin>

    <p class="page-footnote">
      智能体由 OpenClaw 管理。点卡片任意位置或 💬 按钮直接开聊;
      头像 / 人设 在 AGENTS.md 中编辑(/memory 页面)。
    </p>

    <NModal
      v-model:show="showModal"
      preset="card"
      :title="modalMode === 'create' ? '新建智能体' : `编辑 ${formName}`"
      style="width: 480px;"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <NForm label-placement="left" label-width="78" :show-feedback="false">
        <NFormItem label="名称" required>
          <NInput v-model:value="formName" placeholder="例如:研究助手" maxlength="40" show-count />
        </NFormItem>
        <NFormItem label="工作目录">
          <NInput
            v-model:value="formWorkspace"
            :placeholder="modalMode === 'create' ? '留空使用默认 ~/.openclaw/workspaces/<name>' : ''"
          />
        </NFormItem>
        <p v-if="modalMode === 'edit'" class="modal-id-hint">ID {{ formAgentId }}</p>
        <p class="modal-id-hint">头像 / 人设需在 AGENTS.md 中编辑(/memory 页面)</p>
      </NForm>

      <template #footer>
        <div class="modal-footer">
          <NButton
            v-if="modalMode === 'edit'"
            type="error"
            ghost
            size="medium"
            :disabled="submitting"
            @click="handleDelete"
          >
            <template #icon><NIcon><TrashOutline /></NIcon></template>
            删除
          </NButton>
          <NSpace :size="8" style="margin-left: auto;">
            <NButton size="medium" :disabled="submitting" @click="showModal = false">取消</NButton>
            <NButton
              type="primary"
              size="medium"
              :loading="submitting"
              @click="handleSubmit"
            >
              {{ modalMode === 'create' ? '创建' : '保存' }}
            </NButton>
          </NSpace>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.agents-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 16px 8px 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.page-title {
  font-size: 22px;
  font-weight: 500;
  color: var(--n-text-color);
  margin: 0 0 6px;
  letter-spacing: -0.2px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0;
  max-width: 460px;
}

.empty-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 60px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.empty-icon {
  color: var(--n-text-color-disabled);
}

.empty-text {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0;
}

.agent-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: border-color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
}

.agent-card:hover {
  border-color: var(--n-text-color-3);
}

.agent-card.is-default {
  border-color: rgba(52, 199, 89, 0.3);
}

.agent-card.is-deleting {
  opacity: 0.4;
  pointer-events: none;
}

.agent-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--n-action-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-card.is-default .agent-avatar {
  background: rgba(52, 199, 89, 0.12);
  color: var(--n-success-color, #34C759);
}

.agent-emoji {
  font-size: 16px;
  font-weight: 500;
}

.agent-body {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.agent-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}

.agent-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--n-text-color-3);
}

.meta-id {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--n-text-color-disabled);
}

.meta-sep { color: var(--n-text-color-disabled); }

.meta-model {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--n-text-color-3);
}

/* 卡片右侧的快捷动作按钮 */
.agent-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--n-text-color-disabled);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease, color 0.12s ease;
}

.action-btn:hover {
  background: var(--n-action-color);
  color: var(--n-text-color);
}

.action-btn.primary:hover {
  background: rgba(32, 128, 240, 0.1);
  color: var(--n-primary-color, #2080f0);
}

.action-btn.danger:hover {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
}

:root[data-theme='dark'] .action-btn.danger:hover {
  background: rgba(255, 99, 89, 0.12);
  color: #FF6359;
}

.page-footnote {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin: 16px 4px 0;
  line-height: 1.5;
}

.modal-id-hint {
  font-size: 11.5px;
  color: var(--n-text-color-disabled);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  margin: 4px 0 0 78px;
}

.modal-footer {
  display: flex;
  align-items: center;
  width: 100%;
}
</style>
