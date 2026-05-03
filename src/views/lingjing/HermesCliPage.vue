<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { NSpin, NButton, NIcon, NTag, useMessage } from 'naive-ui'
import {
  CodeSlashOutline, PlayOutline, StopOutline, RefreshOutline,
  EllipseOutline, ExpandOutline, ContractOutline,
} from '@vicons/ionicons5'
import { useHermesCliStore } from '@/stores/hermes-cli'

const message = useMessage()
const cliStore = useHermesCliStore()

const terminalContainerRef = ref<HTMLDivElement | null>(null)
const terminal = shallowRef<any>(null)
const fitAddon = shallowRef<any>(null)
const terminalLoading = ref(false)
const terminalError = ref<string | null>(null)
const isFullscreen = ref(false)

const statusType = computed(() => {
  if (cliStore.isConnected) return 'success'
  if (cliStore.isConnecting) return 'warning'
  if (cliStore.error) return 'error'
  return 'default'
})

const statusText = computed(() => {
  if (cliStore.isConnected) return '已连接'
  if (cliStore.isConnecting) return '连接中…'
  if (cliStore.error) return '连接失败'
  return '未连接'
})

const sessionLabel = computed(() => {
  const s = cliStore.currentSession
  if (!s) return ''
  return s.name || s.id.slice(0, 8)
})

async function initTerminal() {
  if (!terminalContainerRef.value) return
  terminalLoading.value = true
  terminalError.value = null
  try {
    const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-web-links'),
    ])

    if (terminal.value) terminal.value.dispose()

    terminal.value = new Terminal({
      fontSize: 13,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
      theme: {
        background: '#0d0d0f',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#0d0d0f',
        selectionBackground: '#264f78',
      },
      cursorBlink: true,
      scrollback: 10000,
      allowTransparency: true,
      cols: 120,
      rows: 32,
    })

    fitAddon.value = new FitAddon()
    terminal.value.loadAddon(fitAddon.value)
    terminal.value.loadAddon(new WebLinksAddon())
    terminal.value.open(terminalContainerRef.value)

    setTimeout(() => fitAddon.value?.fit(), 100)

    terminal.value.onData((data: string) => {
      if (data === '\x1b' && isFullscreen.value) {
        isFullscreen.value = false
        return
      }
      if (cliStore.isConnected) cliStore.sendInput(data)
    })

    terminal.value.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      if (cliStore.isConnected) cliStore.resize(cols, rows)
    })

    terminal.value.onSelectionChange(() => {
      const sel = terminal.value?.getSelection()
      if (sel) {
        navigator.clipboard.writeText(sel).catch(() => {})
      }
    })

    cliStore.onOutput((data: string) => {
      if (terminal.value) terminal.value.write(data)
    })

    cliStore.onConnected(() => {
      terminal.value?.write('\x1b[32m\x1b[1m已连接到 Hermes CLI\x1b[0m\r\n')
    })

    cliStore.onDisconnected(() => {
      terminal.value?.write('\r\n\x1b[33m连接已断开\x1b[0m\r\n')
    })
  } catch (error) {
    terminalError.value = error instanceof Error ? error.message : String(error)
  } finally {
    terminalLoading.value = false
  }
}

function handleResize() {
  if (fitAddon.value) {
    try { fitAddon.value.fit() } catch {}
  }
}

async function handleConnect() {
  try {
    await cliStore.fetchSessions()
    const cols = terminal.value?.cols || 120
    const rows = terminal.value?.rows || 32
    if (cliStore.sessions.length > 0) {
      const latest = cliStore.sessions[0]
      if (latest) {
        await cliStore.connect(cols, rows, latest.id)
      } else {
        await cliStore.connectNew([], cols, rows)
      }
    } else {
      await cliStore.connectNew([], cols, rows)
    }
  } catch (error) {
    message.error(`连接失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function handleNewSession() {
  try {
    const cols = terminal.value?.cols || 120
    const rows = terminal.value?.rows || 32
    await cliStore.connectNew([], cols, rows)
    message.success('已开始新会话')
  } catch (error) {
    message.error(`新建失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function handleDetach() {
  cliStore.detach()
  message.success('已断开,会话仍在后台运行')
}

async function handleDestroy() {
  try {
    await cliStore.destroy()
    message.success('会话已结束')
  } catch (error) {
    message.error(`结束失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  setTimeout(handleResize, 100)
}

onMounted(async () => {
  await initTerminal()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (terminal.value) {
    terminal.value.dispose()
    terminal.value = null
  }
  cliStore.disconnect()
})
</script>

<template>
  <div class="ling-cli" :class="{ 'is-fullscreen': isFullscreen }">
    <header v-if="!isFullscreen" class="page-head">
      <div>
        <h1 class="page-title">CLI</h1>
        <p class="page-subtitle">直接连到 Hermes Agent 的命令行。新会话或重连后台会话,在浏览器里跑命令。</p>
      </div>
      <div class="head-actions">
        <NButton v-if="!cliStore.isConnected" type="primary" :loading="cliStore.isConnecting" @click="handleConnect">
          <template #icon><NIcon><PlayOutline /></NIcon></template>
          {{ cliStore.sessions.length > 0 ? '重连最近会话' : '开始会话' }}
        </NButton>
        <NButton v-else @click="handleNewSession">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          新会话
        </NButton>
      </div>
    </header>

    <!-- 连接状态条 -->
    <section v-if="!isFullscreen" class="status-bar">
      <div class="status-left">
        <NTag :type="statusType" size="small" :bordered="false" round>
          <template #icon><NIcon size="10"><EllipseOutline /></NIcon></template>
          {{ statusText }}
        </NTag>
        <span v-if="sessionLabel" class="session-label">会话: {{ sessionLabel }}</span>
        <span v-else-if="!cliStore.isConnected" class="session-hint">点击右上角"开始会话"开启 Hermes CLI</span>
      </div>
      <div class="status-right">
        <NButton v-if="cliStore.isConnected" size="small" @click="handleDetach">
          <template #icon><NIcon><StopOutline /></NIcon></template>
          断开(后台保留)
        </NButton>
        <NButton v-if="cliStore.isConnected" size="small" tertiary @click="handleDestroy">
          结束会话
        </NButton>
        <NButton size="small" tertiary @click="toggleFullscreen">
          <template #icon><NIcon><ExpandOutline /></NIcon></template>
          全屏
        </NButton>
      </div>
    </section>

    <div v-if="cliStore.error && !isFullscreen" class="error-bar">
      {{ cliStore.error }}
    </div>

    <!-- 终端 -->
    <div class="terminal-card" :class="{ 'fullscreen': isFullscreen }">
      <div v-if="isFullscreen" class="fs-bar">
        <span class="fs-label">
          <NIcon size="14"><CodeSlashOutline /></NIcon>
          Hermes CLI · {{ statusText }}
        </span>
        <NButton size="small" @click="toggleFullscreen">
          <template #icon><NIcon><ContractOutline /></NIcon></template>
          退出全屏 (Esc)
        </NButton>
      </div>

      <NSpin :show="terminalLoading">
        <div ref="terminalContainerRef" class="terminal-container" />
      </NSpin>

      <div v-if="terminalError" class="terminal-error">终端初始化失败: {{ terminalError }}</div>
    </div>
  </div>
</template>

<style scoped>
.ling-cli {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 8px 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ling-cli.is-fullscreen {
  position: fixed;
  inset: 0;
  max-width: none;
  padding: 0;
  z-index: 9999;
  background: #0d0d0f;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 4px;
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

.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  background: var(--n-action-color);
  border-radius: 8px;
  flex-wrap: wrap;
}

.status-left {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.status-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.session-label {
  font-size: 12px;
  color: var(--n-text-color-2);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

.session-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.error-bar {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
}

.terminal-card {
  background: #0d0d0f;
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.terminal-card.fullscreen {
  border: none;
  border-radius: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.fs-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.fs-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

.terminal-container {
  width: 100%;
  height: 480px;
  padding: 8px;
}

.terminal-card.fullscreen .terminal-container {
  flex: 1;
  height: auto;
}

.terminal-error {
  padding: 16px;
  color: #FF3B30;
  font-size: 13px;
  text-align: center;
}
</style>

<style>
.ling-cli .xterm {
  height: 100%;
}
.ling-cli .xterm-viewport,
.ling-cli .xterm-screen {
  background-color: transparent !important;
}
.ling-cli .xterm-helper-textarea {
  opacity: 0 !important;
  position: absolute !important;
  left: -9999px !important;
  pointer-events: none !important;
}
</style>
