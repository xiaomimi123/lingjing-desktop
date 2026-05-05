<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NSpace, NTooltip, NIcon, NText } from 'naive-ui'
import { SunnyOutline, MoonOutline, LogOutOutline } from '@vicons/ionicons5'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'
import { useWebSocketStore } from '@/stores/websocket'
import { useHermesConnectionStore } from '@/stores/hermes/connection'
import { ConnectionState } from '@/api/types'
import GatewaySwitcher from '@/components/common/GatewaySwitcher.vue'

const route = useRoute()
const router = useRouter()
const { isDark, toggle } = useTheme()
const authStore = useAuthStore()
const wsStore = useWebSocketStore()
const connStore = useHermesConnectionStore()

const pageTitle = computed(() => {
  return (route.meta.title as string) || (route.meta.titleKey as string) || ''
})

const isOpenClaw = computed(() => connStore.currentGateway === 'openclaw')

// 状态指示:已登录 + 当前 gateway 连接状态
// (OpenClaw 走 api.aitoken.homes 中转,Hermes 走本地 :8642)
const cloudStatus = computed(() => {
  if (!authStore.isAuthenticated) {
    return { text: '未登录', color: '#8E8E93', dot: '#8E8E93' }
  }
  if (isOpenClaw.value) {
    if (wsStore.state === ConnectionState.CONNECTED) {
      return { text: 'OpenClaw 已连接', color: 'currentColor', dot: '#34C759' }
    }
    if (wsStore.state === ConnectionState.CONNECTING || wsStore.state === ConnectionState.RECONNECTING) {
      return { text: 'OpenClaw 连接中…', color: '#8E8E93', dot: '#FFCC00' }
    }
    return { text: 'OpenClaw 未连接', color: '#8E8E93', dot: '#FF3B30' }
  }
  return { text: 'Hermes Agent 已连接', color: 'currentColor', dot: '#34C759' }
})

async function handleLogout() {
  wsStore.disconnect()
  await authStore.logout()
  router.push({ name: 'Login' })
}

// 未登录状态点击 → 跳登录页;已登录点击不动作(状态指示性元素)
function handleCloudStatusClick() {
  if (!authStore.isAuthenticated) {
    router.push({ name: 'Login' })
  }
}
</script>

<template>
  <div class="app-header-wrap">
    <div class="header-left">
      <NText class="page-title">{{ pageTitle }}</NText>
    </div>

    <NSpace :size="10" align="center" class="header-right">
      <div
        class="cloud-status"
        :class="{ clickable: !authStore.isAuthenticated }"
        :title="!authStore.isAuthenticated ? '点击登录灵境云端账号' : ''"
        @click="handleCloudStatusClick"
      >
        <span class="cloud-dot" :style="{ background: cloudStatus.dot }" />
        <span class="cloud-label" :style="{ color: cloudStatus.color }">
          {{ cloudStatus.text }}
        </span>
      </div>

      <GatewaySwitcher />

      <NTooltip>
        <template #trigger>
          <NButton quaternary circle @click="toggle">
            <template #icon>
              <NIcon :component="isDark ? SunnyOutline : MoonOutline" />
            </template>
          </NButton>
        </template>
        {{ isDark ? '切换到浅色' : '切换到深色' }}
      </NTooltip>

      <NTooltip>
        <template #trigger>
          <NButton quaternary circle @click="handleLogout">
            <template #icon>
              <NIcon :component="LogOutOutline" />
            </template>
          </NButton>
        </template>
        退出登录
      </NTooltip>
    </NSpace>
  </div>
</template>

<style scoped>
.app-header-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.header-left {
  display: flex;
  align-items: center;
}

.page-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
  letter-spacing: 0.02em;
}

.header-right {
  display: flex;
}

.cloud-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--n-action-color, rgba(0, 0, 0, 0.04));
  font-size: 12px;
  user-select: none;
  transition: background 0.15s ease;
}
.cloud-status.clickable {
  cursor: pointer;
}
.cloud-status.clickable:hover {
  background: rgba(0, 0, 0, 0.08);
}
:root[data-theme='dark'] .cloud-status.clickable:hover {
  background: rgba(255, 255, 255, 0.10);
}

.cloud-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
}

.cloud-label {
  font-weight: 500;
  letter-spacing: 0.02em;
}

:root[data-theme='dark'] .cloud-status {
  background: rgba(255, 255, 255, 0.06);
}
</style>
