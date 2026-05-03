<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NSpin, NButton, NIcon, NInput, NSelect, NTag, NSwitch,
  NModal, NPopconfirm, useMessage,
} from 'naive-ui'
import {
  CalendarOutline, AddOutline, RefreshOutline, SearchOutline,
  PencilOutline, TrashOutline, PlayOutline, TimeOutline,
  CheckmarkCircle, AlertCircleOutline,
} from '@vicons/ionicons5'
import { useHermesCronStore } from '@/stores/hermes/cron'
import type { HermesCronJob } from '@/api/hermes/types'

const message = useMessage()
const cronStore = useHermesCronStore()

const searchQuery = ref('')
const statusFilter = ref<'all' | 'enabled' | 'disabled'>('all')

const STATUS_OPTIONS = [
  { label: '全部状态', value: 'all' },
  { label: '启用中', value: 'enabled' },
  { label: '已停用', value: 'disabled' },
]

const SCHEDULE_TEMPLATES: Array<{ label: string; value: string; hint: string }> = [
  { label: '每分钟', value: '* * * * *', hint: '调试用,正式环境慎用' },
  { label: '每 15 分钟', value: '*/15 * * * *', hint: '常用轮询频率' },
  { label: '每小时整点', value: '0 * * * *', hint: '00 分触发' },
  { label: '每天 09:00', value: '0 9 * * *', hint: '工作日早会前推送' },
  { label: '每周一 09:00', value: '0 9 * * 1', hint: '周报触发' },
  { label: '每月 1 日 09:00', value: '0 9 1 * *', hint: '月度任务' },
]

const stats = computed(() => {
  const all = cronStore.jobs
  return {
    total: all.length,
    enabled: all.filter((j) => j.enabled).length,
    failed: all.filter((j) => j.lastStatus === 'error').length,
  }
})

const filteredJobs = computed(() => {
  let list = cronStore.jobs
  if (statusFilter.value === 'enabled') list = list.filter((j) => j.enabled)
  else if (statusFilter.value === 'disabled') list = list.filter((j) => !j.enabled)
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (j) =>
      j.name.toLowerCase().includes(q) ||
      (j.description || '').toLowerCase().includes(q) ||
      j.schedule.toLowerCase().includes(q),
  )
})

// ---- Modal ----
const showModal = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingId = ref<string>('')
const formData = ref({
  name: '',
  description: '',
  enabled: true,
  schedule: '0 9 * * *',
  command: '',
  timezone: 'Asia/Shanghai',
})

function resetForm() {
  formData.value = {
    name: '',
    description: '',
    enabled: true,
    schedule: '0 9 * * *',
    command: '',
    timezone: 'Asia/Shanghai',
  }
}

function openCreateModal() {
  modalMode.value = 'create'
  editingId.value = ''
  resetForm()
  showModal.value = true
}

function openEditModal(job: HermesCronJob) {
  modalMode.value = 'edit'
  editingId.value = job.id
  formData.value = {
    name: job.name,
    description: job.description || '',
    enabled: job.enabled,
    schedule: job.schedule,
    command: job.command || '',
    timezone: job.timezone || 'Asia/Shanghai',
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

function applyTemplate(value: string) {
  formData.value.schedule = value
}

async function handleSave() {
  if (!formData.value.name.trim()) {
    message.error('请填写任务名称')
    return
  }
  if (!formData.value.schedule.trim()) {
    message.error('请填写 cron 表达式')
    return
  }
  try {
    if (modalMode.value === 'create') {
      await cronStore.createJob({
        name: formData.value.name.trim(),
        description: formData.value.description.trim() || undefined,
        enabled: formData.value.enabled,
        schedule: formData.value.schedule.trim(),
        command: formData.value.command.trim() || undefined,
        timezone: formData.value.timezone.trim() || undefined,
      })
      message.success('已创建任务')
    } else {
      await cronStore.updateJob(editingId.value, {
        name: formData.value.name.trim(),
        description: formData.value.description.trim() || undefined,
        enabled: formData.value.enabled,
        schedule: formData.value.schedule.trim(),
        command: formData.value.command.trim() || undefined,
        timezone: formData.value.timezone.trim() || undefined,
      })
      message.success('已更新任务')
    }
    closeModal()
  } catch (error) {
    message.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function handleToggle(id: string, enabled: boolean) {
  try {
    if (enabled) await cronStore.resumeJob(id)
    else await cronStore.pauseJob(id)
    message.success(enabled ? '已启用' : '已暂停')
  } catch (error) {
    message.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function handleTrigger(id: string) {
  try {
    await cronStore.triggerJob(id)
    message.success('已手动触发')
  } catch (error) {
    message.error(`触发失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function handleDelete(id: string) {
  try {
    await cronStore.deleteJob(id)
    message.success('已删除')
  } catch (error) {
    message.error(`删除失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function refreshAll() {
  try {
    await cronStore.fetchJobs()
  } catch {
    // store 已记
  }
}

function formatTime(value: string | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const yyyy = d.getFullYear()
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const dd = d.getDate().toString().padStart(2, '0')
  const hh = d.getHours().toString().padStart(2, '0')
  const mi = d.getMinutes().toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

onMounted(() => {
  refreshAll()
})
</script>

<template>
  <div class="ling-cron">
    <header class="page-head">
      <div>
        <h1 class="page-title">自动化任务</h1>
        <p class="page-subtitle">用 cron 表达式定时触发 Hermes Agent。每天早报、每周巡检、每月小结都能编排。</p>
      </div>
      <div class="head-actions">
        <NButton :loading="cronStore.loading" @click="refreshAll">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
        <NButton type="primary" @click="openCreateModal">
          <template #icon><NIcon><AddOutline /></NIcon></template>
          新建任务
        </NButton>
      </div>
    </header>

    <NSpin :show="cronStore.loading">
      <!-- 工具条 -->
      <section class="toolbar">
        <NInput
          v-model:value="searchQuery"
          clearable
          placeholder="搜索任务名称、描述或表达式"
          size="medium"
          class="search-input"
        >
          <template #prefix><NIcon><SearchOutline /></NIcon></template>
        </NInput>
        <NSelect
          v-model:value="statusFilter"
          :options="STATUS_OPTIONS"
          size="medium"
          class="status-select"
        />
        <span class="stats-meta">
          {{ stats.total }} 个任务 · {{ stats.enabled }} 启用 · {{ stats.failed }} 失败
        </span>
      </section>

      <div v-if="cronStore.lastError" class="error-bar">
        加载失败: {{ cronStore.lastError }}
      </div>

      <!-- 任务列表 -->
      <section class="jobs-section">
        <div v-if="filteredJobs.length === 0 && !cronStore.loading" class="empty">
          <NIcon size="32"><CalendarOutline /></NIcon>
          <div class="empty-title">{{ cronStore.jobs.length === 0 ? '还没有任务' : '没有匹配的任务' }}</div>
          <div class="empty-hint">
            {{ cronStore.jobs.length === 0
              ? '点击右上角"新建任务"创建第一个定时任务'
              : '换个搜索词或筛选条件试试' }}
          </div>
        </div>

        <div v-else class="jobs-list">
          <div
            v-for="j in filteredJobs"
            :key="j.id"
            class="job-row"
            :class="{ 'is-enabled': j.enabled, 'is-error': j.lastStatus === 'error' }"
          >
            <div class="job-main">
              <div class="job-name-wrap">
                <span class="job-name">{{ j.name }}</span>
                <NTag size="small" :bordered="false" type="info" class="job-schedule-tag">
                  <template #icon><NIcon><TimeOutline /></NIcon></template>
                  {{ j.schedule }}
                </NTag>
                <NTag v-if="j.lastStatus === 'error'" size="small" :bordered="false" type="error">
                  最近失败
                </NTag>
                <NTag v-else-if="j.lastStatus === 'ok'" size="small" :bordered="false" type="success">
                  最近 OK
                </NTag>
              </div>
              <p v-if="j.description" class="job-desc">{{ j.description }}</p>
              <div class="job-meta">
                <span><strong>下次:</strong> {{ formatTime(j.nextRun) }}</span>
                <span><strong>上次:</strong> {{ formatTime(j.lastRun) }}</span>
                <span v-if="j.timezone">{{ j.timezone }}</span>
              </div>
            </div>
            <div class="job-actions">
              <NSwitch
                :value="j.enabled"
                size="small"
                @update:value="(v: boolean) => handleToggle(j.id, v)"
              />
              <NButton size="small" @click="handleTrigger(j.id)">
                <template #icon><NIcon><PlayOutline /></NIcon></template>
                触发
              </NButton>
              <NButton size="small" @click="openEditModal(j)">
                <template #icon><NIcon><PencilOutline /></NIcon></template>
              </NButton>
              <NPopconfirm
                @positive-click="handleDelete(j.id)"
                positive-text="删除"
                negative-text="取消"
              >
                <template #trigger>
                  <NButton size="small" tertiary>
                    <template #icon><NIcon><TrashOutline /></NIcon></template>
                  </NButton>
                </template>
                确定删除任务 {{ j.name }}?
              </NPopconfirm>
            </div>
          </div>
        </div>
      </section>
    </NSpin>

    <!-- Modal -->
    <NModal
      :show="showModal"
      preset="card"
      :title="modalMode === 'create' ? '新建定时任务' : `编辑 ${formData.name}`"
      :style="{ maxWidth: '560px' }"
      @update:show="(v: boolean) => !v && closeModal()"
    >
      <div class="editor">
        <div class="editor-field">
          <label class="editor-label">任务名称</label>
          <NInput
            v-model:value="formData.name"
            placeholder="例如:每日新闻摘要"
            size="medium"
          />
        </div>

        <div class="editor-field">
          <label class="editor-label">描述 <span class="optional">(可选)</span></label>
          <NInput
            v-model:value="formData.description"
            type="textarea"
            placeholder="说明这个任务做什么"
            :autosize="{ minRows: 2, maxRows: 4 }"
            size="medium"
          />
        </div>

        <div class="editor-field">
          <label class="editor-label">
            <NIcon size="14"><CalendarOutline /></NIcon>
            cron 表达式
          </label>
          <NInput
            v-model:value="formData.schedule"
            placeholder="0 9 * * *"
            size="medium"
          />
          <div class="editor-hint">分 时 日 月 周。比如 <code>0 9 * * *</code> 表示每天 09:00 触发</div>
          <div class="schedule-templates">
            <button
              v-for="tpl in SCHEDULE_TEMPLATES"
              :key="tpl.value"
              type="button"
              class="schedule-tpl"
              :class="{ active: formData.schedule === tpl.value }"
              @click="applyTemplate(tpl.value)"
              :title="tpl.hint"
            >
              {{ tpl.label }}
            </button>
          </div>
        </div>

        <div class="editor-row">
          <div class="editor-field">
            <label class="editor-label">命令 <span class="optional">(可选)</span></label>
            <NInput
              v-model:value="formData.command"
              placeholder="留空则用任务默认 prompt"
              size="medium"
            />
          </div>
          <div class="editor-field">
            <label class="editor-label">时区</label>
            <NInput
              v-model:value="formData.timezone"
              placeholder="Asia/Shanghai"
              size="medium"
            />
          </div>
        </div>

        <div class="editor-field editor-toggle">
          <label class="editor-label">立即启用</label>
          <NSwitch v-model:value="formData.enabled" />
        </div>

        <div class="editor-actions">
          <NButton @click="closeModal">取消</NButton>
          <NButton type="primary" :loading="cronStore.saving" @click="handleSave">保存</NButton>
        </div>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.ling-cron {
  max-width: 880px;
  margin: 0 auto;
  padding: 16px 8px 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.page-title {
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.2px;
  color: var(--n-text-color);
  margin: 0 0 6px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0;
  max-width: 560px;
  line-height: 1.5;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 0 4px;
  flex-wrap: wrap;
}

.search-input { flex: 1; min-width: 200px; max-width: 320px; }
.status-select { min-width: 130px; max-width: 160px; }

.stats-meta {
  font-size: 12px;
  color: var(--n-text-color-3);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

.error-bar {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 14px;
}

.jobs-section { margin-top: 4px; }

.jobs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.job-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 12px 14px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.job-row.is-enabled {
  border-color: rgba(52, 199, 89, 0.35);
  background: rgba(52, 199, 89, 0.02);
}

.job-row.is-error {
  border-color: rgba(255, 59, 48, 0.35);
  background: rgba(255, 59, 48, 0.03);
}

:root[data-theme='dark'] .job-row.is-enabled {
  border-color: rgba(48, 209, 88, 0.4);
  background: rgba(48, 209, 88, 0.05);
}

:root[data-theme='dark'] .job-row.is-error {
  border-color: rgba(255, 69, 58, 0.4);
  background: rgba(255, 69, 58, 0.05);
}

.job-main { flex: 1; min-width: 0; }

.job-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.job-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
}

.job-schedule-tag {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 11.5px;
}

.job-desc {
  font-size: 12.5px;
  color: var(--n-text-color-2);
  line-height: 1.5;
  margin: 0 0 4px;
}

.job-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--n-text-color-3);
  font-variant-numeric: tabular-nums;
}

.job-meta strong {
  font-weight: 500;
  color: var(--n-text-color-2);
}

.job-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 60px 20px;
  color: var(--n-text-color-3);
  text-align: center;
}

.empty-title {
  font-size: 14px;
  color: var(--n-text-color-2);
  margin-top: 4px;
}

.empty-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.editor { padding: 4px 0 0; }

.editor-field { margin-bottom: 14px; }

.editor-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.editor-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color-2);
  margin-bottom: 6px;
}

.editor-label .optional {
  font-weight: 400;
  color: var(--n-text-color-3);
  font-size: 12px;
}

.editor-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin-top: 4px;
}

.editor-hint code {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  background: var(--n-action-color);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11.5px;
}

.schedule-templates {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.schedule-tpl {
  font: inherit;
  font-size: 11.5px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--n-border-color);
  background: var(--n-card-color);
  color: var(--n-text-color-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.schedule-tpl:hover {
  border-color: rgba(0, 122, 255, 0.4);
  color: var(--n-text-color);
}

.schedule-tpl.active {
  border-color: #007AFF;
  color: #007AFF;
  background: rgba(0, 122, 255, 0.06);
}

:root[data-theme='dark'] .schedule-tpl.active {
  border-color: #0A84FF;
  color: #0A84FF;
  background: rgba(10, 132, 255, 0.1);
}

.editor-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.editor-toggle .editor-label { margin-bottom: 0; }

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
</style>
