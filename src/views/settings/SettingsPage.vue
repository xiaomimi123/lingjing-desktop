<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import {
  NCard,
  NSpace,
  NSelect,
  NText,
  NAlert,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NSpin,
  NSwitch,
  NSlider,
  NInputNumber,
  NDivider,
  NCollapse,
  NCollapseItem,
  useMessage,
} from 'naive-ui'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useThemeStore, type ThemeMode } from '@/stores/theme'
import { useWebSocketStore } from '@/stores/websocket'
import { useAuthStore } from '@/stores/auth'
import { useLingjingBillingStore } from '@/stores/lingjing-billing'
import { formatBalance } from '@/api/lingjing/billing'
import { useTTSSettings } from '@/composables/useTTSSettings'
import { useEdgeTTS } from '@/composables/useEdgeTTS'
import { ConnectionState } from '@/api/types'
import {
  VolumeHighOutline,
  StopOutline,
} from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'

const themeStore = useThemeStore()
const wsStore = useWebSocketStore()
const authStore = useAuthStore()
const billingStore = useLingjingBillingStore()
const router = useRouter()
const { t } = useI18n()
const message = useMessage()

const userEmail = computed(() => authStore.user?.email || authStore.user?.username || '--')
const userDisplay = computed(() => authStore.user?.display_name || authStore.user?.username || '--')
const memberId = computed(() => authStore.memberId)
const balanceUsdDisplay = computed(() => formatBalance(billingStore.quota, 'USD'))
const usedUsdDisplay = computed(() => formatBalance(billingStore.usedQuota, 'USD'))

function openRecharge() {
  window.open('https://aitoken.homes', '_blank')
}

async function handleLogout() {
  try {
    wsStore.disconnect()
  } catch {
    // ignore
  }
  await authStore.logout()
  router.push({ name: 'Login' })
}

// 你 aitoken.homes default 分组实际可用的 9 个模型(2026-04-30 实测)
// 后续如开通更多模型,直接在这里加;不在列表里的会 503"无可用渠道"
const POPULAR_MODELS = [
  { label: 'GPT-5.4(平衡,默认)', value: 'gpt-5.4' },
  { label: 'GPT-5.2(更快、更便宜)', value: 'gpt-5.2' },
  { label: 'DeepSeek Chat(国产,快)', value: 'deepseek-chat' },
  { label: 'DeepSeek V4 Pro(最强国产)', value: 'deepseek-v4-pro' },
  { label: 'Claude Sonnet 4.6(均衡)', value: 'claude-sonnet-4-6' },
  { label: 'Claude Opus 4.6(强)', value: 'claude-opus-4-6' },
  { label: 'Claude Opus 4.7(最强)', value: 'claude-opus-4-7' },
]

const selectedModelId = ref<string>(
  (authStore as any).getSelectedModel?.() || 'gpt-5.4',
)

const reconfiguring = ref(false)
async function handleReconfigure() {
  reconfiguring.value = true
  try {
    // 走主进程路径(绕过浏览器 CORS / cookie 问题)
    const bridge = (window as any).lingjing
    if (!bridge?.autoConfigureViaMain) {
      message.error('Electron bridge 未注入,请重启应用')
      return
    }
    const result = await bridge.autoConfigureViaMain({ modelId: selectedModelId.value })
    console.info('[settings] autoConfigureViaMain result:', result)

    if (result?.openclaw === 'ok') {
      // 持久化用户选的模型
      try { localStorage.setItem('lingjing_selected_model', selectedModelId.value) } catch {}
      message.success(`已切换到 ${selectedModelId.value},等 Gateway 重启 5 秒后试发消息`)
    } else if (result?.openclaw === 'error' || result?.openclaw === 'skipped') {
      message.error(
        `OpenClaw 配置失败:${result.openclawMessage || result.message || '未知错误'}`,
      )
    } else {
      message.warning('已触发,详细日志看 Console / 主进程终端')
    }
  } catch (err: any) {
    console.error('[settings] handleReconfigure error:', err)
    message.error(err?.message || '重新配置失败')
  } finally {
    reconfiguring.value = false
  }
}
const appTitle = import.meta.env.VITE_APP_TITLE || '灵境'
const appVersion = import.meta.env.VITE_APP_VERSION || ''

const loading = ref(false)
const saving = ref(false)
const configForm = ref({
  AUTH_USERNAME: '',
  AUTH_PASSWORD: '',
  OPENCLAW_WS_URL: '',
  OPENCLAW_AUTH_TOKEN: '',
  OPENCLAW_AUTH_PASSWORD: '', // Gateway 密码认证
})

// TTS settings
const { settings: ttsSettings, resetSettings: resetTTSSettings, updateSettings: updateTTSSettings } = useTTSSettings()
const ttsVoices = ref<{ label: string; value: string; lang?: string }[]>([])
const ttsLoading = ref(false)
const ttsSaving = ref(false)
const ttsPreviewText = ref('你好，这是一个语音测试。')
const { speak: ttsSpeak, stop: ttsStop, isPlaying: ttsIsPlaying, isLoading: ttsIsLoading } = useEdgeTTS()

const themeOptions = computed(() => ([
  { label: t('pages.settings.themeLight'), value: 'light' },
  { label: t('pages.settings.themeDark'), value: 'dark' },
]))

const connectionStatus = computed(() => {
  switch (wsStore.state) {
    case ConnectionState.CONNECTED: return { text: t('pages.settings.statusConnected'), type: 'success' as const }
    case ConnectionState.CONNECTING: return { text: t('pages.settings.statusConnecting'), type: 'info' as const }
    case ConnectionState.RECONNECTING: return { text: t('pages.settings.statusReconnecting', { count: wsStore.reconnectAttempts }), type: 'warning' as const }
    case ConnectionState.FAILED: return { text: t('pages.settings.statusFailed'), type: 'error' as const }
    default: return { text: t('pages.settings.statusDisconnected'), type: 'error' as const }
  }
})

function handleThemeChange(mode: ThemeMode) {
  themeStore.setMode(mode)
}

async function loadConfig() {
  loading.value = true
  try {
    const token = authStore.getToken()
    const response = await fetch('/api/config', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    const data = await response.json()
    if (data.ok) {
      configForm.value = {
        AUTH_USERNAME: data.config.AUTH_USERNAME || '',
        AUTH_PASSWORD: data.config.AUTH_PASSWORD || '',
        OPENCLAW_WS_URL: data.config.OPENCLAW_WS_URL || '',
        OPENCLAW_AUTH_TOKEN: data.config.OPENCLAW_AUTH_TOKEN || '',
        OPENCLAW_AUTH_PASSWORD: data.config.OPENCLAW_AUTH_PASSWORD || '',
      }
    }
  } catch (e) {
    message.error(t('pages.settings.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true
  try {
    const token = authStore.getToken()
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configForm.value),
    })
    const data = await response.json()
    if (data.ok) {
      message.success(t('pages.settings.saveSuccess'))
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } else {
      message.error(data.error?.message || t('pages.settings.saveFailed'))
    }
  } catch (e) {
    message.error(t('pages.settings.saveFailed'))
  } finally {
    saving.value = false
  }
}

// ---- TTS Settings ----

async function loadTTSSettings() {
  ttsLoading.value = true
  try {
    // Load available voices - need to handle async loading
    let voices = window.speechSynthesis.getVoices()
    
    // If voices are not loaded yet, wait for voiceschanged event
    if (voices.length === 0) {
      await new Promise<void>((resolve) => {
        const handleVoicesChanged = () => {
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
          resolve()
        }
        window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
        // Also set a timeout in case the event never fires
        setTimeout(() => {
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
          resolve()
        }, 2000)
      })
      voices = window.speechSynthesis.getVoices()
    }
    
    const voiceOptions: { label: string; value: string; lang?: string }[] = []
    
    // Group voices by language
    const langGroups = new Map<string, SpeechSynthesisVoice[]>()
    for (const voice of voices) {
      const lang = voice.lang.split('-')[0] || 'other'
      if (!langGroups.has(lang)) {
        langGroups.set(lang, [])
      }
      langGroups.get(lang)!.push(voice)
    }
    
    // Add Chinese voices first
    const chineseVoices = langGroups.get('zh') || []
    for (const v of chineseVoices) {
      voiceOptions.push({
        label: `${v.name} (${v.lang})`,
        value: v.name,
        lang: v.lang,
      })
    }
    
    // Add English voices second
    const englishVoices = langGroups.get('en') || []
    for (const v of englishVoices) {
      voiceOptions.push({
        label: `${v.name} (${v.lang})`,
        value: v.name,
        lang: v.lang,
      })
    }
    
    // Add other voices
    for (const [lang, voiceList] of langGroups) {
      if (lang === 'zh' || lang === 'en') continue
      for (const v of voiceList) {
        voiceOptions.push({
          label: `${v.name} (${v.lang})`,
          value: v.name,
          lang: v.lang,
        })
      }
    }
    
    ttsVoices.value = voiceOptions
  } catch (err) {
    console.error('[SettingsPage] Failed to load TTS settings:', err)
  } finally {
    ttsLoading.value = false
  }
}

async function handlePreviewTTS() {
  if (ttsIsPlaying.value || ttsIsLoading.value) {
    ttsStop()
    return
  }
  
  try {
    await ttsSpeak(ttsPreviewText.value, {
      voice: ttsSettings.value.voice,
      rate: ttsSettings.value.rate,
      volume: ttsSettings.value.volume,
      pitch: ttsSettings.value.pitch,
    })
  } catch (err) {
    console.error('[SettingsPage] TTS preview error:', err)
    message.error(t('pages.settings.tts.previewFailed'))
  }
}

async function handleSaveTTS() {
  ttsSaving.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 300))
    message.success(t('pages.settings.tts.saveSuccess'))
  } finally {
    ttsSaving.value = false
  }
}

function handleResetTTS() {
  resetTTSSettings()
  message.success(t('pages.settings.tts.resetSuccess'))
}

onMounted(() => {
  loadConfig()
  loadTTSSettings()
})
</script>

<template>
  <NSpace vertical :size="16">
    <NCard title="灵境账号" class="app-card">
      <div class="account-grid">
        <div class="account-row">
          <span class="account-label">邮箱</span>
          <span class="account-value">{{ userEmail }}</span>
        </div>
        <div class="account-row">
          <span class="account-label">昵称</span>
          <span class="account-value">{{ userDisplay }}</span>
        </div>
        <div class="account-row">
          <span class="account-label">创客编号</span>
          <span class="account-value">NO. {{ memberId }}</span>
        </div>
        <div class="account-row">
          <span class="account-label">当前余额</span>
          <span class="account-value highlighted">$ {{ balanceUsdDisplay }}</span>
        </div>
        <div class="account-row">
          <span class="account-label">累计消费</span>
          <span class="account-value">$ {{ usedUsdDisplay }}</span>
        </div>
      </div>
      <div class="model-row">
        <span class="account-label">默认模型</span>
        <NSelect
          v-model:value="selectedModelId"
          :options="POPULAR_MODELS"
          size="small"
          style="max-width: 320px;"
          filterable
        />
      </div>

      <NSpace style="margin-top: 16px;">
        <NButton type="primary" @click="openRecharge">充值</NButton>
        <NButton :loading="reconfiguring" type="primary" ghost @click="handleReconfigure">
          应用模型(重新配置)
        </NButton>
        <NButton @click="handleLogout">退出登录</NButton>
      </NSpace>
    </NCard>

    <NCard :title="t('pages.settings.appearanceSettings')" class="app-card">
      <NForm label-placement="left" label-width="120" style="max-width: 500px;">
        <NFormItem :label="t('pages.settings.themeMode')">
          <NSelect
            :value="themeStore.mode"
            :options="themeOptions"
            @update:value="handleThemeChange"
          />
        </NFormItem>
      </NForm>
    </NCard>

    <NCollapse class="advanced-collapse">
      <NCollapseItem title="高级:OpenClaw Gateway 本地连接(可选)" name="gateway">
        <NAlert type="info" :bordered="false" style="margin-bottom: 12px;">
          这是本地 OpenClaw Gateway 协议网关的连接配置,**与灵境云端账号无关**。仅当你想使用本地 OpenClaw Gateway 提供的功能(如本地工坊)时才需要填。大多数用户保持默认即可,不影响云端对话。
        </NAlert>

        <NCard :title="t('pages.settings.connectionSettings')" class="app-card" embedded>
          <NAlert :type="connectionStatus.type" :bordered="false">
            {{ t('pages.settings.currentStatus', { status: connectionStatus.text }) }}
            <span v-if="wsStore.lastError">({{ wsStore.lastError }})</span>
          </NAlert>
        </NCard>

        <NCard :title="t('pages.settings.envSettings')" class="app-card" embedded style="margin-top: 12px;">
          <NSpin :show="loading">
            <NForm label-placement="left" label-width="140" style="max-width: 600px;">
          <NFormItem :label="t('pages.settings.authUsername')">
            <NInput
              v-model:value="configForm.AUTH_USERNAME"
              :placeholder="t('pages.settings.authUsernamePlaceholder')"
            />
          </NFormItem>
          
          <NFormItem :label="t('pages.settings.authPassword')">
            <NInput
              v-model:value="configForm.AUTH_PASSWORD"
              type="password"
              show-password-on="click"
              :placeholder="t('pages.settings.authPasswordPlaceholder')"
            />
          </NFormItem>
          
          <NFormItem :label="t('pages.settings.openclawUrl')">
            <NInput
              v-model:value="configForm.OPENCLAW_WS_URL"
              :placeholder="t('pages.settings.openclawUrlPlaceholder')"
            />
          </NFormItem>
          
          <NFormItem :label="t('pages.settings.openclawToken')">
            <NInput
              v-model:value="configForm.OPENCLAW_AUTH_TOKEN"
              type="password"
              show-password-on="click"
              :placeholder="t('pages.settings.openclawTokenPlaceholder')"
            />
          </NFormItem>
          
          <NFormItem :label="t('pages.settings.openclawPassword')">
            <NInput
              v-model:value="configForm.OPENCLAW_AUTH_PASSWORD"
              type="password"
              show-password-on="click"
              :placeholder="t('pages.settings.openclawPasswordPlaceholder')"
            />
          </NFormItem>
          
          <NFormItem :label="''">
            <NSpace>
              <NButton type="primary" :loading="saving" @click="saveConfig">
                {{ t('pages.settings.save') }}
              </NButton>
            </NSpace>
          </NFormItem>
        </NForm>
      </NSpin>
      
      <NAlert type="info" :bordered="false" style="margin-top: 16px;">
        {{ t('pages.settings.envSettingsHint') }}
      </NAlert>
    </NCard>
      </NCollapseItem>
    </NCollapse>

    <!-- TTS Settings -->
    <NCard :title="t('pages.settings.tts.title')" class="app-card">
      <NSpin :show="ttsLoading">
        <NSpace vertical :size="16">
          <NAlert type="info" :bordered="false">
            {{ t('pages.settings.tts.hint') }}
          </NAlert>

          <!-- Enable TTS -->
          <div>
            <NSpace align="center" :size="12">
              <NSwitch v-model:value="ttsSettings.enabled" />
              <NText>{{ t('pages.settings.tts.enable') }}</NText>
            </NSpace>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Auto Play -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.autoPlay') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.autoPlayHint') }}
            </NText>
            <NSpace align="center" :size="12">
              <NSwitch v-model:value="ttsSettings.autoPlay" />
            </NSpace>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Voice Selection -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.voice') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.voiceHint') }}
            </NText>
            <NSelect
              v-model:value="ttsSettings.voice"
              :options="ttsVoices"
              :placeholder="t('pages.settings.tts.voicePlaceholder')"
              filterable
              clearable
              style="max-width: 400px;"
            />
          </div>

          <NDivider style="margin: 0;" />

          <!-- Rate -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.rate') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.rateHint') }}
            </NText>
            <div style="max-width: 400px; display: flex; align-items: center; gap: 16px;">
              <NSlider
                v-model:value="ttsSettings.rate"
                :min="0.1"
                :max="2.0"
                :step="0.1"
                :tooltip="true"
                :format-tooltip="(value: number) => `${value.toFixed(1)}x`"
                style="flex: 1;"
              />
              <NInputNumber
                v-model:value="ttsSettings.rate"
                :min="0.1"
                :max="2.0"
                :step="0.1"
                size="small"
                style="width: 80px;"
              >
                <template #suffix>x</template>
              </NInputNumber>
            </div>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Volume -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.volume') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.volumeHint') }}
            </NText>
            <div style="max-width: 400px; display: flex; align-items: center; gap: 16px;">
              <NSlider
                v-model:value="ttsSettings.volume"
                :min="0"
                :max="1"
                :step="0.1"
                :tooltip="true"
                :format-tooltip="(value: number) => `${Math.round(value * 100)}%`"
                style="flex: 1;"
              />
              <NInputNumber
                v-model:value="ttsSettings.volume"
                :min="0"
                :max="1"
                :step="0.1"
                size="small"
                style="width: 80px;"
              />
            </div>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Pitch -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.pitch') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.pitchHint') }}
            </NText>
            <div style="max-width: 400px; display: flex; align-items: center; gap: 16px;">
              <NSlider
                v-model:value="ttsSettings.pitch"
                :min="0.1"
                :max="2.0"
                :step="0.1"
                :tooltip="true"
                :format-tooltip="(value: number) => value.toFixed(1)"
                style="flex: 1;"
              />
              <NInputNumber
                v-model:value="ttsSettings.pitch"
                :min="0.1"
                :max="2.0"
                :step="0.1"
                size="small"
                style="width: 80px;"
              />
            </div>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Preview -->
          <div>
            <NText strong style="display: block; margin-bottom: 4px;">{{ t('pages.settings.tts.preview') }}</NText>
            <NText depth="3" style="font-size: 13px; display: block; margin-bottom: 8px;">
              {{ t('pages.settings.tts.previewHint') }}
            </NText>
            <NSpace :size="12" align="center" style="max-width: 400px;">
              <NInput
                v-model:value="ttsPreviewText"
                :placeholder="t('pages.settings.tts.previewPlaceholder')"
                style="flex: 1;"
              />
              <NButton
                :type="ttsIsPlaying || ttsIsLoading ? 'error' : 'primary'"
                :loading="ttsIsLoading && !ttsIsPlaying"
                @click="handlePreviewTTS"
              >
                <template #icon>
                  <NIcon :component="ttsIsPlaying || ttsIsLoading ? StopOutline : VolumeHighOutline" />
                </template>
                {{ ttsIsPlaying ? t('pages.settings.tts.stop') : t('pages.settings.tts.play') }}
              </NButton>
            </NSpace>
          </div>

          <NDivider style="margin: 0;" />

          <!-- Actions -->
          <NSpace :size="8">
            <NButton type="primary" :loading="ttsSaving" @click="handleSaveTTS">
              {{ t('common.save') }}
            </NButton>
            <NButton @click="handleResetTTS">
              {{ t('common.reset') }}
            </NButton>
          </NSpace>
        </NSpace>
      </NSpin>
    </NCard>

    <NCard :title="t('pages.settings.about')" class="app-card">
      <NSpace vertical :size="8">
        <NText>{{ appTitle }} v{{ appVersion }}</NText>
        <NText depth="3" style="font-size: 13px;">
          {{ t('pages.settings.aboutLine1') }}
        </NText>
        <NText depth="3" style="font-size: 13px;">
          {{ t('pages.settings.aboutLine2') }}
        </NText>
      </NSpace>
    </NCard>
  </NSpace>
</template>

<style scoped>
.account-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  max-width: 480px;
}

.account-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--n-divider-color, rgba(0, 0, 0, 0.06));
  font-size: 13.5px;
}

.account-row:last-child {
  border-bottom: none;
}

.account-label {
  color: var(--n-text-color-3, #6e6e73);
}

.account-value {
  color: var(--n-text-color, #1f1f1f);
  font-variant-numeric: tabular-nums;
}

.account-value.highlighted {
  font-size: 16px;
  font-weight: 500;
  color: var(--n-text-color);
}

.model-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--n-divider-color, rgba(0, 0, 0, 0.06));
}

.model-row .account-label {
  flex-shrink: 0;
}

.advanced-collapse :deep(.n-collapse-item__header-main) {
  font-size: 13.5px;
  color: var(--n-text-color-3, #6e6e73);
}

:root[data-theme='dark'] .account-value.highlighted {
  color: #4d8ec5;
}
</style>
