<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NSelect,
  NButton,
  NTag,
  NCollapse,
  NCollapseItem,
  NAlert,
  NSpace,
  useMessage,
} from 'naive-ui'
import { useRouter } from 'vue-router'
import { useThemeStore, type ThemeMode } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { useWebSocketStore } from '@/stores/websocket'
import { useLingjingBillingStore } from '@/stores/lingjing-billing'
import { formatBalance } from '@/api/lingjing/billing'
import { ConnectionState } from '@/api/types'

const message = useMessage()
const router = useRouter()
const themeStore = useThemeStore()
const authStore = useAuthStore()
const wsStore = useWebSocketStore()
const billingStore = useLingjingBillingStore()

const userEmail = computed(() => authStore.user?.email || authStore.user?.username || '--')
const userDisplay = computed(() => authStore.user?.display_name || authStore.user?.username || '--')
const memberId = computed(() => authStore.memberId)
const balanceUsdDisplay = computed(() => formatBalance(billingStore.quota, 'USD'))
const usedUsdDisplay = computed(() => formatBalance(billingStore.usedQuota, 'USD'))

const themeOptions = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

const gatewayStatus = computed(() => {
  switch (wsStore.state) {
    case ConnectionState.CONNECTED:
      return { text: '已连接', type: 'success' as const }
    case ConnectionState.CONNECTING:
      return { text: '连接中', type: 'info' as const }
    case ConnectionState.RECONNECTING:
      return { text: '重连中', type: 'warning' as const }
    case ConnectionState.FAILED:
      return { text: '连接失败', type: 'error' as const }
    default:
      return { text: '未连接', type: 'default' as const }
  }
})

const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0'

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

function handleThemeChange(mode: ThemeMode) {
  themeStore.setMode(mode)
}

function goModels() {
  router.push({ name: 'Models' })
}

const reconfiguring = ref(false)
async function handleQuickReconfigure() {
  reconfiguring.value = true
  try {
    const bridge = (window as any).lingjing
    if (!bridge?.autoConfigureViaMain) {
      message.error('Electron 桥接未注入,请重启应用')
      return
    }
    const modelId = (authStore as any).getSelectedModel?.() || 'gpt-5.4'
    const result = await bridge.autoConfigureViaMain({ modelId })
    if (result?.openclaw === 'ok') {
      message.success('已重新配置本地网关')
    } else {
      message.error(result?.openclawMessage || '重新配置失败')
    }
  } catch (err: any) {
    message.error(err?.message || '操作失败')
  } finally {
    reconfiguring.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <header class="page-head">
      <h1 class="page-title">系统设置</h1>
      <p class="page-subtitle">管理你的账号、外观和高级配置</p>
    </header>

    <!-- 灵境账号 -->
    <section class="card">
      <h2 class="card-title">灵境账号</h2>

      <div class="info-row">
        <span class="info-label">邮箱</span>
        <span class="info-value">{{ userEmail }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">昵称</span>
        <span class="info-value">{{ userDisplay }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">创客编号</span>
        <span class="info-value mono">NO. {{ memberId }}</span>
      </div>
      <div class="info-row highlight">
        <span class="info-label">当前余额</span>
        <span class="info-value strong">${{ balanceUsdDisplay }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">累计消费</span>
        <span class="info-value">${{ usedUsdDisplay }}</span>
      </div>

      <div class="action-row">
        <NSpace :size="8">
          <NButton type="primary" size="medium" @click="openRecharge">充值</NButton>
          <NButton size="medium" @click="handleLogout">退出登录</NButton>
        </NSpace>
      </div>
    </section>

    <!-- 外观 -->
    <section class="card">
      <h2 class="card-title">外观</h2>
      <div class="info-row">
        <span class="info-label">主题模式</span>
        <NSelect
          :value="themeStore.mode"
          :options="themeOptions"
          size="small"
          style="width: 140px"
          @update:value="handleThemeChange"
        />
      </div>
    </section>

    <!-- 模型(快捷入口) -->
    <section class="card">
      <h2 class="card-title">默认模型</h2>
      <div class="info-row">
        <span class="info-label">当前对话使用的模型</span>
        <NButton size="small" @click="goModels">前往模型管理</NButton>
      </div>
    </section>

    <!-- 高级:OpenClaw Gateway 连接 -->
    <NCollapse class="advanced-collapse">
      <NCollapseItem title="高级" name="advanced">
        <NAlert
          type="info"
          :bordered="false"
          style="margin-bottom: 14px;"
          :show-icon="false"
        >
          以下是本地 OpenClaw Gateway 的连接状态。**与你的灵境云端账号无关**,大多数用户保持默认即可。
        </NAlert>

        <section class="card subcard">
          <h3 class="subcard-title">本地网关</h3>
          <div class="info-row">
            <span class="info-label">连接状态</span>
            <NTag size="small" :bordered="false" :type="gatewayStatus.type" round>
              {{ gatewayStatus.text }}
            </NTag>
          </div>
          <div class="info-row">
            <span class="info-label">网关地址</span>
            <span class="info-value mono">ws://localhost:18789</span>
          </div>
          <div class="info-row">
            <span class="info-label">配置文件</span>
            <span class="info-value mono">~/.openclaw/openclaw.json</span>
          </div>
          <div class="action-row">
            <NButton
              size="small"
              :loading="reconfiguring"
              @click="handleQuickReconfigure"
            >
              重新配置本地网关
            </NButton>
          </div>
        </section>
      </NCollapseItem>
    </NCollapse>

    <!-- 关于 -->
    <section class="card">
      <h2 class="card-title">关于</h2>
      <div class="info-row">
        <span class="info-label">灵境</span>
        <span class="info-value mono">v{{ appVersion }}</span>
      </div>
      <div class="about-text">
        基于 OpenClaw Gateway 构建的 Mac 桌面 AI 助手。
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 8px 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.page-head {
  margin-bottom: 24px;
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
}

.card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 14px;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 12px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--n-divider-color);
  font-size: 13.5px;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row.highlight .info-value.strong {
  font-size: 16px;
  font-weight: 500;
  color: var(--n-text-color);
}

.info-label {
  color: var(--n-text-color-3);
  flex-shrink: 0;
}

.info-value {
  color: var(--n-text-color);
  font-variant-numeric: tabular-nums;
  text-align: right;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-value.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
}

.action-row {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--n-divider-color);
}

.advanced-collapse {
  margin-bottom: 14px;
}

.advanced-collapse :deep(.n-collapse-item__header-main) {
  font-size: 13px;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.subcard {
  margin-top: 8px;
  margin-bottom: 0;
}

.subcard-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 12px;
}

.about-text {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--n-divider-color);
  line-height: 1.6;
}
</style>
