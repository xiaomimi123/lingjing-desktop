<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NSpin, NTag, NButton, NIcon, NSwitch, NEmpty, NModal, NInput, NSpace,
  NSelect, NTimePicker, NCheckbox, NCheckboxGroup, NPopconfirm, useMessage, useDialog,
} from 'naive-ui'
import {
  AddOutline, PlayOutline, CalendarOutline, TrashOutline, SunnyOutline,
  CalendarNumberOutline, BookOutline,
} from '@vicons/ionicons5'
import { useWebSocketStore } from '@/stores/websocket'
import type { CronJob, CronSchedule, CronPayload } from '@/api/types'

interface TaskRow {
  id: string
  name: string
  exprDisplay: string
  message: string
  enabled: boolean
  nextRun?: string
  lastRun?: string
}

type FreqMode = 'daily' | 'weekly' | 'monthly' | 'custom'

const message = useMessage()
const dialog = useDialog()
const wsStore = useWebSocketStore()

const tasks = ref<TaskRow[]>([])
const loading = ref(false)
const lastError = ref('')
const togglingId = ref<string | null>(null)
const triggeringId = ref<string | null>(null)
const deletingId = ref<string | null>(null)

// 创建 modal 状态
const showCreateModal = ref(false)
const formName = ref('')
const formMessage = ref('')
const formMode = ref<FreqMode>('daily')
// 把时间存成 "HH:mm" 字符串避免 NTimePicker 的 UTC/local 时区混淆
const formTime = ref<string>('09:00')
const formWeekdays = ref<number[]>([1])              // 周一
const formMonthDay = ref(1)                          // 每月 1 号
const formCustomCron = ref('0 9 * * *')              // 高级 cron
const creating = ref(false)

const enabledCount = computed(() => tasks.value.filter((t) => t.enabled).length)

onMounted(loadTasks)

async function loadTasks() {
  loading.value = true
  lastError.value = ''
  try {
    const list: CronJob[] = await wsStore.rpc.listCrons().catch(() => [])
    tasks.value = list.map((t) => ({
      id: t.id,
      name: t.name || t.id,
      exprDisplay: scheduleDisplay(t.scheduleObj),
      message:
        (t.payload?.kind === 'agentTurn' ? t.payload.message : '') ||
        (t.payload?.kind === 'systemEvent' ? t.payload.text : '') ||
        t.description || '',
      enabled: t.enabled,
      nextRun: undefined,    // OpenClaw 4.21 暂不带 nextRun 字段,留空
      lastRun: undefined,
    }))
  } catch (err: any) {
    lastError.value = err?.message || '加载任务列表失败'
  } finally {
    loading.value = false
  }
}

// 把 cron 表达式翻译成大白话
function describeCron(expr: string): string {
  const lookup: Record<string, string> = {
    '* * * * *': '每分钟',
    '0 * * * *': '每小时整点',
    '0 9 * * *': '每天 09:00',
    '0 0 * * *': '每天午夜',
    '0 8 * * 1': '每周一 08:00',
    '0 9 * * 1': '每周一 09:00',
    '0 9 1 * *': '每月 1 号 09:00',
  }
  if (lookup[expr]) return lookup[expr]
  // fallback:解析 minute hour day-of-month month day-of-week
  const parts = expr.split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour, dom, mon, dow] = parts
  const time = `${hour}:${min.padStart(2, '0')}`
  if (dow !== '*' && dow !== '?') {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const days = dow.split(',').map((d) => names[Number(d) % 7] || d).join('/')
    return `每${days} ${time}`
  }
  if (dom !== '*' && dom !== '?') return `每月 ${dom} 号 ${time}`
  if (mon !== '*' && mon !== '?') return `${mon} 月 ${time}`
  return `每天 ${time}`
}

function scheduleDisplay(s?: CronSchedule): string {
  if (!s) return '未设置'
  if (s.kind === 'cron') return describeCron(s.expr)
  if (s.kind === 'at') return `单次 ${new Date(s.at).toLocaleString('zh-CN')}`
  if (s.kind === 'every') {
    const sec = Math.floor(s.everyMs / 1000)
    if (sec < 60) return `每 ${sec} 秒`
    const min = Math.floor(sec / 60)
    if (min < 60) return `每 ${min} 分钟`
    const hr = Math.floor(min / 60)
    return `每 ${hr} 小时`
  }
  return '未知'
}

function parseTime(s: string): { hh: number; mm: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return { hh: 9, mm: 0 }
  return { hh: Math.min(23, Number(m[1])), mm: Math.min(59, Number(m[2])) }
}

// 把 form 字段翻译回 cron 表达式
const computedExpr = computed(() => {
  const { hh, mm } = parseTime(formTime.value || '09:00')
  if (formMode.value === 'daily') return `${mm} ${hh} * * *`
  if (formMode.value === 'weekly') {
    const wd = formWeekdays.value.length ? formWeekdays.value.join(',') : '1'
    return `${mm} ${hh} * * ${wd}`
  }
  if (formMode.value === 'monthly') return `${mm} ${hh} ${formMonthDay.value} * *`
  return formCustomCron.value
})

const computedDisplay = computed(() => describeCron(computedExpr.value))

function openCreate() {
  resetForm()
  showCreateModal.value = true
}

function resetForm() {
  formName.value = ''
  formMessage.value = ''
  formMode.value = 'daily'
  formTime.value = '09:00'
  formWeekdays.value = [1]
  formMonthDay.value = 1
  formCustomCron.value = '0 9 * * *'
}

interface Template {
  key: string
  title: string
  description: string
  message: string
  cron: string
  icon: typeof CalendarOutline
  fillForm: () => void
}

const TEMPLATES: Template[] = [
  {
    key: 'morning-summary',
    title: '每天早上 8:00 总结日程',
    description: '让 AI 整理今日待办,发到对话',
    message: '请帮我列出今天的待办事项,按重要性排序,并提醒重要会议时间。',
    cron: '0 8 * * *',
    icon: SunnyOutline,
    fillForm: () => {
      resetForm()
      formName.value = '每天早晨日程总结'
      formMode.value = 'daily'
      formTime.value = '08:00'
      formMessage.value = '请帮我列出今天的待办事项,按重要性排序,并提醒重要会议时间。'
    },
  },
  {
    key: 'weekly-mail',
    title: '每周一 09:00 整理邮件',
    description: '上周邮件分类汇总',
    message: '帮我整理上周收到的邮件,按主题分类,标出需要回复的。',
    cron: '0 9 * * 1',
    icon: CalendarNumberOutline,
    fillForm: () => {
      resetForm()
      formName.value = '每周邮件整理'
      formMode.value = 'weekly'
      formTime.value = 9 * 3600 * 1000
      formWeekdays.value = [1]
      formMessage.value = '帮我整理上周收到的邮件,按主题分类,标出需要回复的。'
    },
  },
  {
    key: 'midnight-archive',
    title: '每天午夜归档当天对话',
    description: '把今天对话整理成笔记',
    message: '把今天我跟你的对话整理成一篇笔记,保留关键决策和待办,删除闲聊。',
    cron: '0 0 * * *',
    icon: BookOutline,
    fillForm: () => {
      resetForm()
      formName.value = '每天对话归档'
      formMode.value = 'daily'
      formTime.value = '00:00'
      formMessage.value = '把今天我跟你的对话整理成一篇笔记,保留关键决策和待办,删除闲聊。'
    },
  },
]

function openTemplate(tpl: Template) {
  tpl.fillForm()
  showCreateModal.value = true
}

async function handleCreate() {
  const name = formName.value.trim()
  if (!name) {
    message.warning('请填写任务名称')
    return
  }
  const msg = formMessage.value.trim()
  if (!msg) {
    message.warning('请填写指令内容')
    return
  }

  creating.value = true
  try {
    const schedule: CronSchedule = { kind: 'cron', expr: computedExpr.value }
    const payload: CronPayload = { kind: 'agentTurn', message: msg }
    await wsStore.rpc.createCron({
      name,
      enabled: true,
      schedule,
      payload,
    })
    message.success('任务已创建')
    showCreateModal.value = false
    await loadTasks()
  } catch (err: any) {
    message.error(err?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function handleToggle(task: TaskRow, value: boolean) {
  togglingId.value = task.id
  try {
    await wsStore.rpc.updateCron(task.id, { enabled: value })
    task.enabled = value
    message.success(value ? '已启用' : '已暂停')
  } catch (err: any) {
    message.error(err?.message || '操作失败')
    task.enabled = !value
  } finally {
    togglingId.value = null
  }
}

async function handleTrigger(task: TaskRow) {
  triggeringId.value = task.id
  try {
    await wsStore.rpc.runCron(task.id, 'force')
    message.success(`已手动触发 "${task.name}"`)
  } catch (err: any) {
    message.error(err?.message || '触发失败')
  } finally {
    triggeringId.value = null
  }
}

function handleDelete(task: TaskRow) {
  dialog.warning({
    title: '确认删除',
    content: `删除任务 "${task.name}"?此操作不可恢复`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deletingId.value = task.id
      try {
        await wsStore.rpc.deleteCron(task.id)
        message.success('已删除')
        await loadTasks()
      } catch (err: any) {
        message.error(err?.message || '删除失败')
      } finally {
        deletingId.value = null
      }
    },
  })
}

// 频率下拉选项
const FREQ_OPTIONS = [
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '每月某号', value: 'monthly' },
  { label: '自定义 Cron(高级)', value: 'custom' },
]

const WEEKDAY_OPTIONS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 0 },
]

const MONTH_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  label: `${i + 1} 号`,
  value: i + 1,
}))
</script>

<template>
  <div class="cron-page">
    <header class="page-head">
      <div>
        <h1 class="page-title">自动化任务</h1>
        <p class="page-subtitle">
          让 AI 助手按时间表自动执行任务,每天定时整理邮件、总结对话、生成报告。
          已启用 {{ enabledCount }} / {{ tasks.length }} 个
        </p>
      </div>
      <NButton type="primary" size="medium" @click="openCreate">
        <template #icon><NIcon><AddOutline /></NIcon></template>
        新建任务
      </NButton>
    </header>

    <NSpin :show="loading">
      <!-- 空状态:展示 3 个常用模板让用户一键开始 -->
      <div v-if="!loading && tasks.length === 0" class="empty-zone">
        <NEmpty :description="lastError || '还没有任务,从下方模板开始'">
          <template v-if="lastError" #extra>
            <NButton size="small" @click="loadTasks">重试</NButton>
          </template>
        </NEmpty>

        <div class="templates-row">
          <p class="templates-label">快速开始</p>
          <div class="templates-grid">
            <button
              v-for="tpl in TEMPLATES"
              :key="tpl.key"
              class="template-card"
              @click="openTemplate(tpl)"
            >
              <div class="template-icon">
                <NIcon size="18"><component :is="tpl.icon" /></NIcon>
              </div>
              <div class="template-body">
                <div class="template-title">{{ tpl.title }}</div>
                <p class="template-desc">{{ tpl.description }}</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- 任务列表 -->
      <div v-else class="task-list">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="task-card"
          :class="{ 'is-disabled': !task.enabled, 'is-deleting': deletingId === task.id }"
        >
          <div class="task-icon">
            <NIcon size="18"><CalendarOutline /></NIcon>
          </div>
          <div class="task-body">
            <div class="task-name-row">
              <span class="task-name">{{ task.name }}</span>
              <NTag size="small" :bordered="false" round>
                {{ task.exprDisplay }}
              </NTag>
            </div>
            <p v-if="task.message" class="task-msg">{{ task.message }}</p>
          </div>
          <div class="task-actions">
            <NButton
              quaternary
              size="small"
              :loading="triggeringId === task.id"
              :disabled="!task.enabled || triggeringId === task.id"
              @click="handleTrigger(task)"
            >
              <template #icon><NIcon><PlayOutline /></NIcon></template>
              立即执行
            </NButton>
            <NSwitch
              :value="task.enabled"
              :loading="togglingId === task.id"
              :disabled="togglingId === task.id"
              @update:value="(v: boolean) => handleToggle(task, v)"
            />
            <button class="delete-btn" @click="handleDelete(task)">
              <NIcon size="16"><TrashOutline /></NIcon>
            </button>
          </div>
        </div>
      </div>
    </NSpin>

    <!-- 新建 / 编辑 Modal -->
    <NModal
      v-model:show="showCreateModal"
      preset="card"
      title="新建任务"
      style="width: 520px;"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <p class="modal-desc">设置一个定时任务,到点 AI 自动执行你的指令。</p>

      <div class="form-item">
        <label class="form-label">任务名称</label>
        <NInput v-model:value="formName" placeholder="如:每天早晨总结日程" size="medium" />
      </div>

      <div class="form-row">
        <div class="form-item form-item-half">
          <label class="form-label">频率</label>
          <NSelect v-model:value="formMode" :options="FREQ_OPTIONS" size="medium" />
        </div>
        <div class="form-item form-item-half">
          <label class="form-label">时间</label>
          <NTimePicker
            v-model:formatted-value="formTime"
            format="HH:mm"
            value-format="HH:mm"
            size="medium"
            :disabled="formMode === 'custom'"
            style="width: 100%"
          />
        </div>
      </div>

      <div v-if="formMode === 'weekly'" class="form-item">
        <label class="form-label">星期几(可多选)</label>
        <NCheckboxGroup v-model:value="formWeekdays">
          <NSpace :size="8" wrap>
            <NCheckbox
              v-for="opt in WEEKDAY_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </NCheckbox>
          </NSpace>
        </NCheckboxGroup>
      </div>

      <div v-if="formMode === 'monthly'" class="form-item">
        <label class="form-label">每月几号</label>
        <NSelect
          v-model:value="formMonthDay"
          :options="MONTH_DAY_OPTIONS"
          size="medium"
        />
      </div>

      <div v-if="formMode === 'custom'" class="form-item">
        <label class="form-label">Cron 表达式</label>
        <NInput v-model:value="formCustomCron" placeholder="0 9 * * *" size="medium" />
        <p class="form-hint">格式:分 时 日 月 周。例如 <code>0 9 * * *</code> 表示每天 9 点</p>
      </div>

      <div class="form-item">
        <label class="form-label">指令</label>
        <NInput
          v-model:value="formMessage"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="到点要 AI 做什么,如:总结今天的待办并发邮件给我"
          size="medium"
        />
      </div>

      <div class="schedule-preview">
        <span class="preview-label">将在</span>
        <span class="preview-value">{{ computedDisplay }}</span>
        <span class="preview-label">执行</span>
      </div>

      <template #footer>
        <div class="modal-footer">
          <NSpace :size="8" style="margin-left: auto;">
            <NButton size="medium" :disabled="creating" @click="showCreateModal = false">取消</NButton>
            <NButton
              type="primary"
              size="medium"
              :loading="creating"
              @click="handleCreate"
            >
              创建
            </NButton>
          </NSpace>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.cron-page {
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
  max-width: 520px;
  line-height: 1.5;
}

/* 空状态 */
.empty-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 28px;
}

.templates-row {
  width: 100%;
  margin-top: 28px;
}

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
  gap: 10px;
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

.template-card:hover {
  border-color: var(--n-text-color-3);
}

.template-card:active {
  transform: scale(0.99);
}

.template-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--n-action-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--n-text-color-3);
}

.template-body {
  flex: 1;
  min-width: 0;
}

.template-title {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--n-text-color);
  margin-bottom: 3px;
}

.template-desc {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin: 0;
  line-height: 1.45;
}

/* 任务卡片 */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: border-color 0.15s ease, opacity 0.15s ease;
}

.task-card:hover {
  border-color: var(--n-text-color-3);
}

.task-card.is-disabled {
  opacity: 0.55;
}

.task-card.is-deleting {
  opacity: 0.4;
  pointer-events: none;
}

.task-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--n-action-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--n-text-color-3);
}

.task-body {
  flex: 1;
  min-width: 0;
}

.task-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.task-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
}

.task-msg {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin: 0;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.delete-btn {
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
  transition: opacity 0.12s ease, color 0.12s ease, background 0.12s ease;
}

.task-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
}

:root[data-theme='dark'] .delete-btn:hover {
  background: rgba(255, 99, 89, 0.12);
  color: #FF6359;
}

/* Modal 表单 */
.modal-desc {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0 0 16px;
  line-height: 1.5;
}

.form-item {
  margin-bottom: 14px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-item-half {
  flex: 1;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color);
  margin-bottom: 6px;
}

.form-hint {
  font-size: 11.5px;
  color: var(--n-text-color-3);
  margin: 4px 0 0;
}

.form-hint code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  background: var(--n-action-color);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11.5px;
}

.schedule-preview {
  background: var(--n-action-color);
  border-radius: 8px;
  padding: 10px 14px;
  margin-top: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.preview-label {
  color: var(--n-text-color-3);
}

.preview-value {
  color: var(--n-text-color);
  font-weight: 500;
}

.modal-footer {
  display: flex;
  width: 100%;
}
</style>
