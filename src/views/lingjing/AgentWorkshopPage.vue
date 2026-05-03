<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NSpin, NTag, NButton, NIcon, NEmpty, NModal, NInput, NSpace,
  NForm, NFormItem, NSelect, NTabs, NTabPane, NRadioGroup, NRadioButton,
  useMessage, useDialog,
} from 'naive-ui'
import {
  AddOutline, ConstructOutline, PeopleOutline, FlashOutline,
  PaperPlaneOutline, ChatbubblesOutline, TrashOutline, CheckmarkCircle,
  AlertCircleOutline, PlayOutline, RocketOutline,
} from '@vicons/ionicons5'
import { useAgentStore } from '@/stores/agent'
import {
  listScenarios, createScenario as apiCreateScenario, updateScenario as apiUpdateScenario,
  deleteScenario as apiDeleteScenario,
  listTasks, createTask as apiCreateTask, updateTask as apiUpdateTask,
  listMessages, appendMessage,
  type Scenario, type ScenarioTask, type ScenarioMessage,
} from '@/api/lingjing/scenarios'
import { useWebSocketStore } from '@/stores/websocket'

const message = useMessage()
const dialog = useDialog()
const agentStore = useAgentStore()
const wsStore = useWebSocketStore()

// ============ 列表状态 ============
const teams = ref<Scenario[]>([])
const loading = ref(false)
const lastError = ref('')
const allAgents = computed(() => agentStore.agents)

async function loadTeams() {
  loading.value = true
  lastError.value = ''
  try {
    teams.value = await listScenarios('workshop')
  } catch (err: any) {
    lastError.value = err?.message || '加载团队列表失败'
  } finally {
    loading.value = false
  }
}

// ============ 创建团队 wizard ============
const showWizard = ref(false)
const wizardStep = ref<1 | 2 | 3>(1)
const wizardName = ref('')
const wizardDescription = ref('')
const wizardSelectedAgents = ref<string[]>([])
const wizardFirstTaskTitle = ref('')
const wizardFirstTaskDesc = ref('')
const wizardFirstTaskPriority = ref<'low' | 'medium' | 'high'>('medium')
const wizardSubmitting = ref(false)

// 推荐场景模板
interface TeamTemplate {
  name: string
  description: string
  emoji: string
  taskTitle: string
  taskDesc: string
}

const TEMPLATES: TeamTemplate[] = [
  {
    name: '研发团队',
    description: '需求分析 → 编码实现 → 代码审查 → 测试',
    emoji: '⚙',
    taskTitle: '实现新功能',
    taskDesc: '请按需求文档完成新功能的设计、编码和测试',
  },
  {
    name: '内容创作团队',
    description: '选题策划 → 撰写 → 校对 → 配图',
    emoji: '✍',
    taskTitle: '撰写一篇文章',
    taskDesc: '主题:[请填写] 长度:1500 字 风格:科普',
  },
  {
    name: '客服团队',
    description: '问题收集 → 分类 → 回复 → 跟进',
    emoji: '☎',
    taskTitle: '处理今日工单',
    taskDesc: '根据工单优先级排序处理,标记疑难升级',
  },
  {
    name: '运营分析团队',
    description: '数据收集 → 分析 → 报告 → 建议',
    emoji: '📊',
    taskTitle: '生成本周运营报告',
    taskDesc: '汇总核心指标,识别异常,提出优化建议',
  },
]

function openWizard(template?: TeamTemplate) {
  wizardStep.value = 1
  wizardName.value = template?.name || ''
  wizardDescription.value = template?.description || ''
  wizardSelectedAgents.value = []
  wizardFirstTaskTitle.value = template?.taskTitle || ''
  wizardFirstTaskDesc.value = template?.taskDesc || ''
  wizardFirstTaskPriority.value = 'medium'
  showWizard.value = true
}

function wizardNext() {
  if (wizardStep.value === 1) {
    if (!wizardName.value.trim()) {
      message.warning('请填写团队名称')
      return
    }
    wizardStep.value = 2
  } else if (wizardStep.value === 2) {
    if (wizardSelectedAgents.value.length === 0) {
      message.warning('请至少选 1 个智能体')
      return
    }
    wizardStep.value = 3
  }
}

function wizardPrev() {
  if (wizardStep.value === 3) wizardStep.value = 2
  else if (wizardStep.value === 2) wizardStep.value = 1
}

async function wizardFinish() {
  wizardSubmitting.value = true
  try {
    const scenario = await apiCreateScenario({
      name: wizardName.value.trim(),
      description: wizardDescription.value.trim(),
      scenarioType: 'workshop',
      agents: wizardSelectedAgents.value.slice(),
      status: wizardFirstTaskTitle.value.trim() ? 'active' : 'draft',
    })
    if (wizardFirstTaskTitle.value.trim()) {
      await apiCreateTask(scenario.id, {
        title: wizardFirstTaskTitle.value.trim(),
        description: wizardFirstTaskDesc.value.trim() || wizardFirstTaskTitle.value.trim(),
        assignedAgents: wizardSelectedAgents.value.slice(),
        priority: wizardFirstTaskPriority.value,
      })
    }
    message.success(`团队 "${scenario.name}" 已创建`)
    showWizard.value = false
    await loadTeams()
  } catch (err: any) {
    message.error(err?.message || '创建失败')
  } finally {
    wizardSubmitting.value = false
  }
}

// ============ 团队详情 ============
const showDetail = ref(false)
const detailTeamId = ref<string>('')
const detailTab = ref<'tasks' | 'comm' | 'members'>('tasks')
const detailTasksList = ref<ScenarioTask[]>([])
const detailMessagesList = ref<ScenarioMessage[]>([])

async function openDetail(scenarioId: string) {
  detailTeamId.value = scenarioId
  detailTab.value = 'tasks'
  showDetail.value = true
  await Promise.all([refreshDetailTasks(), refreshDetailMessages()])
}

async function refreshDetailTasks() {
  if (!detailTeamId.value) return
  try {
    detailTasksList.value = await listTasks(detailTeamId.value)
  } catch {
    detailTasksList.value = []
  }
}

async function refreshDetailMessages() {
  if (!detailTeamId.value) return
  try {
    detailMessagesList.value = await listMessages(detailTeamId.value)
  } catch {
    detailMessagesList.value = []
  }
}

const detailTeam = computed(() => teams.value.find((s) => s.id === detailTeamId.value) || null)

// 任务列表(过滤当前团队的)
const teamTasks = computed(() => detailTasksList.value)

// 团队消息(server 已合并系统日志 + agent message)
const teamMessages = computed(() =>
  detailMessagesList.value.map((m) => ({
    id: m.id,
    ts: m.timestamp,
    from: m.fromAgent,
    to: m.toAgent,
    content: m.content,
    type: m.type,
  })),
)

// ============ 委派新任务 ============
const newTaskTitle = ref('')
const newTaskDesc = ref('')
const newTaskAssignees = ref<string[]>([])
const newTaskPriority = ref<'low' | 'medium' | 'high'>('medium')

async function addTaskToCurrentTeam() {
  if (!detailTeam.value) return
  if (!newTaskTitle.value.trim()) {
    message.warning('请填写任务标题')
    return
  }
  if (newTaskAssignees.value.length === 0) {
    message.warning('请至少分配给 1 个智能体')
    return
  }
  try {
    await apiCreateTask(detailTeam.value.id, {
      title: newTaskTitle.value.trim(),
      description: newTaskDesc.value.trim() || newTaskTitle.value.trim(),
      assignedAgents: newTaskAssignees.value.slice(),
      priority: newTaskPriority.value,
    })
    message.success('任务已创建')
    newTaskTitle.value = ''
    newTaskDesc.value = ''
    newTaskAssignees.value = []
    newTaskPriority.value = 'medium'
    await refreshDetailTasks()
  } catch (err: any) {
    message.error(err?.message || '创建失败')
  }
}

// 真实执行某个任务(spawnAgentTask)
async function executeTask(taskId: string, agentId: string) {
  const task = detailTasksList.value.find((t) => t.id === taskId)
  if (!task) return
  try {
    await apiUpdateTask(taskId, { status: 'in_progress' })
    await refreshDetailTasks()
    // 真实调用 OpenClaw agent 执行
    await wsStore.rpc.callAgent({
      agentId,
      message: task.description || task.title,
    })
    await apiUpdateTask(taskId, { status: 'completed' })
    await appendMessage(detailTeamId.value, {
      fromAgent: agentId,
      toAgent: 'user',
      content: `已完成任务:${task.title}`,
      type: 'reply',
    })
    message.success(`任务 "${task.title}" 已完成`)
    await Promise.all([refreshDetailTasks(), refreshDetailMessages()])
  } catch (err: any) {
    await apiUpdateTask(taskId, { status: 'failed' }).catch(() => {})
    await refreshDetailTasks()
    message.error(err?.message || '执行失败')
  }
}

async function onUpdateMembers(newAgents: string[]) {
  if (!detailTeam.value) return
  try {
    await apiUpdateScenario(detailTeam.value.id, { agents: newAgents })
    await loadTeams()
  } catch (err: any) {
    message.error(err?.message || '保存失败')
  }
}

// 删除团队
function deleteTeam(scenarioId: string) {
  const scenario = teams.value.find((s) => s.id === scenarioId)
  if (!scenario) return
  dialog.warning({
    title: '确认删除',
    content: `删除团队 "${scenario.name}" 后,关联的任务和消息记录将一并清空。继续?`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await apiDeleteScenario(scenarioId)
        if (detailTeamId.value === scenarioId) showDetail.value = false
        message.success('已删除')
        await loadTeams()
      } catch (err: any) {
        message.error(err?.message || '删除失败')
      }
    },
  })
}

// ============ 数据 helper ============
function agentName(id: string): string {
  if (id === 'user') return '用户'
  if (id === 'system') return '系统'
  if (id === 'all') return '所有人'
  const a = allAgents.value.find((x) => x.id === id)
  return a?.identity?.name || a?.name || id
}

function priorityLabel(p: 'low' | 'medium' | 'high'): string {
  return { low: '低', medium: '中', high: '高' }[p] || p
}

function priorityType(p: 'low' | 'medium' | 'high'): 'default' | 'info' | 'warning' {
  if (p === 'high') return 'warning'
  if (p === 'medium') return 'info'
  return 'default'
}

function statusLabel(s: 'pending' | 'in_progress' | 'completed' | 'failed'): string {
  return { pending: '待处理', in_progress: '执行中', completed: '已完成', failed: '失败' }[s] || s
}

function formatRelTime(ts: number): string {
  const diffMs = Date.now() - ts
  if (diffMs < 60_000) return '刚刚'
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)} 小时前`
  return new Date(ts).toLocaleString('zh-CN')
}

// ============ 选项 ============
const allAgentOptions = computed(() =>
  allAgents.value.map((a) => ({
    label: a.identity?.name || a.name || a.id,
    value: a.id,
  })),
)

const teamAgentOptions = computed(() => {
  const ids = detailTeam.value?.agents || []
  return ids.map((id) => ({
    label: agentName(id),
    value: id,
  }))
})

const PRIORITY_OPTIONS: Array<{ label: string; value: 'low' | 'medium' | 'high' }> = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
]

onMounted(async () => {
  if (allAgents.value.length === 0) {
    await agentStore.fetchAgents().catch(() => {})
  }
  await loadTeams()
})
</script>

<template>
  <div class="ling-workshop">
    <header class="page-head">
      <div>
        <h1 class="page-title">智能体工坊</h1>
        <p class="page-subtitle">
          让多个智能体组队协作完成复杂任务,自动分工、互相通信、汇总结果。
          共 {{ teams.length }} 个团队
        </p>
      </div>
      <NButton type="primary" size="medium" @click="openWizard()">
        <template #icon><NIcon><AddOutline /></NIcon></template>
        新建团队
      </NButton>
    </header>

    <!-- 空态 + 推荐模板 -->
    <div v-if="teams.length === 0" class="empty-zone">
      <NEmpty description="还没有团队,从下方场景开始一键搭建">
        <template #icon><NIcon size="44" :depth="3"><PeopleOutline /></NIcon></template>
      </NEmpty>

      <div class="templates-row">
        <p class="templates-label">推荐场景</p>
        <div class="templates-grid">
          <button
            v-for="tpl in TEMPLATES"
            :key="tpl.name"
            class="template-card"
            @click="openWizard(tpl)"
          >
            <div class="template-icon">{{ tpl.emoji }}</div>
            <div class="template-body">
              <div class="template-title">{{ tpl.name }}</div>
              <p class="template-desc">{{ tpl.description }}</p>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- 团队卡片列表 -->
    <div v-else class="teams-list">
      <div
        v-for="team in teams"
        :key="team.id"
        class="team-card"
        :class="{ 'is-active': team.status === 'active' }"
        @click="openDetail(team.id)"
      >
        <div class="team-icon">
          <NIcon size="18"><PeopleOutline /></NIcon>
        </div>
        <div class="team-body">
          <div class="team-name-row">
            <span class="team-name">{{ team.name }}</span>
            <NTag
              v-if="team.status === 'active'"
              size="small"
              :bordered="false"
              type="success"
              round
            >
              运行中
            </NTag>
            <NTag
              v-else
              size="small"
              :bordered="false"
              round
            >
              {{ team.status === 'completed' ? '已完成' : '草稿' }}
            </NTag>
          </div>
          <p v-if="team.description" class="team-desc">{{ team.description }}</p>
          <div class="team-meta">
            <span>{{ team.agents.length }} 位智能体</span>
            <span class="meta-sep">·</span>
            <span>{{ team.status === 'active' ? '活跃' : '草稿' }}</span>
            <span class="meta-sep">·</span>
            <span>{{ formatRelTime(team.createdAt) }}创建</span>
          </div>
        </div>
        <button
          class="team-delete-btn"
          title="删除"
          @click.stop="deleteTeam(team.id)"
        >
          <NIcon size="14"><TrashOutline /></NIcon>
        </button>
      </div>
    </div>

    <!-- 创建向导 modal -->
    <NModal
      v-model:show="showWizard"
      preset="card"
      title="新建团队"
      style="width: 540px;"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div class="wizard-steps">
        <span class="step" :class="{ active: wizardStep === 1, done: wizardStep > 1 }">1 基本信息</span>
        <span class="step-arrow">›</span>
        <span class="step" :class="{ active: wizardStep === 2, done: wizardStep > 2 }">2 选择智能体</span>
        <span class="step-arrow">›</span>
        <span class="step" :class="{ active: wizardStep === 3 }">3 首个任务</span>
      </div>

      <div v-if="wizardStep === 1">
        <NForm label-placement="left" label-width="78" :show-feedback="false">
          <NFormItem label="团队名称" required>
            <NInput v-model:value="wizardName" placeholder="如:研发团队" maxlength="40" show-count />
          </NFormItem>
          <NFormItem label="描述">
            <NInput
              v-model:value="wizardDescription"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }"
              placeholder="一句话说明这个团队做什么"
            />
          </NFormItem>
        </NForm>
      </div>

      <div v-if="wizardStep === 2">
        <p class="wizard-tip">从你的多智能体里选 1~多个加入这支团队。每个智能体保留各自的人设和工具配置。</p>
        <NSelect
          v-model:value="wizardSelectedAgents"
          multiple
          :options="allAgentOptions"
          placeholder="点选 智能体..."
          size="large"
        />
        <p v-if="allAgents.length === 0" class="wizard-empty-hint">
          还没有智能体?
          <button class="link-btn" @click="$router.push('/agents')">去多智能体页新建 →</button>
        </p>
      </div>

      <div v-if="wizardStep === 3">
        <p class="wizard-tip">可选:给团队布置第一个任务。所有选中的智能体都会收到。</p>
        <NForm label-placement="left" label-width="78" :show-feedback="false">
          <NFormItem label="任务标题">
            <NInput v-model:value="wizardFirstTaskTitle" placeholder="留空则跳过" />
          </NFormItem>
          <NFormItem label="详细要求">
            <NInput
              v-model:value="wizardFirstTaskDesc"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 6 }"
              placeholder="说明任务目标和约束条件"
            />
          </NFormItem>
          <NFormItem label="优先级">
            <NRadioGroup v-model:value="wizardFirstTaskPriority" size="small">
              <NRadioButton
                v-for="p in PRIORITY_OPTIONS"
                :key="p.value"
                :value="p.value"
                :label="p.label"
              />
            </NRadioGroup>
          </NFormItem>
        </NForm>
      </div>

      <template #footer>
        <div class="wizard-footer">
          <NButton v-if="wizardStep > 1" size="medium" @click="wizardPrev">上一步</NButton>
          <NSpace :size="8" style="margin-left: auto;">
            <NButton size="medium" :disabled="wizardSubmitting" @click="showWizard = false">取消</NButton>
            <NButton
              v-if="wizardStep < 3"
              type="primary"
              size="medium"
              @click="wizardNext"
            >
              下一步
            </NButton>
            <NButton
              v-else
              type="primary"
              size="medium"
              :loading="wizardSubmitting"
              @click="wizardFinish"
            >
              <template #icon><NIcon><RocketOutline /></NIcon></template>
              创建团队
            </NButton>
          </NSpace>
        </div>
      </template>
    </NModal>

    <!-- 团队详情 modal -->
    <NModal
      v-model:show="showDetail"
      preset="card"
      :title="detailTeam ? `${detailTeam.name}` : ''"
      style="width: 720px;"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div v-if="detailTeam">
        <p class="detail-desc">{{ detailTeam.description || '—' }}</p>

        <NTabs v-model:value="detailTab" type="line" animated>
          <!-- 任务委派 tab -->
          <NTabPane name="tasks" tab="任务委派">
            <div class="task-list">
              <div v-if="teamTasks.length === 0" class="empty-state-inline">
                这个团队还没有任务,在下方布置第一个
              </div>
              <div
                v-for="task in teamTasks"
                :key="task.id"
                class="task-item"
                :class="`status-${task.status}`"
              >
                <div class="task-icon">
                  <NIcon size="14">
                    <CheckmarkCircle v-if="task.status === 'completed'" />
                    <PlayOutline v-else-if="task.status === 'in_progress'" />
                    <AlertCircleOutline v-else-if="task.status === 'failed'" />
                    <FlashOutline v-else />
                  </NIcon>
                </div>
                <div class="task-body">
                  <div class="task-title-row">
                    <span class="task-title">{{ task.title }}</span>
                    <NTag size="tiny" :bordered="false" :type="priorityType(task.priority)" round>
                      {{ priorityLabel(task.priority) }}
                    </NTag>
                    <NTag size="tiny" :bordered="false" round>
                      {{ statusLabel(task.status) }}
                    </NTag>
                  </div>
                  <p class="task-desc">{{ task.description }}</p>
                  <div class="task-meta">
                    <span>分配给:{{ task.assignedAgents.map((id: string) => agentName(id)).join(', ') }}</span>
                  </div>
                </div>
                <NButton
                  v-if="task.status === 'pending' && task.assignedAgents.length > 0"
                  size="small"
                  type="primary"
                  @click="executeTask(task.id, task.assignedAgents[0])"
                >
                  <template #icon><NIcon><PlayOutline /></NIcon></template>
                  执行
                </NButton>
              </div>
            </div>

            <div class="new-task-form">
              <p class="form-section-label">+ 布置新任务</p>
              <NInput
                v-model:value="newTaskTitle"
                placeholder="任务标题"
                size="medium"
                style="margin-bottom: 8px;"
              />
              <NInput
                v-model:value="newTaskDesc"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 4 }"
                placeholder="详细要求(可选)"
                size="medium"
                style="margin-bottom: 8px;"
              />
              <div class="new-task-row">
                <NSelect
                  v-model:value="newTaskAssignees"
                  multiple
                  :options="teamAgentOptions"
                  placeholder="分配给..."
                  size="medium"
                  style="flex: 1;"
                />
                <NRadioGroup v-model:value="newTaskPriority" size="small">
                  <NRadioButton
                    v-for="p in PRIORITY_OPTIONS"
                    :key="p.value"
                    :value="p.value"
                    :label="p.label"
                  />
                </NRadioGroup>
                <NButton type="primary" size="medium" @click="addTaskToCurrentTeam">
                  <template #icon><NIcon><PaperPlaneOutline /></NIcon></template>
                  委派
                </NButton>
              </div>
            </div>
          </NTabPane>

          <!-- 团队通信 tab -->
          <NTabPane name="comm" tab="团队通信">
            <div v-if="teamMessages.length === 0" class="empty-state-inline">
              暂无通信记录。任务委派、智能体反馈会在这里实时出现
            </div>
            <div v-else class="msg-log">
              <div
                v-for="m in teamMessages"
                :key="m.id"
                class="msg-item"
                :class="`msg-type-${m.type}`"
              >
                <span class="msg-from">{{ agentName(m.from) }}</span>
                <span class="msg-arrow">→</span>
                <span class="msg-to">{{ agentName(m.to) || '—' }}</span>
                <span class="msg-content">{{ m.content }}</span>
                <span class="msg-ts">{{ formatRelTime(m.ts) }}</span>
              </div>
            </div>
          </NTabPane>

          <!-- 成员管理 tab -->
          <NTabPane name="members" tab="成员管理">
            <p class="members-tip">
              团队成员从你的多智能体里挑选。每个智能体保留独立的人设、记忆和工具。
              修改成员后立即生效,新任务会按当前成员分配。
            </p>
            <NSelect
              :value="detailTeam.agents"
              multiple
              :options="allAgentOptions"
              placeholder="选成员..."
              size="medium"
              @update:value="onUpdateMembers"
            />
            <div v-if="detailTeam.agents.length > 0" class="members-list">
              <div
                v-for="id in detailTeam.agents"
                :key="id"
                class="member-card"
              >
                <div class="member-avatar">{{ agentName(id).slice(0, 1).toUpperCase() }}</div>
                <span class="member-name">{{ agentName(id) }}</span>
                <span class="member-id">{{ id }}</span>
              </div>
            </div>
          </NTabPane>
        </NTabs>
      </div>

      <template #footer>
        <div class="modal-footer">
          <NButton size="medium" @click="showDetail = false">关闭</NButton>
        </div>
      </template>
    </NModal>

    <p class="page-footnote">
      <NIcon size="12"><ConstructOutline /></NIcon>
      团队由 OpenClaw <code>callAgent</code> 驱动,任务执行时智能体真实运行。
      团队/任务/消息持久化在本地数据库,刷新或重启不丢。
    </p>
  </div>
</template>

<style scoped>
.ling-workshop {
  max-width: 800px;
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
  max-width: 540px;
  line-height: 1.5;
}

/* 空态 + 模板 */
.empty-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 28px;
}

.templates-row { width: 100%; margin-top: 26px; }

.templates-label {
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  margin: 0 4px 10px;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.template-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color 0.15s ease, transform 0.12s ease;
}

.template-card:hover { border-color: var(--n-text-color-3); }
.template-card:active { transform: scale(0.99); }

.template-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--n-action-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
  color: var(--n-text-color);
}

.template-body { flex: 1; min-width: 0; }
.template-title { font-size: 13.5px; font-weight: 500; color: var(--n-text-color); margin-bottom: 4px; }
.template-desc { font-size: 12px; color: var(--n-text-color-3); margin: 0; line-height: 1.5; }

/* 团队卡片 */
.teams-list { display: flex; flex-direction: column; gap: 8px; }

.team-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.team-card:hover { border-color: var(--n-text-color-3); }
.team-card.is-active {
  border-color: rgba(52, 199, 89, 0.3);
  background: rgba(52, 199, 89, 0.04);
}

:root[data-theme='dark'] .team-card.is-active { background: rgba(52, 199, 89, 0.06); }

.team-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--n-action-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--n-text-color-3);
}

.team-body { flex: 1; min-width: 0; }

.team-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.team-name { font-size: 14px; font-weight: 500; color: var(--n-text-color); }

.team-desc {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin: 0 0 4px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.team-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--n-text-color-disabled);
}

.meta-sep { opacity: 0.5; }

.team-delete-btn {
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
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.team-card:hover .team-delete-btn { opacity: 1; }
.team-delete-btn:hover { background: rgba(255, 59, 48, 0.08); color: #FF3B30; }

:root[data-theme='dark'] .team-delete-btn:hover {
  background: rgba(255, 99, 89, 0.12); color: #FF6359;
}

/* 向导 */
.wizard-steps {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--n-text-color-disabled);
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--n-divider-color);
}

.step { padding: 4px 8px; border-radius: 4px; }
.step.active { background: var(--n-primary-color, #2080f0); color: #fff; }
.step.done { color: var(--n-text-color); }
.step-arrow { color: var(--n-text-color-disabled); }

.wizard-tip {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  line-height: 1.55;
  margin: 0 0 12px;
}

.wizard-empty-hint {
  margin: 12px 0 0;
  font-size: 12.5px;
  color: var(--n-text-color-3);
}

.link-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--n-primary-color, #2080f0);
  padding: 0;
  font: inherit;
}

.link-btn:hover { text-decoration: underline; }

.wizard-footer { display: flex; align-items: center; width: 100%; }

/* 团队详情 */
.detail-desc {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0 0 16px;
  line-height: 1.55;
}

.empty-state-inline {
  text-align: center;
  padding: 36px 16px;
  color: var(--n-text-color-disabled);
  font-size: 13px;
}

/* 任务列表 */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.task-item {
  background: var(--n-action-color);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.task-item.status-completed { background: rgba(52, 199, 89, 0.06); }
.task-item.status-failed { background: rgba(255, 59, 48, 0.06); }
.task-item.status-in_progress { background: rgba(32, 128, 240, 0.06); }

.task-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--n-card-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--n-text-color-3);
}

.task-item.status-completed .task-icon { color: var(--n-success-color, #34C759); }
.task-item.status-failed .task-icon { color: #FF3B30; }
.task-item.status-in_progress .task-icon { color: var(--n-primary-color, #2080f0); }

.task-body { flex: 1; min-width: 0; }

.task-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
  flex-wrap: wrap;
}

.task-title { font-size: 13.5px; font-weight: 500; color: var(--n-text-color); }

.task-desc {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin: 0 0 4px;
  line-height: 1.45;
}

.task-meta { font-size: 11.5px; color: var(--n-text-color-disabled); }

/* 新建任务表单 */
.new-task-form {
  background: var(--n-card-color);
  border: 1px dashed var(--n-border-color);
  border-radius: 8px;
  padding: 12px 14px;
}

.form-section-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--n-text-color-3);
  margin: 0 0 8px;
}

.new-task-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 通信记录 */
.msg-log {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 360px;
  overflow-y: auto;
  padding: 4px;
}

.msg-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--n-text-color);
  transition: background 0.12s ease;
}

.msg-item:hover { background: var(--n-action-color); }

.msg-from { font-weight: 500; min-width: 60px; }
.msg-arrow { color: var(--n-text-color-disabled); }
.msg-to { color: var(--n-text-color-3); min-width: 60px; }
.msg-content { flex: 1; color: var(--n-text-color-2, var(--n-text-color)); }
.msg-ts { color: var(--n-text-color-disabled); font-size: 11px; flex-shrink: 0; }

.msg-type-system { color: var(--n-text-color-3); font-style: italic; }
.msg-type-task .msg-content { font-weight: 500; }

/* 成员管理 */
.members-tip {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin: 0 0 12px;
  line-height: 1.55;
}

.members-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.member-card {
  background: var(--n-action-color);
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.member-avatar {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--n-card-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--n-text-color);
  flex-shrink: 0;
}

.member-name { flex: 1; color: var(--n-text-color); }
.member-id { font-size: 11.5px; color: var(--n-text-color-disabled); font-family: ui-monospace, monospace; }

.modal-footer {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.page-footnote {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin: 18px 4px 0;
  line-height: 1.5;
  display: flex;
  align-items: center;
  gap: 6px;
}

.page-footnote code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  background: var(--n-action-color);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11px;
}
</style>
