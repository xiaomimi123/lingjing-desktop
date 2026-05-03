<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { NButton, NSelect, NInput, NIcon, NTooltip, useMessage } from 'naive-ui'
import { AddOutline, SendOutline, StopCircleOutline } from '@vicons/ionicons5'
import MarkdownIt from 'markdown-it'
import {
  listPlaygroundModels,
  streamPlaygroundChat,
  type ChatMessage,
  type PlaygroundModelInfo,
} from '@/api/lingjing/chat'
import { useLingjingBillingStore } from '@/stores/lingjing-billing'

const message = useMessage()
const billing = useLingjingBillingStore()

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

const models = ref<PlaygroundModelInfo[]>([])
const selectedModel = ref<string>('')
const messages = ref<ChatMessage[]>([])
const input = ref('')
const sending = ref(false)
const currentChatId = ref<number>(0)
const messageListEl = ref<HTMLElement | null>(null)
const modelsLoading = ref(false)
const modelsError = ref<string>('')

let abortCtrl: AbortController | null = null

const modelOptions = computed(() =>
  models.value.map((m) => ({ label: m.name || m.id, value: m.id })),
)

const canSend = computed(
  () => !!selectedModel.value && input.value.trim().length > 0 && !sending.value,
)

// 低余额提示阈值: 50000 quota ≈ $0.10
const LOW_BALANCE_THRESHOLD = 50_000
const balanceLow = computed(() => billing.quota < LOW_BALANCE_THRESHOLD)
const balanceEmpty = computed(() => billing.quota <= 0)

function openRecharge() {
  window.open('https://aitoken.homes', '_blank')
}

onMounted(async () => {
  await loadModels()
})

onUnmounted(() => {
  abortCtrl?.abort()
})

async function loadModels() {
  modelsLoading.value = true
  modelsError.value = ''
  try {
    const list = await listPlaygroundModels()
    console.log('[chat] models loaded:', list.length, list)
    models.value = list
    if (list.length > 0 && !selectedModel.value) {
      const featured = list.find((m) => m.featured) || list[0]
      selectedModel.value = featured.id
    }
    if (list.length === 0) {
      modelsError.value = '账号下没有可用模型,请检查 group 权限或联系灵镜管理员'
    }
  } catch (err: any) {
    console.error('[chat] loadModels failed:', err)
    const msg = err?.response?.data?.message || err?.message || '加载模型列表失败'
    modelsError.value = `加载模型失败:${msg}`
    message.error(modelsError.value)
  } finally {
    modelsLoading.value = false
  }
}

function newChat() {
  abortCtrl?.abort()
  abortCtrl = null
  currentChatId.value = 0
  messages.value = []
  input.value = ''
}

async function scrollToBottom() {
  await nextTick()
  if (messageListEl.value) {
    messageListEl.value.scrollTop = messageListEl.value.scrollHeight
  }
}

function renderMarkdown(text: string): string {
  return md.render(text || '')
}

async function handleSend() {
  if (!canSend.value) return

  const userText = input.value.trim()
  input.value = ''

  messages.value.push({ role: 'user', content: userText })
  messages.value.push({ role: 'assistant', content: '' })
  sending.value = true
  scrollToBottom()

  abortCtrl = new AbortController()

  try {
    await streamPlaygroundChat(
      {
        chat_id: currentChatId.value || undefined,
        model: selectedModel.value,
        messages: messages.value
          .slice(0, -1) // 不含我们刚 push 的空 assistant 占位
          .map((m) => ({ role: m.role, content: m.content })),
      },
      {
        onChatId: (id) => {
          currentChatId.value = id
        },
        onDelta: (delta) => {
          const last = messages.value[messages.value.length - 1]
          if (last?.role === 'assistant') {
            last.content += delta
            scrollToBottom()
          }
        },
        onDone: () => {
          // 对话扣完费,刷余额
          billing.fetchBalance()
        },
        onError: (err) => {
          message.error(err.message || '对话失败')
          // 移除占位的空 assistant 消息(如果没收到任何 delta)
          const last = messages.value[messages.value.length - 1]
          if (last?.role === 'assistant' && !last.content) {
            messages.value.pop()
          }
        },
        signal: abortCtrl.signal,
      },
    )
  } catch (err: any) {
    console.error('[chat] unhandled error:', err)
    message.error(err?.message || '对话失败')
    const last = messages.value[messages.value.length - 1]
    if (last?.role === 'assistant' && !last.content) {
      messages.value.pop()
    }
  } finally {
    sending.value = false
    abortCtrl = null
  }
}

function handleStop() {
  abortCtrl?.abort()
  abortCtrl = null
  sending.value = false
}

function handleKeyDown(e: KeyboardEvent) {
  // Cmd+Enter / Ctrl+Enter 发送
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    if (canSend.value) handleSend()
  }
}

watch(
  () => messages.value.length,
  () => scrollToBottom(),
)
</script>

<template>
  <div class="lingjing-chat">
    <header class="chat-header">
      <div class="header-left">
        <NSelect
          v-model:value="selectedModel"
          :options="modelOptions"
          size="small"
          class="model-select"
          :placeholder="modelsLoading ? '加载模型中...' : (models.length === 0 ? '无可用模型' : '选择模型')"
          :loading="modelsLoading"
          :disabled="modelsLoading || models.length === 0"
          :consistent-menu-width="false"
        />
        <NButton v-if="!modelsLoading && (models.length === 0 || modelsError)" quaternary size="tiny" @click="loadModels">
          重试
        </NButton>
      </div>
      <div class="header-right">
        <NTooltip>
          <template #trigger>
            <NButton quaternary circle @click="newChat">
              <template #icon>
                <NIcon><AddOutline /></NIcon>
              </template>
            </NButton>
          </template>
          新建对话
        </NTooltip>
      </div>
    </header>

    <div v-if="modelsError" class="models-error-banner">
      {{ modelsError }}
    </div>

    <div ref="messageListEl" class="message-list">
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-title">和灵境聊点什么</div>
        <div class="empty-hint">输入消息后按 ⌘ + Enter 发送</div>
      </div>

      <template v-else>
        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          class="msg-row"
          :class="msg.role === 'user' ? 'msg-row-user' : 'msg-row-assistant'"
        >
          <div class="msg-bubble" :class="`msg-bubble-${msg.role}`">
            <div
              v-if="msg.role === 'assistant'"
              class="msg-content markdown"
              v-html="renderMarkdown(msg.content) || '<span class=&quot;cursor&quot;></span>'"
            />
            <div v-else class="msg-content">{{ msg.content }}</div>
          </div>
        </div>
      </template>
    </div>

    <footer class="composer">
      <div v-if="balanceLow" class="balance-warning">
        <span>{{ balanceEmpty ? '余额已用完,无法继续对话' : '余额即将用完,建议先充值' }}</span>
        <button class="recharge-btn" @click="openRecharge">去充值</button>
      </div>

      <NInput
        v-model:value="input"
        type="textarea"
        placeholder="给灵境发消息..."
        :autosize="{ minRows: 2, maxRows: 8 }"
        class="composer-input"
        @keydown="handleKeyDown"
      />
      <div class="composer-actions">
        <span class="composer-hint">⌘ + Enter 发送</span>
        <NButton
          v-if="sending"
          quaternary
          size="small"
          @click="handleStop"
        >
          <template #icon>
            <NIcon><StopCircleOutline /></NIcon>
          </template>
          停止
        </NButton>
        <NButton
          v-else
          type="primary"
          size="small"
          :disabled="!canSend"
          @click="handleSend"
        >
          <template #icon>
            <NIcon><SendOutline /></NIcon>
          </template>
          发送
        </NButton>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.lingjing-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-bottom: 1px solid var(--n-divider-color, rgba(0, 0, 0, 0.06));
  flex-shrink: 0;
}

.model-select {
  min-width: 180px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.models-error-banner {
  background: rgba(217, 83, 79, 0.08);
  color: #d9534f;
  padding: 8px 24px;
  font-size: 12.5px;
  border-bottom: 1px solid rgba(217, 83, 79, 0.16);
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0;
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--n-text-color-disabled, #98989d);
}

.empty-title {
  font-size: 18px;
  font-weight: 300;
  letter-spacing: 0.05em;
}

.empty-hint {
  font-size: 12px;
}

.msg-row {
  display: flex;
  padding: 6px 24px;
}

.msg-row-user {
  justify-content: flex-end;
}

.msg-row-assistant {
  justify-content: flex-start;
}

.msg-bubble {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
}

.msg-bubble-user {
  background: var(--n-action-color);
  color: #FFFFFF;
}

.msg-bubble-assistant {
  background: var(--n-action-color, #F2F2F7);
  color: var(--n-text-color, #1F1F1F);
  white-space: normal;
}

.msg-content.markdown {
  font-family: inherit;
}

.msg-content.markdown :deep(p) {
  margin: 0 0 8px;
}

.msg-content.markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.msg-content.markdown :deep(pre) {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
}

.msg-content.markdown :deep(code) {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.92em;
}

.msg-content.markdown :deep(p code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 5px;
  border-radius: 4px;
}

.cursor {
  display: inline-block;
  width: 7px;
  height: 14px;
  vertical-align: middle;
  background: currentColor;
  opacity: 0.6;
  animation: blink 1s steps(2) infinite;
}

@keyframes blink {
  to { opacity: 0; }
}

.composer {
  border-top: 1px solid var(--n-divider-color, rgba(0, 0, 0, 0.06));
  padding: 14px 24px 18px;
  flex-shrink: 0;
}

.balance-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  background: rgba(224, 168, 0, 0.08);
  color: #b07d00;
  border: 1px solid rgba(224, 168, 0, 0.2);
  border-radius: 6px;
  font-size: 12.5px;
  margin-bottom: 10px;
}

.recharge-btn {
  background: #b07d00;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
}

.recharge-btn:hover {
  background: #946a00;
}

:root[data-theme='dark'] .balance-warning {
  background: rgba(224, 168, 0, 0.15);
  color: #e0a800;
  border-color: rgba(224, 168, 0, 0.3);
}

.composer-input {
  border-radius: 8px;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.composer-hint {
  font-size: 12px;
  color: var(--n-text-color-disabled, #98989d);
  margin-right: auto;
}

:root[data-theme='dark'] .msg-bubble-assistant {
  background: rgba(255, 255, 255, 0.08);
}

:root[data-theme='dark'] .msg-content.markdown :deep(pre) {
  background: rgba(255, 255, 255, 0.06);
}

:root[data-theme='dark'] .msg-content.markdown :deep(p code) {
  background: rgba(255, 255, 255, 0.1);
}
</style>
