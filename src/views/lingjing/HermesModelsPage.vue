<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NSpin, NButton, NIcon, NInput, NSelect, NEmpty, NPopconfirm,
  NModal, NTag, useMessage,
} from 'naive-ui'
import {
  SparklesOutline, AddOutline, CheckmarkCircle, OpenOutline,
  KeyOutline, RefreshOutline, TrashOutline, PencilOutline,
  CloudDoneOutline, FlashOutline,
} from '@vicons/ionicons5'
import { useHermesModelStore } from '@/stores/hermes/model'
import { useHermesConfigStore } from '@/stores/hermes/config'
import { useHermesConnectionStore } from '@/stores/hermes/connection'
import { useAuthStore } from '@/stores/auth'
import { HERMES_PROVIDERS } from '@/api/hermes/types'
import {
  listPlaygroundModels,
  type PlaygroundModelInfo,
} from '@/api/lingjing/chat'

const message = useMessage()
const modelStore = useHermesModelStore()
const configStore = useHermesConfigStore()
const connStore = useHermesConnectionStore()
const authStore = useAuthStore()

const loading = ref(false)
const switching = ref(false)
const editing = ref<{
  providerId: string
  providerName: string
  envKey: string
  baseUrlKey?: string
  defaultBaseUrl?: string
  docsUrl?: string
  apiKey: string
  baseUrl: string
} | null>(null)
const saving = ref(false)

// ==== 灵境 AI 接入状态 ====
const lingjingModels = ref<PlaygroundModelInfo[]>([])
const lingjingModelsLoading = ref(false)
const reconnecting = ref(false)

// hermes /api/env 不暴露 OPENROUTER_BASE_URL(hermes envSchema 没列),
// 所以无法直接读 .env 来判断 base_url 是不是灵境。改用组合判断:
//   1) 灵境用户已登录(authStore.user 不空)
//   2) hermes OPENROUTER_API_KEY 已设置
//   3) sessionStorage 里 auth.ts 配完后留的成功标记
// 三者满足即认为"灵境已接入 hermes"。
const lingjingTokenSet = computed(() => {
  const v = modelStore.rawEnvVars.OPENROUTER_API_KEY as { is_set?: boolean } | undefined
  return !!v?.is_set
})

const lingjingConnected = computed(() => {
  if (!authStore.user) return false
  if (!lingjingTokenSet.value) return false
  // auth.ts 配置成功会写这个标记
  try {
    return sessionStorage.getItem('lingjing_providers_configured') === 'ok'
  } catch {
    return false
  }
})

const lingjingUserName = computed(() => authStore.user?.username || authStore.user?.display_name || '')

async function loadLingjingModels() {
  if (!authStore.user) return
  lingjingModelsLoading.value = true
  try {
    lingjingModels.value = await listPlaygroundModels()
  } catch (err) {
    console.warn('[hermes-models] listPlaygroundModels failed:', err)
    lingjingModels.value = []
  } finally {
    lingjingModelsLoading.value = false
  }
}

async function handleReconnectLingjing() {
  reconnecting.value = true
  try {
    if (!(window as any).lingjing?.configureLocalProviders) {
      message.error('Electron bridge 不可用,请重启应用')
      return
    }
    const result = await authStore.reconfigureProviders()
    if (result?.hermes === 'ok' || result?.hermes === 'skipped') {
      message.success('已重新接入灵境 AI')
      await modelStore.fetchEnvVars()
      await configStore.fetchConfig().catch(() => {})
    } else {
      message.error('接入失败,请检查灵境登录状态')
    }
  } catch (err: any) {
    message.error(err?.message || '接入失败')
  } finally {
    reconnecting.value = false
  }
}

async function handleSwitchToLingjingModel(model: PlaygroundModelInfo) {
  switching.value = true
  try {
    // 主动 PUT 完整 model 块,确保 base_url 也是灵境的(避免之前被改成 openrouter.ai
    // 这种情况;hermes 实际读的是 config.yaml 里 model.base_url,不是 env)。
    const lingjingBase =
      (import.meta.env.VITE_LINGJING_OPENAI_BASE as string) || 'https://api.aitoken.homes/v1'
    const resp = await fetch('/api/hermes/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          model: {
            default: model.id,
            provider: 'auto',
            base_url: lingjingBase,
          },
        },
      }),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`PUT /api/hermes/config -> ${resp.status}: ${text}`)
    }
    await configStore.fetchConfig()
    message.success(`已切换到 ${model.name || model.id}`)
  } catch (err: any) {
    message.error(err?.message || '切换失败')
  } finally {
    switching.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    if (!connStore.connected) {
      await connStore.connect().catch(() => {})
    }
    await Promise.all([
      configStore.fetchConfig().catch(() => {}),
      modelStore.fetchModels().catch(() => {}),
      modelStore.fetchEnvVars().catch(() => {}),
      loadLingjingModels(),
    ])
    modelStore.syncCurrentModelSelectionFromConfig()
  } finally {
    loading.value = false
  }
})

const currentModelId = computed(() => {
  const cfg = configStore.config as any
  if (!cfg) return ''
  return typeof cfg.model === 'string' ? cfg.model : cfg.model?.default || ''
})

const currentProvider = computed(() => {
  const cfg = configStore.config as any
  return cfg?.provider || cfg?.modelProvider || ''
})

const modelOptions = computed(() => {
  return modelStore.allSelectableModels.map((m) => ({
    label: `${m.modelId} · ${m.providerName}`,
    value: `${m.providerName}::${m.modelId}::${m.baseUrl || ''}`,
  }))
})

const selectedKey = ref('')

async function handleSwitchModel(key: string) {
  if (!key) return
  const [providerName, modelId, baseUrl] = key.split('::')
  if (!modelId) return
  switching.value = true
  try {
    await modelStore.setCurrentModel(modelId, {
      provider: providerName,
      baseUrl: baseUrl || undefined,
    })
    await configStore.fetchConfig()
    message.success(`已切换到 ${modelId}`)
  } catch (err: any) {
    message.error(err?.message || '切换失败')
  } finally {
    switching.value = false
  }
}

interface ProviderCard {
  id: string
  name: string
  envKey: string
  baseUrlKey?: string
  defaultBaseUrl?: string
  docsUrl?: string
  recommended?: boolean
  configured: boolean
  modelCount: number
  description?: string
}

const providerCards = computed<ProviderCard[]>(() => {
  return HERMES_PROVIDERS.map((p) => {
    const rawVar = modelStore.rawEnvVars[p.envKey] as { is_set?: boolean } | undefined
    const envVar = modelStore.envVars.find((v) => v.key === p.envKey)
    const configured = !!(envVar?.value || rawVar?.is_set)
    const modelCount = modelStore.models.filter(
      (m) => m.provider === p.id || m.provider === p.name,
    ).length
    return {
      id: p.id,
      name: p.name,
      envKey: p.envKey,
      baseUrlKey: p.baseUrlKey,
      defaultBaseUrl: p.defaultBaseUrl,
      docsUrl: p.docsUrl,
      recommended: p.recommended,
      configured,
      modelCount,
      description: p.description,
    }
  })
})

const configuredCount = computed(() => providerCards.value.filter((p) => p.configured).length)

function openEditor(card: ProviderCard) {
  const baseUrlVar = card.baseUrlKey
    ? (modelStore.rawEnvVars[card.baseUrlKey] as { value?: string } | undefined)
    : undefined
  editing.value = {
    providerId: card.id,
    providerName: card.name,
    envKey: card.envKey,
    baseUrlKey: card.baseUrlKey,
    defaultBaseUrl: card.defaultBaseUrl,
    docsUrl: card.docsUrl,
    apiKey: '',
    baseUrl: (baseUrlVar?.value as string) || card.defaultBaseUrl || '',
  }
}

function closeEditor() {
  editing.value = null
}

async function handleSave() {
  if (!editing.value) return
  const e = editing.value
  if (!e.apiKey.trim()) {
    message.warning('请填写 API Key')
    return
  }
  saving.value = true
  try {
    await modelStore.setEnvVar(e.envKey, e.apiKey.trim())
    if (e.baseUrlKey && e.baseUrl.trim() && e.baseUrl !== e.defaultBaseUrl) {
      await modelStore.setEnvVar(e.baseUrlKey, e.baseUrl.trim())
    }
    message.success(`${e.providerName} 已配置`)
    closeEditor()
    await modelStore.fetchEnvVars()
    await modelStore.fetchModels().catch(() => {})
  } catch (err: any) {
    message.error(err?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleRemove(card: ProviderCard) {
  try {
    await modelStore.deleteEnvVar(card.envKey)
    if (card.baseUrlKey) {
      await modelStore.deleteEnvVar(card.baseUrlKey).catch(() => {})
    }
    message.success(`${card.name} 已移除`)
    await modelStore.fetchModels().catch(() => {})
  } catch (err: any) {
    message.error(err?.message || '移除失败')
  }
}

async function refreshAll() {
  loading.value = true
  try {
    await Promise.all([
      configStore.fetchConfig().catch(() => {}),
      modelStore.fetchModels().catch(() => {}),
      modelStore.fetchEnvVars().catch(() => {}),
      loadLingjingModels(),
    ])
    message.success('已刷新')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="ling-models">
    <header class="page-head">
      <div>
        <h1 class="page-title">模型管理</h1>
        <p class="page-subtitle">为 Hermes Agent 配置大模型 Provider,选择当前对话使用的模型。</p>
      </div>
      <NButton :loading="loading" @click="refreshAll">
        <template #icon><NIcon><RefreshOutline /></NIcon></template>
        刷新
      </NButton>
    </header>

    <NSpin :show="loading">
      <!-- 灵境 AI 接入状态 -->
      <section
        v-if="authStore.user"
        class="lingjing-card"
        :class="{ 'is-connected': lingjingConnected && lingjingTokenSet }"
      >
        <div class="lingjing-head">
          <div class="lingjing-icon">
            <NIcon size="22"><CloudDoneOutline /></NIcon>
          </div>
          <div class="lingjing-meta">
            <div class="lingjing-title">
              灵境 AI
              <NTag
                v-if="lingjingConnected && lingjingTokenSet"
                size="small"
                :bordered="false"
                type="success"
              >
                已接入
              </NTag>
              <NTag
                v-else
                size="small"
                :bordered="false"
                type="warning"
              >
                未接入
              </NTag>
            </div>
            <div class="lingjing-sub">
              <template v-if="lingjingConnected && lingjingTokenSet">
                Hermes 已通过你的灵境账号({{ lingjingUserName || '当前用户' }})接入云端模型 — OpenClaw / Hermes 共用同一份 API Key。
              </template>
              <template v-else>
                登录灵境后会自动把云端 sk- token 写入 Hermes(OpenRouter slot)。当前未检测到接入,可手动重新接入。
              </template>
            </div>
          </div>
          <NButton
            v-if="!lingjingConnected || !lingjingTokenSet"
            size="small"
            type="primary"
            :loading="reconnecting"
            @click="handleReconnectLingjing"
          >
            <template #icon><NIcon><FlashOutline /></NIcon></template>
            重新接入
          </NButton>
        </div>

        <div v-if="lingjingConnected && lingjingTokenSet && lingjingModels.length > 0" class="lingjing-models">
          <div class="lingjing-models-head">
            <span class="lingjing-models-label">灵境云端模型 · {{ lingjingModels.length }} 个可用</span>
            <span class="lingjing-models-hint">点击卡片切到该模型</span>
          </div>
          <div class="lingjing-grid">
            <button
              v-for="m in lingjingModels"
              :key="m.id"
              type="button"
              class="lingjing-model-card"
              :class="{
                'is-current': currentModelId === m.id,
                'is-featured': m.featured,
              }"
              :disabled="switching"
              @click="handleSwitchToLingjingModel(m)"
            >
              <div class="model-name-wrap">
                <span class="model-name">{{ m.name || m.id }}</span>
                <NTag v-if="m.featured" size="small" :bordered="false" type="info">推荐</NTag>
              </div>
              <div v-if="m.provider" class="model-provider">{{ m.provider }}</div>
              <div v-if="m.description" class="model-desc">{{ m.description }}</div>
              <div class="model-meta">
                <span v-if="m.context_window">上下文 {{ m.context_window }}</span>
                <span v-else-if="m.input_price">输入 ${{ m.input_price }}</span>
              </div>
              <span v-if="currentModelId === m.id" class="model-current-badge">
                <NIcon size="12"><CheckmarkCircle /></NIcon>
                当前
              </span>
            </button>
          </div>
        </div>

        <div v-else-if="lingjingConnected && lingjingTokenSet && lingjingModelsLoading" class="lingjing-loading">
          加载灵境模型中…
        </div>

        <div v-else-if="lingjingConnected && lingjingTokenSet" class="lingjing-loading">
          灵境云端没有返回模型列表(或当前账号余额为 0)
        </div>
      </section>

      <!-- 当前模型 -->
      <section class="card current-card">
        <div class="current-head">
          <div class="current-icon">
            <NIcon size="20"><SparklesOutline /></NIcon>
          </div>
          <div class="current-meta">
            <div class="current-label">当前使用</div>
            <div v-if="currentModelId" class="current-value">
              {{ currentModelId }}
              <span v-if="currentProvider" class="current-provider">{{ currentProvider }}</span>
            </div>
            <div v-else class="current-empty">尚未选择模型 · 先在下方配置一个 Provider</div>
          </div>
        </div>
        <div v-if="modelOptions.length > 0" class="current-switch">
          <NSelect
            v-model:value="selectedKey"
            :options="modelOptions"
            placeholder="切换到其他模型"
            size="medium"
            filterable
            class="model-select"
          />
          <NButton
            type="primary"
            size="medium"
            :disabled="!selectedKey"
            :loading="switching"
            @click="handleSwitchModel(selectedKey)"
          >
            切换
          </NButton>
        </div>
      </section>

      <!-- Provider 列表 -->
      <section class="provider-section">
        <div class="section-head">
          <h2 class="section-title">API Provider</h2>
          <span class="section-meta">{{ configuredCount }} / {{ providerCards.length }} 已配置</span>
        </div>

        <div class="provider-grid">
          <div
            v-for="p in providerCards"
            :key="p.id"
            class="provider-card"
            :class="{ 'is-configured': p.configured }"
          >
            <div class="provider-head">
              <div class="provider-name-wrap">
                <span class="provider-name">{{ p.name }}</span>
                <NTag v-if="p.recommended" size="small" :bordered="false" type="info">推荐</NTag>
              </div>
              <span v-if="p.configured" class="check-badge">
                <NIcon size="14"><CheckmarkCircle /></NIcon>
                已配置
              </span>
            </div>

            <div v-if="p.description" class="provider-desc">{{ p.description }}</div>

            <div class="provider-meta">
              <span v-if="p.configured && p.modelCount > 0">{{ p.modelCount }} 个模型</span>
              <span v-else-if="p.configured">已连接</span>
              <span v-else>未配置 API Key</span>
            </div>

            <div class="provider-actions">
              <NButton size="small" @click="openEditor(p)">
                <template #icon><NIcon><PencilOutline /></NIcon></template>
                {{ p.configured ? '修改' : '配置' }}
              </NButton>
              <NButton
                v-if="p.docsUrl"
                size="small"
                tag="a"
                :href="p.docsUrl"
                target="_blank"
                tertiary
              >
                <template #icon><NIcon><OpenOutline /></NIcon></template>
                获取 Key
              </NButton>
              <NPopconfirm
                v-if="p.configured"
                @positive-click="handleRemove(p)"
                positive-text="删除"
                negative-text="取消"
              >
                <template #trigger>
                  <NButton size="small" tertiary>
                    <template #icon><NIcon><TrashOutline /></NIcon></template>
                  </NButton>
                </template>
                确定移除 {{ p.name }} 的配置?
              </NPopconfirm>
            </div>
          </div>
        </div>
      </section>
    </NSpin>

    <!-- 配置弹窗 -->
    <NModal
      :show="!!editing"
      preset="card"
      :title="editing ? `配置 ${editing.providerName}` : ''"
      :style="{ maxWidth: '480px' }"
      @update:show="(v: boolean) => !v && closeEditor()"
    >
      <div v-if="editing" class="editor">
        <div class="editor-field">
          <label class="editor-label">
            <NIcon size="14"><KeyOutline /></NIcon>
            API Key
          </label>
          <NInput
            v-model:value="editing.apiKey"
            type="password"
            show-password-on="click"
            placeholder="sk-..."
            size="medium"
          />
          <div v-if="editing.docsUrl" class="editor-hint">
            没有 Key?
            <a :href="editing.docsUrl" target="_blank" class="editor-link">点这里申请</a>
          </div>
        </div>

        <div v-if="editing.baseUrlKey" class="editor-field">
          <label class="editor-label">Base URL <span class="optional">(可选)</span></label>
          <NInput
            v-model:value="editing.baseUrl"
            :placeholder="editing.defaultBaseUrl || ''"
            size="medium"
          />
          <div class="editor-hint">留空则使用默认地址</div>
        </div>

        <div class="editor-actions">
          <NButton @click="closeEditor">取消</NButton>
          <NButton type="primary" :loading="saving" @click="handleSave">保存</NButton>
        </div>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.ling-models {
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

.card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
}

.current-card {
  padding: 18px 20px;
  margin-bottom: 28px;
}

/* === 灵境 AI 接入状态 === */
.lingjing-card {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.04), rgba(52, 199, 89, 0.04));
  border: 1px solid var(--n-border-color);
  border-radius: 14px;
  padding: 18px 20px;
  margin-bottom: 16px;
}

.lingjing-card.is-connected {
  border-color: rgba(52, 199, 89, 0.4);
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.06), rgba(0, 122, 255, 0.04));
}

:root[data-theme='dark'] .lingjing-card {
  background: linear-gradient(135deg, rgba(10, 132, 255, 0.08), rgba(48, 209, 88, 0.06));
}

:root[data-theme='dark'] .lingjing-card.is-connected {
  border-color: rgba(48, 209, 88, 0.45);
}

.lingjing-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.lingjing-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(52, 199, 89, 0.15);
  color: #34C759;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

:root[data-theme='dark'] .lingjing-icon {
  background: rgba(48, 209, 88, 0.18);
  color: #30D158;
}

.lingjing-meta { flex: 1; min-width: 0; }

.lingjing-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--n-text-color);
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.lingjing-sub {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  line-height: 1.5;
  max-width: 600px;
}

.lingjing-models {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--n-border-color);
}

.lingjing-models-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.lingjing-models-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color-2);
}

.lingjing-models-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.lingjing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.lingjing-model-card {
  text-align: left;
  font: inherit;
  position: relative;
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lingjing-model-card:hover:not(:disabled) {
  border-color: rgba(0, 122, 255, 0.45);
  background: rgba(0, 122, 255, 0.03);
}

.lingjing-model-card:disabled {
  cursor: wait;
  opacity: 0.6;
}

.lingjing-model-card.is-current {
  border-color: #34C759;
  background: rgba(52, 199, 89, 0.06);
}

:root[data-theme='dark'] .lingjing-model-card.is-current {
  border-color: #30D158;
  background: rgba(48, 209, 88, 0.1);
}

.lingjing-model-card.is-featured {
  border-color: rgba(0, 122, 255, 0.35);
}

.model-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.model-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

.model-provider {
  font-size: 11.5px;
  color: var(--n-text-color-3);
}

.model-desc {
  font-size: 11.5px;
  color: var(--n-text-color-3);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.model-meta {
  font-size: 11px;
  color: var(--n-text-color-3);
  font-variant-numeric: tabular-nums;
}

.model-current-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10.5px;
  color: #34C759;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

:root[data-theme='dark'] .model-current-badge { color: #30D158; }

.lingjing-loading {
  margin-top: 14px;
  padding: 12px 0;
  font-size: 12.5px;
  color: var(--n-text-color-3);
  text-align: center;
}

.current-head {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 14px;
}

.current-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--n-action-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--n-text-color-2);
  flex-shrink: 0;
}

.current-meta { flex: 1; min-width: 0; }

.current-label {
  font-size: 11.5px;
  letter-spacing: 0.06em;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.current-value {
  font-size: 17px;
  font-weight: 500;
  color: var(--n-text-color);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.current-provider {
  font-size: 12px;
  font-weight: 400;
  color: var(--n-text-color-3);
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--n-action-color);
}

.current-empty {
  font-size: 14px;
  color: var(--n-text-color-disabled);
}

.current-switch {
  display: flex;
  gap: 8px;
}

.model-select { flex: 1; }

.provider-section { margin-top: 8px; }

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0 4px;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
  margin: 0;
}

.section-meta {
  font-size: 12px;
  color: var(--n-text-color-3);
  font-variant-numeric: tabular-nums;
}

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
  transition: border-color 0.15s ease;
}

.provider-card.is-configured {
  border-color: rgba(0, 122, 255, 0.35);
  background: rgba(0, 122, 255, 0.02);
}

:root[data-theme='dark'] .provider-card.is-configured {
  border-color: rgba(10, 132, 255, 0.4);
  background: rgba(10, 132, 255, 0.06);
}

.provider-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
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

.provider-desc {
  font-size: 12px;
  color: var(--n-text-color-3);
  line-height: 1.45;
  margin-bottom: 6px;
}

.provider-meta {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin-bottom: 12px;
  font-variant-numeric: tabular-nums;
}

.provider-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.editor { padding: 4px 0 0; }

.editor-field {
  margin-bottom: 16px;
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

.editor-link {
  color: #007AFF;
  text-decoration: none;
}

.editor-link:hover { text-decoration: underline; }

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
</style>
