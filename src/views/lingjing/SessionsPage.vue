<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NSpin, NEmpty, NInput, NButton, NIcon, NPopconfirm, useMessage,
} from 'naive-ui'
import {
  ChatbubblesOutline, AddOutline, SearchOutline, TrashOutline,
} from '@vicons/ionicons5'
import { useSessionStore } from '@/stores/session'

interface SessionRow {
  key: string
  title: string
  subtitle: string
  messageCount: number
  lastActivityTs: number
  groupKey: string
  groupLabel: string
}

const router = useRouter()
const message = useMessage()
const sessionStore = useSessionStore()

const search = ref('')
const deletingKey = ref<string | null>(null)

onMounted(() => {
  sessionStore.fetchSessions()
})

function shortKey(key: string): string {
  // agent:main:main 这种长 key 提炼末段(用户可识别的简称)
  const parts = key.split(':')
  return parts[parts.length - 1] || key
}

function deriveTitle(label: string | undefined, key: string): string {
  if (label && label.trim()) return label.trim()
  // 没 label 的会话给一个稳定的人类可读名:"对话 main" / "对话 a3f9"
  return `对话 ${shortKey(key)}`
}

function relativeTime(ts: number): { groupKey: string; groupLabel: string; subtitle: string } {
  const now = new Date()
  const date = new Date(ts)
  const diffMs = now.getTime() - ts
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHour = Math.floor(diffMs / 3_600_000)
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  const yest = new Date(now)
  yest.setDate(now.getDate() - 1)

  // 副标题(精确时间表达)
  let subtitle = ''
  if (diffMin < 1) subtitle = '刚刚'
  else if (diffMin < 60) subtitle = `${diffMin} 分钟前`
  else if (isSameDay(now, date)) subtitle = `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  else if (isSameDay(yest, date)) subtitle = `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  else if (diffHour < 24 * 7) subtitle = `${Math.floor(diffHour / 24)} 天前`
  else subtitle = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`

  // 分组(用于按时间分组显示)
  let groupKey = 'older'
  let groupLabel = '更早'
  if (isSameDay(now, date)) {
    groupKey = 'today'
    groupLabel = '今天'
  } else if (isSameDay(yest, date)) {
    groupKey = 'yesterday'
    groupLabel = '昨天'
  } else if (diffHour < 24 * 7) {
    groupKey = 'week'
    groupLabel = '一周内'
  } else if (diffHour < 24 * 30) {
    groupKey = 'month'
    groupLabel = '一个月内'
  }
  return { groupKey, groupLabel, subtitle }
}

function parseAnyTimestamp(value: unknown): number {
  // 兼容 ISO 字符串("2026-04-30T..."),纯数字时间戳字符串("1777571370292"),
  // 数字、null、undefined。失败统一回 0,渲染时分到"更早"组。
  if (value == null || value === '') return 0
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    // 全是数字 → 当时间戳数字处理
    if (/^\d{10,}$/.test(value.trim())) return Number(value)
    const ts = new Date(value).getTime()
    return Number.isFinite(ts) ? ts : 0
  }
  return 0
}

const rows = computed<SessionRow[]>(() => {
  return sessionStore.sessions.map((s) => {
    const ts = parseAnyTimestamp(s.lastActivity)
    const { groupKey, groupLabel, subtitle } = relativeTime(ts)
    const tsLabel = ts === 0 ? '时间未知' : subtitle
    return {
      key: s.key,
      title: deriveTitle(s.label, s.key),
      subtitle: `${s.messageCount || 0} 条消息 · ${tsLabel}`,
      messageCount: s.messageCount || 0,
      lastActivityTs: ts,
      groupKey,
      groupLabel,
    }
  })
})

const filtered = computed<SessionRow[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((r) => r.title.toLowerCase().includes(q))
})

interface Group {
  key: string
  label: string
  rows: SessionRow[]
}

// 按时间分组,每组内按最近活动倒序
const groupOrder = ['today', 'yesterday', 'week', 'month', 'older']
const grouped = computed<Group[]>(() => {
  const map = new Map<string, Group>()
  for (const r of filtered.value) {
    if (!map.has(r.groupKey)) map.set(r.groupKey, { key: r.groupKey, label: r.groupLabel, rows: [] })
    map.get(r.groupKey)!.rows.push(r)
  }
  for (const g of map.values()) {
    g.rows.sort((a, b) => b.lastActivityTs - a.lastActivityTs)
  }
  return groupOrder.map((k) => map.get(k)).filter((g): g is Group => !!g)
})

function openSession(row: SessionRow) {
  router.push({ path: '/chat', query: { session: row.key } })
}

function newSession() {
  // 直接进 /chat,默认开 main 会话(也是用户大多数情况想要的"新对话"行为)
  router.push({ path: '/chat' })
}

async function handleDelete(row: SessionRow) {
  deletingKey.value = row.key
  try {
    await sessionStore.deleteSession(row.key)
    message.success('已删除')
    await sessionStore.fetchSessions()
  } catch (err: any) {
    message.error(err?.message || '删除失败')
  } finally {
    deletingKey.value = null
  }
}
</script>

<template>
  <div class="ling-sessions">
    <header class="page-head">
      <div>
        <h1 class="page-title">历史对话</h1>
        <p class="page-subtitle">所有跟 AI 的对话都在这里。点击继续,或开新一段。</p>
      </div>
      <NButton type="primary" size="medium" @click="newSession">
        <template #icon><NIcon><AddOutline /></NIcon></template>
        新建对话
      </NButton>
    </header>

    <div class="search-row">
      <NInput
        v-model:value="search"
        placeholder="搜索对话标题"
        size="medium"
        clearable
        class="search-input"
      >
        <template #prefix><NIcon><SearchOutline /></NIcon></template>
      </NInput>
    </div>

    <NSpin :show="sessionStore.loading">
      <div v-if="!sessionStore.loading && rows.length === 0" class="empty-state">
        <NEmpty description="还没有对话">
          <template #icon>
            <NIcon size="44" :depth="3"><ChatbubblesOutline /></NIcon>
          </template>
          <template #extra>
            <NButton size="medium" type="primary" @click="newSession">开始第一段对话</NButton>
          </template>
        </NEmpty>
      </div>

      <div v-else-if="filtered.length === 0" class="empty-state-inline">
        没有匹配的对话
      </div>

      <div v-else class="groups">
        <section
          v-for="g in grouped"
          :key="g.key"
          class="group"
        >
          <div class="group-label">{{ g.label }}</div>
          <div class="group-list">
            <div
              v-for="row in g.rows"
              :key="row.key"
              class="session-card"
              :class="{ 'is-deleting': deletingKey === row.key }"
              @click="openSession(row)"
            >
              <div class="session-icon">
                <NIcon size="18"><ChatbubblesOutline /></NIcon>
              </div>
              <div class="session-body">
                <div class="session-title">{{ row.title }}</div>
                <div class="session-subtitle">{{ row.subtitle }}</div>
              </div>
              <NPopconfirm
                @positive-click="handleDelete(row)"
                positive-text="删除"
                negative-text="取消"
              >
                <template #trigger>
                  <button class="delete-btn" @click.stop>
                    <NIcon size="16"><TrashOutline /></NIcon>
                  </button>
                </template>
                确定删除 "{{ row.title }}"?对话内容不可恢复
              </NPopconfirm>
            </div>
          </div>
        </section>
      </div>
    </NSpin>
  </div>
</template>

<style scoped>
.ling-sessions {
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
  margin-bottom: 18px;
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
  max-width: 520px;
  line-height: 1.5;
}

.search-row {
  margin-bottom: 18px;
}

.search-input {
  width: 100%;
}

.empty-state {
  margin-top: 60px;
  text-align: center;
}

.empty-state-inline {
  text-align: center;
  padding: 60px 16px;
  color: var(--n-text-color-disabled);
  font-size: 13px;
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.group-label {
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  margin: 0 4px 8px;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.session-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    transform 0.12s ease,
    background 0.12s ease;
}

.session-card:hover {
  border-color: var(--n-text-color-3);
}

.session-card:active {
  transform: scale(0.99);
}

.session-card.is-deleting {
  opacity: 0.5;
  pointer-events: none;
}

.session-icon {
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

.session-body {
  flex: 1;
  min-width: 0;
}

.session-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-subtitle {
  font-size: 12px;
  color: var(--n-text-color-3);
  font-variant-numeric: tabular-nums;
}

.delete-btn {
  flex-shrink: 0;
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

.session-card:hover .delete-btn {
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
</style>
