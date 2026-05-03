<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NSpin, NButton, NIcon, NInput, useMessage } from 'naive-ui'
import {
  BookOutline, RefreshOutline, SaveOutline, CheckmarkCircle,
} from '@vicons/ionicons5'
import { useHermesMemoryStore } from '@/stores/hermes/memory'
import { useHermesConnectionStore } from '@/stores/hermes/connection'

const message = useMessage()
const memoryStore = useHermesMemoryStore()
const connStore = useHermesConnectionStore()

const draft = ref('')
const lastSavedAt = ref<number | null>(null)
const hasFetched = ref(false)

const isDirty = computed(() => draft.value !== memoryStore.memoryContent)
const charCount = computed(() => draft.value.length)
const lineCount = computed(() => draft.value ? draft.value.split('\n').length : 0)

watch(
  () => memoryStore.memoryContent,
  (val) => {
    if (!isDirty.value) draft.value = val
  },
)

// 初次进页面时 hermes connection 可能还没就绪 — 此时 fetchMemory 抛
// "Hermes 未连接",textarea 一直空。监听 hermesConnected,连上后自动拉一次。
watch(
  () => connStore.hermesConnected,
  (connected) => {
    if (connected && !hasFetched.value) {
      refreshAll()
    }
  },
)

async function refreshAll() {
  try {
    await memoryStore.fetchMemory()
    draft.value = memoryStore.memoryContent
    hasFetched.value = true
  } catch (error) {
    // connection 未就绪时静默 — 等 watch 触发重试
    if (connStore.hermesConnected) {
      message.error(`加载失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

async function handleSave() {
  try {
    await memoryStore.updateMemory(draft.value)
    lastSavedAt.value = Date.now()
    message.success('已保存')
  } catch (error) {
    message.error(`保存失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function handleRevert() {
  draft.value = memoryStore.memoryContent
}

function formatSavedAt(): string {
  if (!lastSavedAt.value) return ''
  const d = new Date(lastSavedAt.value)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

onMounted(async () => {
  await refreshAll()
})
</script>

<template>
  <div class="ling-memory">
    <header class="page-head">
      <div>
        <h1 class="page-title">记忆</h1>
        <p class="page-subtitle">
          Hermes Agent 的常驻记忆,跨对话保留。写下你希望 Agent 一直记住的偏好、规则、上下文 — 类似 CLAUDE.md。
        </p>
      </div>
      <div class="head-actions">
        <NButton :loading="memoryStore.loading" @click="refreshAll">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
        <NButton v-if="isDirty" @click="handleRevert">放弃修改</NButton>
        <NButton
          type="primary"
          :loading="memoryStore.saving"
          :disabled="!isDirty"
          @click="handleSave"
        >
          <template #icon><NIcon><SaveOutline /></NIcon></template>
          保存
        </NButton>
      </div>
    </header>

    <NSpin :show="memoryStore.loading">
      <div v-if="memoryStore.lastError" class="error-bar">
        加载失败: {{ memoryStore.lastError }}
      </div>

      <section class="editor-card">
        <NInput
          v-model:value="draft"
          type="textarea"
          placeholder="# 我的偏好&#10;&#10;- 用中文交流&#10;- 输出代码时附简短解释&#10;- ..."
          :autosize="{ minRows: 16, maxRows: 32 }"
          class="memory-textarea"
        />
      </section>

      <footer class="status-bar">
        <div class="status-left">
          <NIcon size="14"><BookOutline /></NIcon>
          <span class="status-meta">{{ charCount }} 字符 · {{ lineCount }} 行</span>
        </div>
        <div class="status-right">
          <span v-if="lastSavedAt" class="status-saved">
            <NIcon size="14"><CheckmarkCircle /></NIcon>
            最后保存 {{ formatSavedAt() }}
          </span>
          <span v-if="isDirty" class="status-dirty">未保存</span>
        </div>
      </footer>
    </NSpin>
  </div>
</template>

<style scoped>
.ling-memory {
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

.error-bar {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 14px;
}

.editor-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  padding: 4px;
  overflow: hidden;
}

.memory-textarea :deep(.n-input__textarea-el),
.memory-textarea :deep(.n-input__textarea-mirror) {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.65;
  padding: 14px 16px;
}

.memory-textarea :deep(.n-input) {
  background: transparent;
}

.memory-textarea :deep(.n-input__border),
.memory-textarea :deep(.n-input__state-border) {
  border: none !important;
}

.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 0 6px;
  font-size: 12px;
  color: var(--n-text-color-3);
}

.status-left,
.status-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-meta {
  font-variant-numeric: tabular-nums;
}

.status-saved {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #34C759;
}

:root[data-theme='dark'] .status-saved { color: #30D158; }

.status-dirty {
  color: #FF9500;
  font-weight: 500;
}

:root[data-theme='dark'] .status-dirty { color: #FF9F0A; }
</style>
