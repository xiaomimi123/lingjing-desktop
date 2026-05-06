<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

// Win 平台 frame:false 自画 ─ ☐ ✕ 三个窗口按钮。
// mac 已用 traffic light(titleBarStyle:hiddenInset),不需要这个组件画。
declare global {
  interface Window {
    lingjing?: {
      platform?: string
      window?: {
        minimize: () => Promise<void>
        toggleMaximize: () => Promise<boolean>
        close: () => Promise<void>
        isMaximized: () => Promise<boolean>
      }
    }
  }
}

const platform = window.lingjing?.platform || ''
const isMac = platform === 'darwin'
const isMaximized = ref(false)

let pollTimer: number | null = null

async function refreshMaximized() {
  try {
    isMaximized.value = (await window.lingjing?.window?.isMaximized()) ?? false
  } catch {
    /* ignore */
  }
}

function onMinimize() {
  void window.lingjing?.window?.minimize()
}
async function onToggleMaximize() {
  const next = await window.lingjing?.window?.toggleMaximize()
  if (typeof next === 'boolean') isMaximized.value = next
  else void refreshMaximized()
}
function onClose() {
  void window.lingjing?.window?.close()
}

onMounted(() => {
  void refreshMaximized()
  // 监测窗口最大化状态变化(双击边缘 / 拖到顶部等 OS 触发的)。轻量轮询避免新增 IPC 事件。
  pollTimer = window.setInterval(refreshMaximized, 800)
})
onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<template>
  <!-- mac 走原生 traffic light 不渲染 -->
  <div v-if="!isMac" class="window-controls" aria-label="窗口控制">
    <button
      class="ctrl ctrl-min"
      type="button"
      title="最小化"
      @click="onMinimize"
    >
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M2 6h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>
    <button
      v-if="false"
      class="ctrl ctrl-max"
      type="button"
      :title="isMaximized ? '还原' : '最大化'"
      @click="onToggleMaximize"
    >
      <svg v-if="!isMaximized" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
      <svg v-else viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <rect x="3.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.2" />
        <rect x="2.5" y="3.5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>
    <button
      class="ctrl ctrl-close"
      type="button"
      title="关闭"
      @click="onClose"
    >
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  position: fixed;
  top: 0;
  right: 0;
  display: flex;
  height: 32px;
  z-index: 9999;
  -webkit-app-region: no-drag;
  user-select: none;
  /* 容器本身不拦截 pointer:让下面的元素(GatewaySwitcher 等)被点击穿透;
   * 只有 .ctrl 按钮自己拦截。 */
  pointer-events: none;
}

.ctrl {
  width: 46px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  outline: none;
  transition: background 0.12s ease;
  -webkit-app-region: no-drag;
  opacity: 0.7;
  pointer-events: auto;
}

.ctrl:hover {
  background: rgba(0, 0, 0, 0.06);
  opacity: 1;
}

.ctrl-close:hover {
  background: #e81123;
  color: #fff;
  opacity: 1;
}

:root[data-theme='dark'] .ctrl:hover {
  background: rgba(255, 255, 255, 0.08);
}
:root[data-theme='dark'] .ctrl-close:hover {
  background: #e81123;
  color: #fff;
}
</style>
