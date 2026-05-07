<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NSelect, NButton, NSpin, NTag, NTabs, NTabPane, NIcon, NEmpty,
  NModal, NInput, NSpace, useMessage, useDialog,
} from 'naive-ui'
import {
  AddOutline, TrashOutline, CreateOutline, CheckmarkCircle,
  CloudOutline, KeyOutline,
} from '@vicons/ionicons5'
import { listPlaygroundModels, type PlaygroundModelInfo } from '@/api/lingjing/chat'
import { useAuthStore } from '@/stores/auth'

interface CustomModel {
  id: string                  // 内部 id,作为 openclaw provider-id
  name: string                // 用户起的名字
  baseUrl: string             // OpenAI 兼容 base url
  modelId: string             // 模型标识(provider 内部用)
  compat: 'openai' | 'anthropic'
  encryptedKey: string | null // safeStorage 加密后的 base64
  plainKey?: string           // 加密不可用时的明文兜底(标 _UNENCRYPTED_)
}

const STORAGE_KEY = 'lingjing_custom_models'
const ACTIVE_PROVIDER_KEY = 'lingjing_active_provider' // 'lingjing' | custom id

const message = useMessage()
const dialog = useDialog()
const authStore = useAuthStore()

const tabValue = ref<'cloud' | 'custom'>('cloud')

// ============ 云端模型(原逻辑) ============
const models = ref<PlaygroundModelInfo[]>([])
const cloudLoading = ref(false)
const applying = ref(false)
const selectedModelId = ref<string>('')
const lastError = ref<string>('')

// 真正的"当前生效"应当反映 OpenClaw daemon 实际跑的模型。
// 优先级:用户最近一次「应用」记到 localStorage 的 → authStore(预留接口) → ''(未知)。
// 永不 hardcode 字符串(之前写 'gpt-5.4' 导致 UI 永远显示 GPT-5.4 即使 daemon
// 在用 deepseek-chat / 别的模型,跟实际不一致欺骗用户)。
const activeModelId = ref<string>(
  localStorage.getItem('lingjing_selected_model') ||
    (authStore as any).getSelectedModel?.() ||
    '',
)
const activeProvider = ref<string>(localStorage.getItem(ACTIVE_PROVIDER_KEY) || 'lingjing')

const selectedModel = computed(() =>
  models.value.find((m) => m.id === selectedModelId.value) || null,
)

const isCurrentlyActive = computed(
  () =>
    activeProvider.value === 'lingjing' &&
    !!activeModelId.value &&
    selectedModelId.value === activeModelId.value,
)

const modelOptions = computed(() =>
  models.value.map((m) => ({ label: m.name || m.id, value: m.id })),
)

async function loadCloudModels() {
  cloudLoading.value = true
  lastError.value = ''
  try {
    const list = await listPlaygroundModels()
    models.value = list
    if (list.length === 0) {
      lastError.value = '账号下没有可用模型,请联系灵镜管理员开通'
      return
    }
    const current = list.find((m) => m.id === activeModelId.value)
    selectedModelId.value =
      current?.id || list.find((m) => m.featured)?.id || list[0].id
  } catch (err: any) {
    lastError.value = err?.message || '加载模型失败,请检查网络或重新登录'
    message.error(lastError.value)
  } finally {
    cloudLoading.value = false
  }
}

async function applyCloud() {
  if (!selectedModelId.value || isCurrentlyActive.value) return
  applying.value = true
  try {
    const bridge = (window as any).lingjing
    if (!bridge?.autoConfigureViaMain) {
      message.error('Electron 桥接未注入,请重启应用')
      return
    }
    const result = await bridge.autoConfigureViaMain({ modelId: selectedModelId.value })
    if (result?.openclaw === 'ok') {
      try {
        localStorage.setItem('lingjing_selected_model', selectedModelId.value)
        localStorage.setItem(ACTIVE_PROVIDER_KEY, 'lingjing')
        activeProvider.value = 'lingjing'
        // 关键:同步更新 activeModelId,让 UI「当前生效」标签立即跟随
        // (computed 不会自动监听 localStorage 变化)
        activeModelId.value = selectedModelId.value
      } catch {
        // ignore
      }
      message.success(`已切换到 ${selectedModel.value?.name || selectedModelId.value}`)
    } else {
      message.error(result?.openclawMessage || result?.message || '切换失败')
    }
  } catch (err: any) {
    message.error(err?.message || '切换失败')
  } finally {
    applying.value = false
  }
}

function formatPrice(value?: number) {
  if (value == null) return '—'
  return `$${value.toFixed(2)} / 1M tokens`
}

// ============ 自定义模型 ============
const customModels = ref<CustomModel[]>([])
const showModal = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingId = ref<string | null>(null)
const formName = ref('')
const formBaseUrl = ref('')
const formModelId = ref('')
const formApiKey = ref('')
const formCompat = ref<'openai' | 'anthropic'>('openai')
const formApplyingId = ref<string | null>(null)
const formSubmitting = ref(false)

const COMPAT_OPTIONS = [
  { label: 'OpenAI 兼容(大多数)', value: 'openai' },
  { label: 'Anthropic 原生协议', value: 'anthropic' },
]

const PRESETS = [
  { name: 'OpenAI 官方', baseUrl: 'https://api.openai.com/v1', modelId: 'gpt-4o-mini', compat: 'openai' as const },
  { name: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com', modelId: 'claude-3-5-sonnet-20241022', compat: 'anthropic' as const },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', modelId: 'deepseek-chat', compat: 'openai' as const },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', modelId: 'anthropic/claude-3.5-sonnet', compat: 'openai' as const },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', modelId: 'glm-4-plus', compat: 'openai' as const },
  { name: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', modelId: 'moonshot-v1-32k', compat: 'openai' as const },
]

function loadCustomModels() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      customModels.value = []
      return
    }
    customModels.value = JSON.parse(raw) as CustomModel[]
  } catch {
    customModels.value = []
  }
}

function saveCustomModels() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customModels.value))
  } catch {
    // ignore
  }
}

function decryptKey(model: CustomModel): string {
  if (model.plainKey) return model.plainKey
  if (!model.encryptedKey) return ''
  const bridge = (window as any).lingjing
  try {
    return bridge?.safeStorage?.decrypt?.(model.encryptedKey) || ''
  } catch {
    return ''
  }
}

function encryptKey(plain: string): { encryptedKey: string | null; plainKey?: string } {
  const bridge = (window as any).lingjing
  if (bridge?.safeStorage?.isAvailable?.()) {
    const enc = bridge.safeStorage.encrypt(plain)
    if (enc) return { encryptedKey: enc }
  }
  // 降级:加密不可用时存明文(给 dev/Linux 上没 keychain 的环境兜底)
  return { encryptedKey: null, plainKey: plain }
}

function openCreate(preset?: typeof PRESETS[0]) {
  modalMode.value = 'create'
  editingId.value = null
  formName.value = preset?.name || ''
  formBaseUrl.value = preset?.baseUrl || ''
  formModelId.value = preset?.modelId || ''
  formApiKey.value = ''
  formCompat.value = preset?.compat || 'openai'
  showModal.value = true
}

function openEdit(model: CustomModel) {
  modalMode.value = 'edit'
  editingId.value = model.id
  formName.value = model.name
  formBaseUrl.value = model.baseUrl
  formModelId.value = model.modelId
  formApiKey.value = decryptKey(model)
  formCompat.value = model.compat
  showModal.value = true
}

async function handleSubmit() {
  if (!formName.value.trim()) {
    message.warning('请填写名称')
    return
  }
  if (!/^https?:\/\//.test(formBaseUrl.value.trim())) {
    message.warning('Base URL 必须以 http:// 或 https:// 开头')
    return
  }
  if (!formModelId.value.trim()) {
    message.warning('请填写模型 ID')
    return
  }
  if (!formApiKey.value.trim()) {
    message.warning('请填写 API Key')
    return
  }

  formSubmitting.value = true
  try {
    const { encryptedKey, plainKey } = encryptKey(formApiKey.value.trim())
    if (modalMode.value === 'create') {
      const id = `custom-${Date.now().toString(36)}`
      customModels.value.push({
        id,
        name: formName.value.trim(),
        baseUrl: formBaseUrl.value.trim().replace(/\/$/, ''),
        modelId: formModelId.value.trim(),
        compat: formCompat.value,
        encryptedKey,
        plainKey,
      })
      message.success('已添加')
    } else if (editingId.value) {
      const idx = customModels.value.findIndex((m) => m.id === editingId.value)
      if (idx >= 0) {
        customModels.value[idx] = {
          ...customModels.value[idx],
          name: formName.value.trim(),
          baseUrl: formBaseUrl.value.trim().replace(/\/$/, ''),
          modelId: formModelId.value.trim(),
          compat: formCompat.value,
          encryptedKey,
          plainKey,
        }
        message.success('已保存')
      }
    }
    saveCustomModels()
    showModal.value = false
  } finally {
    formSubmitting.value = false
  }
}

function handleDelete(model: CustomModel) {
  dialog.warning({
    title: '确认删除',
    content: `删除自定义模型 "${model.name}"?(本地网关上的对应 provider 也会失效)`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      customModels.value = customModels.value.filter((m) => m.id !== model.id)
      saveCustomModels()
      message.success('已删除')
      if (activeProvider.value === model.id) {
        activeProvider.value = 'lingjing'
        localStorage.setItem(ACTIVE_PROVIDER_KEY, 'lingjing')
      }
    },
  })
}

async function applyCustom(model: CustomModel) {
  const apiKey = decryptKey(model)
  if (!apiKey) {
    message.error('API Key 解密失败,请编辑此模型重新填写')
    return
  }
  formApplyingId.value = model.id
  try {
    const bridge = (window as any).lingjing
    if (!bridge?.configureLocalProviders) {
      message.error('Electron 桥接未注入,请重启应用')
      return
    }
    const result = await bridge.configureLocalProviders({
      providerId: model.id,
      compat: model.compat,
      token: apiKey,
      baseUrl: model.baseUrl,
      modelId: model.modelId,
      skipHermes: true, // 自定义只配 OpenClaw,Hermes 不动
    })
    if (result?.openclaw === 'ok') {
      activeProvider.value = model.id
      localStorage.setItem(ACTIVE_PROVIDER_KEY, model.id)
      localStorage.setItem('lingjing_selected_model', model.modelId)
      message.success(`已切换到 ${model.name}`)
    } else {
      message.error(result?.openclawMessage || '切换失败,请检查 Base URL / API Key')
    }
  } catch (err: any) {
    message.error(err?.message || '切换失败')
  } finally {
    formApplyingId.value = null
  }
}

onMounted(async () => {
  loadCustomModels()
  await loadCloudModels()
})
</script>

<template>
  <div class="models-page">
    <header class="page-head">
      <h1 class="page-title">模型管理</h1>
      <p class="page-subtitle">
        从灵镜云端选模型,或接入你自己的 API(OpenAI / Claude / DeepSeek 等)
      </p>
    </header>

    <NTabs v-model:value="tabValue" type="line" animated>
      <!-- 云端模型(灵镜) -->
      <NTabPane name="cloud" tab="云端模型">
        <NSpin :show="cloudLoading">
          <section v-if="!cloudLoading && models.length > 0" class="model-card">
            <div class="row">
              <label class="row-label">默认模型</label>
              <div class="row-control">
                <NSelect
                  v-model:value="selectedModelId"
                  :options="modelOptions"
                  size="medium"
                  class="model-select"
                  :consistent-menu-width="false"
                />
                <NButton
                  type="primary"
                  size="medium"
                  :loading="applying"
                  :disabled="isCurrentlyActive"
                  class="apply-btn"
                  @click="applyCloud"
                >
                  {{ isCurrentlyActive ? '当前生效' : '应用' }}
                </NButton>
              </div>
            </div>

            <div class="divider" />

            <div v-if="selectedModel" class="model-detail">
              <div class="detail-header">
                <span class="detail-name">{{ selectedModel.name || selectedModel.id }}</span>
                <NTag v-if="isCurrentlyActive" size="small" :bordered="false" type="success" round>
                  当前生效
                </NTag>
                <NTag v-else-if="selectedModel.featured" size="small" :bordered="false" round>
                  推荐
                </NTag>
              </div>

              <p v-if="selectedModel.description" class="detail-desc">
                {{ selectedModel.description }}
              </p>

              <div class="detail-grid">
                <div class="detail-item">
                  <span class="item-label">提供方</span>
                  <span class="item-value">{{ selectedModel.provider || '—' }}</span>
                </div>
                <div class="detail-item">
                  <span class="item-label">上下文</span>
                  <span class="item-value">{{ selectedModel.context_window || '—' }}</span>
                </div>
                <div class="detail-item">
                  <span class="item-label">输入价格</span>
                  <span class="item-value">{{ formatPrice(selectedModel.input_price) }}</span>
                </div>
                <div class="detail-item">
                  <span class="item-label">输出价格</span>
                  <span class="item-value">{{ formatPrice(selectedModel.output_price) }}</span>
                </div>
                <div class="detail-item">
                  <span class="item-label">模型 ID</span>
                  <span class="item-value mono">{{ selectedModel.id }}</span>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="!cloudLoading" class="model-card empty-state">
            <div class="empty-title">无可用模型</div>
            <p class="empty-desc">{{ lastError || '请先登录,或联系灵镜管理员开通模型权限' }}</p>
            <NButton size="medium" @click="loadCloudModels">重试</NButton>
          </section>
        </NSpin>
      </NTabPane>

      <!-- 自定义模型 -->
      <NTabPane name="custom" tab="自定义模型">
        <div class="custom-head">
          <div class="head-info">
            <NIcon size="14" class="head-icon"><KeyOutline /></NIcon>
            <span class="head-text">用你自己的 API Key 接入任意 OpenAI 兼容服务。Key 加密存本地。</span>
          </div>
          <NButton type="primary" size="medium" @click="openCreate()">
            <template #icon><NIcon><AddOutline /></NIcon></template>
            添加模型
          </NButton>
        </div>

        <div v-if="customModels.length === 0" class="custom-empty">
          <NEmpty description="还没有自定义模型,从下方预设开始或自己填一个">
            <template #icon><NIcon size="40" :depth="3"><CloudOutline /></NIcon></template>
          </NEmpty>

          <div class="presets-row">
            <p class="presets-label">快速开始</p>
            <div class="presets-grid">
              <button
                v-for="p in PRESETS"
                :key="p.name"
                class="preset-card"
                @click="openCreate(p)"
              >
                <div class="preset-name">{{ p.name }}</div>
                <div class="preset-url">{{ p.baseUrl }}</div>
              </button>
            </div>
          </div>
        </div>

        <div v-else class="custom-list">
          <div
            v-for="m in customModels"
            :key="m.id"
            class="custom-card"
            :class="{ 'is-active': activeProvider === m.id }"
          >
            <div class="custom-icon">
              <NIcon size="16">
                <CheckmarkCircle v-if="activeProvider === m.id" />
                <CloudOutline v-else />
              </NIcon>
            </div>
            <div class="custom-body">
              <div class="custom-name-row">
                <span class="custom-name">{{ m.name }}</span>
                <NTag v-if="activeProvider === m.id" size="small" :bordered="false" type="success" round>
                  当前生效
                </NTag>
                <NTag size="small" :bordered="false" round>{{ m.compat === 'anthropic' ? 'Claude 协议' : 'OpenAI 兼容' }}</NTag>
              </div>
              <div class="custom-meta">
                <span class="meta-url">{{ m.baseUrl }}</span>
                <span class="meta-sep">·</span>
                <span class="meta-mid">{{ m.modelId }}</span>
              </div>
            </div>
            <div class="custom-actions">
              <NButton
                size="small"
                :type="activeProvider === m.id ? 'default' : 'primary'"
                :disabled="activeProvider === m.id || formApplyingId === m.id"
                :loading="formApplyingId === m.id"
                @click="applyCustom(m)"
              >
                {{ activeProvider === m.id ? '生效中' : '应用' }}
              </NButton>
              <button class="icon-btn" title="编辑" @click="openEdit(m)">
                <NIcon size="14"><CreateOutline /></NIcon>
              </button>
              <button class="icon-btn icon-btn-danger" title="删除" @click="handleDelete(m)">
                <NIcon size="14"><TrashOutline /></NIcon>
              </button>
            </div>
          </div>
        </div>
      </NTabPane>
    </NTabs>

    <p class="page-footnote">
      切换模型后下次对话立即生效。本地 OpenClaw Gateway 会用新模型重启。
    </p>

    <!-- 自定义模型 modal -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="modalMode === 'create' ? '添加自定义模型' : '编辑模型'"
      style="width: 520px;"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div class="form-item">
        <label class="form-label">名称</label>
        <NInput v-model:value="formName" placeholder="如:OpenAI 个人 Key" size="medium" />
      </div>
      <div class="form-item">
        <label class="form-label">Base URL</label>
        <NInput
          v-model:value="formBaseUrl"
          placeholder="https://api.openai.com/v1"
          size="medium"
        />
        <p class="form-hint">OpenAI 兼容服务的 API Base 地址</p>
      </div>
      <div class="form-item">
        <label class="form-label">模型 ID</label>
        <NInput
          v-model:value="formModelId"
          placeholder="gpt-4o-mini / claude-3-5-sonnet-20241022"
          size="medium"
        />
      </div>
      <div class="form-item">
        <label class="form-label">兼容协议</label>
        <NSelect v-model:value="formCompat" :options="COMPAT_OPTIONS" size="medium" />
      </div>
      <div class="form-item">
        <label class="form-label">API Key</label>
        <NInput
          v-model:value="formApiKey"
          type="password"
          show-password-on="click"
          placeholder="sk-... / 不会上传,仅加密存本地"
          size="medium"
        />
      </div>

      <template #footer>
        <div class="modal-footer">
          <NSpace :size="8" style="margin-left: auto;">
            <NButton size="medium" :disabled="formSubmitting" @click="showModal = false">取消</NButton>
            <NButton
              type="primary"
              size="medium"
              :loading="formSubmitting"
              @click="handleSubmit"
            >
              {{ modalMode === 'create' ? '添加' : '保存' }}
            </NButton>
          </NSpace>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.models-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 16px 8px 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.page-head {
  margin-bottom: 18px;
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

/* 云端模型卡(沿用之前) */
.model-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 20px 22px;
  margin-top: 8px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.row-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
  flex-shrink: 0;
}

.row-control {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  justify-content: flex-end;
}

.model-select { min-width: 240px; }
.apply-btn { min-width: 80px; }

.divider {
  height: 1px;
  background: var(--n-divider-color);
  margin: 16px -22px;
}

.model-detail { display: flex; flex-direction: column; gap: 12px; }
.detail-header { display: flex; align-items: center; gap: 10px; }
.detail-name { font-size: 16px; font-weight: 500; color: var(--n-text-color); }
.detail-desc { font-size: 13px; color: var(--n-text-color-3); line-height: 1.55; margin: 0; }
.detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 24px; margin-top: 4px; }
.detail-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--n-divider-color);
  font-size: 13px;
}
.detail-item:last-child { border-bottom: none; }
.item-label { color: var(--n-text-color-3); }
.item-value { color: var(--n-text-color); font-variant-numeric: tabular-nums; }
.item-value.mono { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 22px;
  text-align: center;
}
.empty-title { font-size: 16px; font-weight: 500; color: var(--n-text-color); }
.empty-desc { font-size: 13px; color: var(--n-text-color-3); margin: 0 0 8px; }

/* 自定义模型 tab */
.custom-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 12px 0 16px;
}

.head-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--n-text-color-3);
  font-size: 12.5px;
  flex: 1;
  min-width: 0;
}

.head-icon { color: var(--n-text-color-disabled); flex-shrink: 0; }
.head-text { line-height: 1.4; }

.custom-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 22px;
}

.presets-row { width: 100%; margin-top: 28px; }

.presets-label {
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  margin: 0 4px 10px;
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.preset-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color 0.15s ease, transform 0.12s ease;
}

.preset-card:hover { border-color: var(--n-text-color-3); }
.preset-card:active { transform: scale(0.99); }

.preset-name { font-size: 13.5px; font-weight: 500; color: var(--n-text-color); margin-bottom: 4px; }
.preset-url {
  font-size: 11.5px;
  color: var(--n-text-color-3);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.custom-list { display: flex; flex-direction: column; gap: 8px; }

.custom-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: border-color 0.15s ease;
}

.custom-card:hover { border-color: var(--n-text-color-3); }

.custom-card.is-active {
  border-color: var(--n-success-color, #34C759);
  background: rgba(52, 199, 89, 0.05);
}

:root[data-theme='dark'] .custom-card.is-active {
  background: rgba(52, 199, 89, 0.08);
}

.custom-icon {
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

.custom-card.is-active .custom-icon { color: var(--n-success-color, #34C759); }

.custom-body { flex: 1; min-width: 0; }

.custom-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.custom-name { font-size: 14px; font-weight: 500; color: var(--n-text-color); }

.custom-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--n-text-color-3);
}

.meta-url {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.meta-sep { color: var(--n-text-color-disabled); }
.meta-mid { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }

.custom-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--n-text-color-disabled);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease, color 0.12s ease;
}

.icon-btn:hover {
  background: var(--n-action-color);
  color: var(--n-text-color);
}

.icon-btn-danger:hover {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
}

:root[data-theme='dark'] .icon-btn-danger:hover {
  background: rgba(255, 99, 89, 0.12);
  color: #FF6359;
}

/* Modal 表单 */
.form-item { margin-bottom: 14px; }

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

.modal-footer { display: flex; width: 100%; }

.page-footnote {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin: 16px 4px 0;
  line-height: 1.5;
}
</style>
