<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NSpin, NButton, NIcon, NInput, NSelect, NTag, NSwitch,
  NModal, NPopconfirm, useMessage,
} from 'naive-ui'
import {
  GitNetworkOutline, AddOutline, RefreshOutline, SearchOutline,
  CheckmarkCircle, KeyOutline, PencilOutline, TrashOutline,
  PowerOutline,
} from '@vicons/ionicons5'
import { useHermesChannelStore } from '@/stores/hermes/channel'
import type { HermesPlatform } from '@/api/hermes/types'

const message = useMessage()
const channelStore = useHermesChannelStore()

interface PlatformTypeMeta {
  value: string
  label: string
  fields: Array<{ key: string; label: string; secret?: boolean; placeholder?: string; hint?: string }>
}

const PLATFORM_TYPES: PlatformTypeMeta[] = [
  { value: 'telegram', label: 'Telegram', fields: [
    { key: 'token', label: 'Bot Token', secret: true, placeholder: '从 @BotFather 申请' },
  ]},
  { value: 'discord', label: 'Discord', fields: [
    { key: 'token', label: 'Bot Token', secret: true },
  ]},
  { value: 'slack', label: 'Slack', fields: [
    { key: 'token', label: 'Bot User OAuth Token', secret: true },
  ]},
  { value: 'whatsapp', label: 'WhatsApp', fields: [
    { key: 'apiKey', label: 'API Key', secret: true },
    { key: 'apiBase', label: 'API Base URL' },
  ]},
  { value: 'signal', label: 'Signal', fields: [
    { key: 'token', label: 'Token', secret: true },
  ]},
  { value: 'matrix', label: 'Matrix', fields: [
    { key: 'token', label: 'Access Token', secret: true },
    { key: 'apiBase', label: 'Homeserver URL', placeholder: 'https://matrix.example.com' },
  ]},
  { value: 'wecom', label: '企业微信', fields: [
    { key: 'corpId', label: 'Corp ID' },
    { key: 'agentId', label: 'Agent ID' },
    { key: 'secret', label: 'App Secret', secret: true },
  ]},
  { value: 'dingtalk', label: '钉钉', fields: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret', secret: true },
  ]},
  { value: 'feishu', label: '飞书', fields: [
    { key: 'appId', label: 'App ID' },
    { key: 'appSecret', label: 'App Secret', secret: true },
  ]},
  { value: 'wechat', label: '微信', fields: [
    { key: 'appId', label: 'App ID' },
    { key: 'appSecret', label: 'App Secret', secret: true },
  ]},
  { value: 'qq', label: 'QQ', fields: [
    { key: 'appId', label: 'App ID' },
    { key: 'clientSecret', label: 'Client Secret', secret: true },
  ]},
]

const TYPE_OPTIONS = PLATFORM_TYPES.map((t) => ({ label: t.label, value: t.value }))

function metaFor(type: string): PlatformTypeMeta {
  return PLATFORM_TYPES.find((p) => p.value === type) || PLATFORM_TYPES[0]
}

// ---- 搜索 ----
const searchQuery = ref('')

const filteredPlatforms = computed(() => {
  const list = channelStore.platforms
  const kw = searchQuery.value.trim().toLowerCase()
  if (!kw) return list
  return list.filter(
    (p) => p.name.toLowerCase().includes(kw) || p.type.toLowerCase().includes(kw),
  )
})

const stats = computed(() => {
  const all = channelStore.platforms
  return {
    total: all.length,
    configured: all.filter((p) => p.configured).length,
    enabled: all.filter((p) => p.enabled).length,
  }
})

// ---- Modal ----
const showModal = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const formData = ref<{
  id: string
  name: string
  type: string
  enabled: boolean
  fields: Record<string, string>
}>({
  id: '',
  name: '',
  type: 'telegram',
  enabled: true,
  fields: {},
})
const saving = ref(false)

const activeFields = computed(() => metaFor(formData.value.type).fields)

function resetForm() {
  formData.value = {
    id: '',
    name: '',
    type: 'telegram',
    enabled: true,
    fields: {},
  }
}

function openCreateModal() {
  modalMode.value = 'create'
  resetForm()
  showModal.value = true
}

// 给页面顶部 quick-start chip 用:点了直接以指定平台类型打开 modal,
// 省掉用户先开 modal 再选 type 一步。
function openCreateModalForType(type: string) {
  modalMode.value = 'create'
  resetForm()
  formData.value.type = type
  showModal.value = true
}

function openEditModal(platform: HermesPlatform) {
  modalMode.value = 'edit'
  const cfg = (platform.config || {}) as Record<string, unknown>
  const fields: Record<string, string> = {}
  for (const f of metaFor(platform.type).fields) {
    const v = cfg[f.key]
    fields[f.key] = typeof v === 'string' ? v : ''
  }
  formData.value = {
    id: platform.id,
    name: platform.name,
    type: platform.type,
    enabled: platform.enabled,
    fields,
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function handleSave() {
  const id = formData.value.id.trim().toLowerCase()
  if (!id) {
    message.error('请填写平台 ID')
    return
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    message.error('平台 ID 必须以小写字母开头,只能含小写字母 / 数字 / - / _')
    return
  }

  const config: Record<string, unknown> = {
    name: formData.value.name || id,
    type: formData.value.type,
    enabled: formData.value.enabled,
  }
  for (const [k, v] of Object.entries(formData.value.fields)) {
    if (v && v.trim()) config[k] = v.trim()
  }

  saving.value = true
  try {
    if (modalMode.value === 'create') {
      await channelStore.createPlatform(id, config)
      message.success('已添加平台')
    } else {
      await channelStore.updatePlatform(id, config)
      message.success('已更新平台')
    }
    closeModal()
  } catch (error) {
    message.error(
      modalMode.value === 'create'
        ? `添加失败: ${error instanceof Error ? error.message : String(error)}`
        : `更新失败: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    saving.value = false
  }
}

async function handleToggle(platformId: string, enabled: boolean) {
  try {
    await channelStore.updatePlatform(platformId, { enabled })
    message.success(enabled ? '已启用' : '已停用')
  } catch (error) {
    message.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function handleDelete(platformId: string) {
  try {
    await channelStore.deletePlatform(platformId)
    message.success('已删除')
  } catch (error) {
    message.error(`删除失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function refreshAll() {
  try {
    await channelStore.fetchPlatforms()
  } catch {
    // store 内部已经记录 lastError
  }
}

onMounted(() => {
  refreshAll()
})
</script>

<template>
  <div class="ling-channels">
    <header class="page-head">
      <div>
        <h1 class="page-title">通信渠道</h1>
        <p class="page-subtitle">把 Hermes Agent 接入聊天平台。配置 Token 后,Agent 即可在该平台收发消息。</p>
      </div>
      <div class="head-actions">
        <NButton :loading="channelStore.loading" @click="refreshAll">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
        <NButton type="primary" @click="openCreateModal">
          <template #icon><NIcon><AddOutline /></NIcon></template>
          添加平台
        </NButton>
      </div>
    </header>

    <!-- Win 上 Hermes 唯一对话方式就是这些渠道,鼓励 user 配置 -->
    <section class="hermes-channels-intro">
      <div class="intro-icon">📨</div>
      <div class="intro-body">
        <h3 class="intro-title">这是 Hermes Agent 在 Windows 上的对话方式</h3>
        <p class="intro-desc">
          Hermes 不再提供直接对话页。配好下方任一渠道(Token 加密存本地),
          就能在对应平台 <strong>@Hermes Agent</strong> 跟它聊。
        </p>
        <div class="intro-quick">
          <span class="intro-quick-label">快速选一个开始:</span>
          <button class="intro-chip" @click="openCreateModalForType('telegram')">
            🌍 Telegram
          </button>
          <button class="intro-chip" @click="openCreateModalForType('wechat')">
            💬 微信
          </button>
          <button class="intro-chip" @click="openCreateModalForType('discord')">
            🎮 Discord
          </button>
          <button class="intro-chip" @click="openCreateModalForType('slack')">
            🏢 Slack
          </button>
          <button class="intro-chip" @click="openCreateModalForType('qq')">
            💚 QQ
          </button>
          <button class="intro-chip" @click="openCreateModalForType('feishu')">
            🐦 飞书
          </button>
        </div>
      </div>
    </section>

    <NSpin :show="channelStore.loading">
      <!-- 统计 + 搜索 -->
      <section class="toolbar">
        <NInput
          v-model:value="searchQuery"
          clearable
          placeholder="搜索平台名称或类型"
          size="medium"
          class="search-input"
        >
          <template #prefix><NIcon><SearchOutline /></NIcon></template>
        </NInput>
        <span class="stats-meta">
          {{ stats.total }} 个平台 · {{ stats.configured }} 已配置 · {{ stats.enabled }} 启用中
        </span>
      </section>

      <!-- 错误提示 -->
      <div v-if="channelStore.lastError" class="error-bar">
        加载失败: {{ channelStore.lastError }}
      </div>

      <!-- 平台卡片网格 -->
      <section class="provider-section">
        <div v-if="filteredPlatforms.length === 0 && !channelStore.loading" class="empty">
          <NIcon size="32"><GitNetworkOutline /></NIcon>
          <div class="empty-title">{{ channelStore.platforms.length === 0 ? '还没有平台' : '没有匹配的平台' }}</div>
          <div class="empty-hint">{{ channelStore.platforms.length === 0 ? '点击右上角"添加平台"接入第一个聊天渠道' : '试试别的关键词' }}</div>
        </div>

        <div v-else class="provider-grid">
          <div
            v-for="p in filteredPlatforms"
            :key="p.id"
            class="provider-card"
            :class="{ 'is-configured': p.configured, 'is-enabled': p.enabled }"
          >
            <div class="provider-head">
              <div class="provider-name-wrap">
                <span class="provider-name">{{ p.name }}</span>
                <NTag size="small" :bordered="false" type="info">{{ p.type }}</NTag>
              </div>
              <span v-if="p.configured" class="check-badge">
                <NIcon size="14"><CheckmarkCircle /></NIcon>
                已配置
              </span>
            </div>

            <div class="provider-meta">
              <span class="provider-id">ID: {{ p.id }}</span>
            </div>

            <div class="provider-toggle">
              <span class="toggle-label">
                <NIcon size="14"><PowerOutline /></NIcon>
                {{ p.enabled ? '启用中' : '已停用' }}
              </span>
              <NSwitch
                :value="p.enabled"
                size="small"
                @update:value="(v: boolean) => handleToggle(p.id, v)"
              />
            </div>

            <div class="provider-actions">
              <NButton size="small" @click="openEditModal(p)">
                <template #icon><NIcon><PencilOutline /></NIcon></template>
                配置
              </NButton>
              <NPopconfirm
                @positive-click="handleDelete(p.id)"
                positive-text="删除"
                negative-text="取消"
              >
                <template #trigger>
                  <NButton size="small" tertiary>
                    <template #icon><NIcon><TrashOutline /></NIcon></template>
                  </NButton>
                </template>
                确定删除平台 {{ p.name }}?
              </NPopconfirm>
            </div>
          </div>
        </div>
      </section>
    </NSpin>

    <!-- 配置弹窗 -->
    <NModal
      :show="showModal"
      preset="card"
      :title="modalMode === 'create' ? '添加平台' : `配置 ${formData.name || formData.id}`"
      :style="{ maxWidth: '480px' }"
      @update:show="(v: boolean) => !v && closeModal()"
    >
      <div class="editor">
        <div class="editor-row">
          <div class="editor-field">
            <label class="editor-label">平台 ID</label>
            <NInput
              v-model:value="formData.id"
              placeholder="my-telegram"
              size="medium"
              :disabled="modalMode === 'edit'"
            />
            <div class="editor-hint">小写字母开头,小写字母 / 数字 / - / _</div>
          </div>
          <div class="editor-field">
            <label class="editor-label">显示名称</label>
            <NInput
              v-model:value="formData.name"
              placeholder="留空则用 ID"
              size="medium"
            />
          </div>
        </div>

        <div class="editor-field">
          <label class="editor-label">平台类型</label>
          <NSelect
            v-model:value="formData.type"
            :options="TYPE_OPTIONS"
            size="medium"
            :disabled="modalMode === 'edit'"
          />
        </div>

        <div
          v-for="f in activeFields"
          :key="f.key"
          class="editor-field"
        >
          <label class="editor-label">
            <NIcon v-if="f.secret" size="14"><KeyOutline /></NIcon>
            {{ f.label }}
          </label>
          <NInput
            v-model:value="formData.fields[f.key]"
            :type="f.secret ? 'password' : 'text'"
            :show-password-on="f.secret ? 'click' : undefined"
            :placeholder="f.placeholder || ''"
            size="medium"
          />
          <div v-if="f.hint" class="editor-hint">{{ f.hint }}</div>
        </div>

        <div class="editor-field editor-toggle">
          <label class="editor-label">启用</label>
          <NSwitch v-model:value="formData.enabled" />
        </div>

        <div class="editor-actions">
          <NButton @click="closeModal">取消</NButton>
          <NButton type="primary" :loading="saving" @click="handleSave">保存</NButton>
        </div>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.ling-channels {
  max-width: 880px;
  margin: 0 auto;
  padding: 16px 8px 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

/* 引导 banner */
.hermes-channels-intro {
  display: flex;
  gap: 16px;
  padding: 18px 20px;
  margin-bottom: 20px;
  background: linear-gradient(135deg, rgba(32, 128, 240, 0.06), rgba(70, 174, 232, 0.03));
  border: 1px solid rgba(32, 128, 240, 0.18);
  border-radius: 10px;
}

.intro-icon {
  font-size: 32px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}

.intro-body {
  flex: 1;
  min-width: 0;
}

.intro-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--n-text-color);
  letter-spacing: -0.1px;
}

.intro-desc {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--n-text-color-2, #555);
}

.intro-desc strong {
  color: var(--n-primary-color, #2080f0);
  font-weight: 500;
}

.intro-quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.intro-quick-label {
  font-size: 12px;
  color: var(--n-text-color-3, #888);
  margin-right: 4px;
}

.intro-chip {
  padding: 5px 10px;
  font-size: 12px;
  border: 1px solid var(--n-border-color, rgba(0, 0, 0, 0.1));
  border-radius: 14px;
  background: var(--n-card-color, #fff);
  color: var(--n-text-color);
  cursor: pointer;
  transition: all 0.15s ease;
}

.intro-chip:hover {
  border-color: var(--n-primary-color, #2080f0);
  color: var(--n-primary-color, #2080f0);
  background: rgba(32, 128, 240, 0.04);
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
  gap: 12px;
  margin-bottom: 14px;
  padding: 0 4px;
}

.search-input { flex: 1; max-width: 320px; }

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

.provider-section { margin-top: 4px; }

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.provider-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  padding: 14px;
  transition: border-color 0.15s ease, background 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.provider-card.is-configured {
  border-color: rgba(0, 122, 255, 0.35);
  background: rgba(0, 122, 255, 0.02);
}

.provider-card.is-configured.is-enabled {
  border-color: rgba(52, 199, 89, 0.4);
  background: rgba(52, 199, 89, 0.03);
}

:root[data-theme='dark'] .provider-card.is-configured {
  border-color: rgba(10, 132, 255, 0.4);
  background: rgba(10, 132, 255, 0.06);
}

:root[data-theme='dark'] .provider-card.is-configured.is-enabled {
  border-color: rgba(48, 209, 88, 0.4);
  background: rgba(48, 209, 88, 0.06);
}

.provider-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.provider-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.provider-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check-badge {
  font-size: 11px;
  color: #007AFF;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

:root[data-theme='dark'] .check-badge { color: #0A84FF; }

.provider-meta {
  font-size: 12px;
  color: var(--n-text-color-3);
  font-variant-numeric: tabular-nums;
}

.provider-id {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

.provider-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--n-action-color);
}

.toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--n-text-color-2);
}

.provider-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
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

.editor-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.editor-field { margin-bottom: 14px; }

.editor-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color-2);
  margin-bottom: 6px;
}

.editor-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin-top: 4px;
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
