<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import {
  NSelect,
  NButton,
  NTag,
  NCollapse,
  NCollapseItem,
  NAlert,
  NSpace,
  NTabs,
  NTabPane,
  NInput,
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

// 进入设置页主动刷新一次用户信息。
// 不依赖路由守卫的 checkAuth(它可能在 ws/billing 还没就绪时跑,或被 race condition 覆盖),
// 直接在 mount 时再 fetch 一次保证 user.email/display_name 等字段有值。
onMounted(async () => {
  if (authStore.isAuthenticated) {
    try {
      await authStore.checkAuth()
    } catch (e) {
      console.warn('[settings] checkAuth refresh failed:', e)
    }
  }
})
const balanceUsdDisplay = computed(() => formatBalance(billingStore.quota, 'USD'))
const usedUsdDisplay = computed(() => formatBalance(billingStore.usedQuota, 'USD'))

// ============================================================================
// 自动更新(electron-updater + GitHub Releases)
// ============================================================================
type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'
const updateState = ref<UpdateState>('idle')
const updateLatestVersion = ref<string>('')
const updateProgressPercent = ref<number>(0)
const updateError = ref<string>('')

let unsubscribeUpdateEvent: (() => void) | null = null

async function handleCheckUpdate() {
  if (updateState.value === 'checking' || updateState.value === 'downloading') return
  updateState.value = 'checking'
  updateError.value = ''
  try {
    const r = await window.lingjing?.checkForUpdate?.()
    if (!r) {
      updateError.value = '更新功能不可用(开发模式或缺少 IPC)'
      updateState.value = 'error'
      return
    }
    if ((r as any).error) {
      updateError.value = (r as any).error
      updateState.value = 'error'
      return
    }
    updateLatestVersion.value = (r as any).latestVersion || ''
    if ((r as any).hasUpdate) {
      updateState.value = 'available'
    } else {
      updateState.value = 'up-to-date'
      // 3 秒后回到 idle
      setTimeout(() => {
        if (updateState.value === 'up-to-date') updateState.value = 'idle'
      }, 3000)
    }
  } catch (e: any) {
    updateError.value = e?.message || '检查失败'
    updateState.value = 'error'
  }
}

async function handleDownloadUpdate() {
  updateState.value = 'downloading'
  updateProgressPercent.value = 0
  updateError.value = ''
  try {
    const r = await window.lingjing?.downloadUpdate?.()
    if (r && !(r as any).ok) {
      updateError.value = (r as any).message || '下载失败'
      updateState.value = 'error'
    }
    // 真正的状态由 onUpdateEvent('downloaded') 推
  } catch (e: any) {
    updateError.value = e?.message || '下载失败'
    updateState.value = 'error'
  }
}

function handleInstallUpdate() {
  message.info('正在重启安装,请稍候...')
  window.lingjing?.installUpdate?.()
}

onMounted(() => {
  // 订阅 main 进程推送的 updater 事件
  if (window.lingjing?.onUpdateEvent) {
    unsubscribeUpdateEvent = window.lingjing.onUpdateEvent((evt: any) => {
      if (!evt || !evt.event) return
      switch (evt.event) {
        case 'available':
          updateLatestVersion.value = evt.payload?.version || ''
          updateState.value = 'available'
          break
        case 'not-available':
          updateState.value = 'up-to-date'
          break
        case 'progress':
          updateState.value = 'downloading'
          updateProgressPercent.value = evt.payload?.percent || 0
          break
        case 'downloaded':
          updateState.value = 'downloaded'
          break
        case 'error':
          updateError.value = evt.payload?.message || '更新出错'
          updateState.value = 'error'
          break
      }
    })
  }
})
onUnmounted(() => {
  if (unsubscribeUpdateEvent) unsubscribeUpdateEvent()
})

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

// ============================================================================
// 错误日志 — 用户复制后反馈给 1186453507@qq.com 排查
// ============================================================================
const FEEDBACK_EMAIL = '1186453507@qq.com'
const FEEDBACK_GITHUB = 'https://github.com/xiaomimi123/lingjing-desktop/issues'
const logsLoading = ref(false)
const logsActiveTab = ref<'main' | 'backend' | 'openclaw'>('main')
const logsMain = ref<string>('')
const logsBackend = ref<string>('')
const logsOpenClaw = ref<string>('')
const logsHeader = ref<string>('')
const logsMainPath = ref<string>('')
const logsBackendPath = ref<string>('')
const logsOpenClawPath = ref<string>('')
const logsDetectedPort = ref<number | null>(null)

async function handleRefreshLogs() {
  if (logsLoading.value) return
  logsLoading.value = true
  try {
    const r: any = await window.lingjing?.getErrorLogs?.()
    if (!r) {
      message.error('日志接口不可用(开发模式或缺少 IPC)')
      return
    }
    logsMain.value = r.main || '(空)'
    logsBackend.value = r.backend || '(空)'
    logsOpenClaw.value = r.openclaw || '(空)'
    logsMainPath.value = r.mainPath || ''
    logsBackendPath.value = r.backendPath || ''
    logsOpenClawPath.value = r.openclawPath || ''
    logsDetectedPort.value = r.detectedOpenClawPort ?? null
    logsHeader.value =
      `=== 灵境 错误日志反馈 ===\n` +
      `版本: v${r.version}\n` +
      `平台: ${r.platform} / ${r.arch}\n` +
      `时间: ${r.time}\n` +
      `OpenClaw 端口: ${r.detectedOpenClawPort ? r.detectedOpenClawPort + ' (探测得出)' : '未探测到 ⚠'}\n` +
      `主进程日志: ${r.mainPath}\n` +
      `后端日志: ${r.backendPath}\n` +
      `OpenClaw 日志: ${r.openclawPath}\n`
  } catch (e: any) {
    message.error(e?.message || '读取日志失败')
  } finally {
    logsLoading.value = false
  }
}

async function handleCopyLogs() {
  if (!logsHeader.value) {
    await handleRefreshLogs()
  }
  const payload =
    logsHeader.value +
    `\n--- main.log (最近 300 行) ---\n${logsMain.value}\n` +
    `\n--- backend.log (最近 300 行) ---\n${logsBackend.value}\n` +
    `\n--- openclaw.log (最近 300 行) ---\n${logsOpenClaw.value}\n`
  try {
    await navigator.clipboard.writeText(payload)
    message.success('已复制全部日志到剪贴板,粘贴到邮件/Issue 即可')
  } catch (e: any) {
    message.error('复制失败:' + (e?.message || ''))
  }
}

async function handleOpenLogsFolder() {
  try {
    const r: any = await window.lingjing?.openLogsFolder?.()
    if (r && !r.ok) {
      message.error(r.message || '打开失败')
    }
  } catch (e: any) {
    message.error(e?.message || '打开失败')
  }
}

function handleOpenFeedbackEmail() {
  const subject = encodeURIComponent(`灵境 v${appVersion} 错误反馈`)
  const body = encodeURIComponent('请在下方粘贴日志(已复制到剪贴板),并描述出错时的操作:\n\n')
  window.open(`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`, '_self')
}

// v1.4 诊断契约 — 一键拿全所有诊断信息生成 markdown 反馈
const diagnoseLoading = ref(false)
async function handleFullDiagnose() {
  if (diagnoseLoading.value) return
  diagnoseLoading.value = true
  try {
    const bridge: any = (window as any).lingjing
    if (!bridge?.diagnoseFull) {
      message.error('诊断接口不可用,请重启应用')
      return
    }
    const r = await bridge.diagnoseFull()
    if (r?.error) {
      message.error('诊断失败: ' + r.error)
      return
    }
    const md = formatDiagnoseMarkdown(r)
    await navigator.clipboard.writeText(md)
    const portCnt = (r.openclawPorts || []).filter((p: any) => p.listening).length
    const cfgOk = r.openclawConfig?.parseable && r.openclawConfig?.fields?.['gateway.mode'] === 'local'
    const keyOk = r.gatewayCmd?.hasOpenAIKey
    message.success(
      `诊断完成 (端口监听 ${portCnt} 个, mode=${cfgOk ? 'OK' : '✗'}, OPENAI_KEY=${keyOk ? 'OK' : '✗'}),已复制 markdown 到剪贴板`,
      { duration: 6000 }
    )
  } catch (e: any) {
    message.error(e?.message || '诊断失败')
  } finally {
    diagnoseLoading.value = false
  }
}

function formatDiagnoseMarkdown(d: any): string {
  const lines: string[] = []
  lines.push('# 灵境完整诊断报告')
  lines.push('')
  lines.push(`- 版本: v${d.meta?.version}`)
  lines.push(`- 平台: ${d.meta?.platform} / ${d.meta?.arch}`)
  lines.push(`- 时间: ${d.meta?.ts}`)
  lines.push(`- userData: \`${d.meta?.userDataPath}\``)
  lines.push(`- 探测到的 OpenClaw 端口: ${d.meta?.detectedOpenClawPort ?? '(未探测到)'}`)
  lines.push('')

  lines.push('## OpenClaw 端口扫描 (18789-18795)')
  for (const p of (d.openclawPorts || [])) {
    lines.push(`- ${p.port}: ${p.listening ? '✓ LISTENING' : '✗'}`)
  }
  lines.push('')

  lines.push('## Scheduled Tasks')
  for (const t of (d.scheduledTasks || [])) {
    if (t?.exists) {
      lines.push(`- ${t.name}: state=${t.state}, lastRunTime=${t.lastRunTime}, lastTaskResult=${t.lastTaskResult}`)
    } else {
      lines.push(`- ${t?.name || '?'}: ✗ 不存在`)
    }
  }
  lines.push('')

  lines.push('## Daemon 进程')
  if (d.daemonProcess) {
    lines.push(`- pid: ${d.daemonProcess.pid}`)
    lines.push(`- name: ${d.daemonProcess.name}`)
    lines.push(`- CPU 累计: ${d.daemonProcess.cpuSec}s`)
    lines.push(`- 内存: ${d.daemonProcess.memMB} MB`)
    lines.push(`- 启动时间: ${d.daemonProcess.startTime}`)
  } else {
    lines.push('- (无 daemon 进程在监听)')
  }
  lines.push('')

  lines.push('## openclaw.json 配置')
  const oc = d.openclawConfig || {}
  lines.push(`- 路径: \`${oc.path}\``)
  lines.push(`- 存在: ${oc.exists ? '✓' : '✗'}`)
  lines.push(`- 含 BOM: ${oc.hasBom ? '⚠ 是' : '否'}`)
  lines.push(`- 可解析: ${oc.parseable ? '✓' : '✗ ' + (oc.parseError || '')}`)
  for (const [k, v] of Object.entries(oc.fields || {})) {
    lines.push(`- ${k}: ${JSON.stringify(v)}`)
  }
  lines.push('')

  lines.push('## gateway.cmd 状态')
  const gc = d.gatewayCmd || {}
  lines.push(`- 路径: \`${gc.path}\``)
  lines.push(`- 存在: ${gc.exists ? '✓' : '✗'}`)
  if (gc.exists) {
    lines.push(`- 含 OPENAI_API_KEY: ${gc.hasOpenAIKey ? '✓' : '✗'}`)
    lines.push(`- 含 OPENAI_BASE_URL: ${gc.hasOpenAIBaseUrl ? '✓' : '✗'}`)
    lines.push(`- 端口: ${gc.portFromCmd}`)
    lines.push(`- 文件大小: ${gc.bytes} 字节`)
  }
  lines.push('')

  lines.push('## 启动期断言 (startupAssertions)')
  if ((d.startupAssertions || []).length === 0) {
    lines.push('- (无)')
  } else {
    for (const a of d.startupAssertions) {
      const extra = Object.entries(a)
        .filter(([k]) => k !== 'step' && k !== 'ts')
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ')
      lines.push(`- [${a.ts}] ${a.step} ${extra}`)
    }
  }
  lines.push('')

  lines.push('## 日志 (最后 N 行)')
  lines.push('### main.log')
  lines.push('```')
  lines.push((d.logs?.mainTail || '').split('\n').slice(-80).join('\n'))
  lines.push('```')
  lines.push('### backend.log')
  lines.push('```')
  lines.push((d.logs?.backendTail || '').split('\n').slice(-80).join('\n'))
  lines.push('```')
  lines.push('### openclaw.log (灵境主进程捕获)')
  lines.push('```')
  lines.push((d.logs?.openclawTail || '').split('\n').slice(-40).join('\n'))
  lines.push('```')
  if (d.logs?.daemonLog) {
    lines.push(`### OpenClaw daemon 自身日志 (\`${d.logs.daemonLog.name}\`)`)
    lines.push('```')
    lines.push((d.logs.daemonLog.tail || '').split('\n').slice(-60).join('\n'))
    lines.push('```')
  }
  return lines.join('\n')
}

onMounted(() => {
  // 进设置页就预读一次,这样用户点"复制"立刻有内容
  handleRefreshLogs().catch(() => { /* 静默 */ })
})

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

    <!-- 应用更新 -->
    <section class="card">
      <h2 class="card-title">应用更新</h2>

      <div class="info-row">
        <span class="info-label">当前版本</span>
        <span class="info-value mono">v{{ appVersion }}</span>
      </div>

      <!-- idle / 检查中 / 已是最新 -->
      <div v-if="updateState === 'idle'" class="info-row">
        <span class="info-label">检查 GitHub Releases 是否有新版本</span>
        <NButton size="small" @click="handleCheckUpdate">检查更新</NButton>
      </div>

      <div v-else-if="updateState === 'checking'" class="info-row">
        <span class="info-label">检查中...</span>
        <NButton size="small" loading disabled>检查中</NButton>
      </div>

      <div v-else-if="updateState === 'up-to-date'" class="info-row update-ok">
        <span class="info-label">已是最新版本 ✓</span>
        <NButton size="small" @click="handleCheckUpdate">重新检查</NButton>
      </div>

      <!-- 发现新版本 -->
      <div v-else-if="updateState === 'available'" class="info-row update-available">
        <span class="info-label">
          发现新版本
          <strong class="cinnabar">v{{ updateLatestVersion }}</strong>
        </span>
        <NButton size="small" type="primary" @click="handleDownloadUpdate">下载更新</NButton>
      </div>

      <!-- 下载中 -->
      <div v-else-if="updateState === 'downloading'" class="info-row update-downloading">
        <span class="info-label">下载中 {{ updateProgressPercent }}%</span>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: updateProgressPercent + '%' }" />
        </div>
      </div>

      <!-- 下载完成 -->
      <div v-else-if="updateState === 'downloaded'" class="info-row update-ready">
        <span class="info-label">
          v{{ updateLatestVersion }} 已下载,重启应用安装
        </span>
        <NButton size="small" type="primary" @click="handleInstallUpdate">立即重启安装</NButton>
      </div>

      <!-- 错误 -->
      <div v-else-if="updateState === 'error'" class="info-row update-error">
        <span class="info-label cinnabar">{{ updateError || '更新出错' }}</span>
        <NButton size="small" @click="handleCheckUpdate">重试</NButton>
      </div>
    </section>

    <!-- 错误日志(反馈) -->
    <section class="card">
      <h2 class="card-title">错误日志</h2>

      <NAlert
        type="info"
        :bordered="false"
        :show-icon="false"
        style="margin-bottom: 14px;"
      >
        程序出问题了？把下面的日志复制后发给我们,定位问题更快:
        <br />
        <span class="feedback-line">
          📧 邮箱: <a class="feedback-link" :href="`mailto:${FEEDBACK_EMAIL}`">{{ FEEDBACK_EMAIL }}</a>
        </span>
      </NAlert>

      <NTabs v-model:value="logsActiveTab" type="line" size="small" animated>
        <NTabPane name="main" tab="主进程">
          <NInput
            :value="logsMain"
            type="textarea"
            readonly
            placeholder="日志加载中..."
            :autosize="{ minRows: 10, maxRows: 18 }"
            class="logs-textarea"
          />
        </NTabPane>
        <NTabPane name="backend" tab="后端">
          <NInput
            :value="logsBackend"
            type="textarea"
            readonly
            placeholder="日志加载中..."
            :autosize="{ minRows: 10, maxRows: 18 }"
            class="logs-textarea"
          />
        </NTabPane>
        <NTabPane name="openclaw" tab="OpenClaw">
          <div v-if="logsDetectedPort" class="oc-port-hint">
            ✓ 已探测到 OpenClaw 端口 <strong>{{ logsDetectedPort }}</strong>
          </div>
          <div v-else class="oc-port-hint warn">
            ⚠ 未探测到 OpenClaw 端口(18789-18795 都不在监听),AI 功能可能不可用。请把日志反馈给开发者。
          </div>
          <NInput
            :value="logsOpenClaw"
            type="textarea"
            readonly
            placeholder="日志加载中..."
            :autosize="{ minRows: 10, maxRows: 18 }"
            class="logs-textarea"
          />
        </NTabPane>
      </NTabs>

      <div class="action-row">
        <NSpace :size="8" wrap>
          <NButton type="primary" size="small" :loading="logsLoading" @click="handleCopyLogs">
            📋 复制全部日志
          </NButton>
          <NButton size="small" @click="handleOpenLogsFolder">
            📂 打开日志文件夹
          </NButton>
          <NButton size="small" :loading="logsLoading" @click="handleRefreshLogs">
            🔄 刷新
          </NButton>
          <NButton size="small" @click="handleOpenFeedbackEmail">
            ✉ 写邮件反馈
          </NButton>
          <NButton type="info" size="small" :loading="diagnoseLoading" @click="handleFullDiagnose">
            🔍 完整诊断报告
          </NButton>
        </NSpace>
      </div>
    </section>

    <!-- 关于 -->
    <section class="card">
      <h2 class="card-title">关于</h2>
      <div class="info-row">
        <span class="info-label">灵境</span>
        <span class="info-value mono">v{{ appVersion }}</span>
      </div>
      <div class="about-text">
        基于 OpenClaw Gateway 构建的桌面 AI 助手。Win / macOS 跨平台。
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ================================================================
 * 灵境 Settings —「极简东方」配色,跟 Login/Register 同体系
 * 单列卡片排列,大留白,余额用朱砂红强调
 * ================================================================ */
.settings-page {
  --cinnabar: #c8553d;
  --ink-soft: rgba(29, 29, 31, 0.72);
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 8px 64px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.page-head {
  margin-bottom: 36px;
  padding: 0 4px;
}

.page-title {
  font-family: 'Songti SC', 'STSong', 'SimSun', '宋体', serif;
  font-size: 30px;
  font-weight: 500;
  color: var(--n-text-color);
  margin: 0 0 8px;
  letter-spacing: 0.04em;
}

.page-subtitle {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0;
  letter-spacing: 0.08em;
}

.card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  padding: 22px 26px;
  margin-bottom: 16px;
  transition: border-color 0.15s ease;
}

.card:hover {
  border-color: rgba(29, 29, 31, 0.12);
}

/* 错误日志面板:textarea 用等宽字体方便阅读栈帧 */
.logs-textarea :deep(textarea) {
  font-family: 'JetBrains Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
}
.oc-port-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
  padding: 6px 10px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: rgba(40, 167, 69, 0.08);
}
.oc-port-hint.warn {
  background: rgba(200, 85, 61, 0.10);
  color: var(--cinnabar);
}
.feedback-line {
  display: inline-block;
  margin-top: 6px;
  font-size: 13px;
}
.feedback-link {
  color: var(--cinnabar);
  text-decoration: none;
  font-weight: 500;
}
.feedback-link:hover { text-decoration: underline; }

.card-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin: 0 0 18px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--n-divider-color);
  font-size: 13.5px;
  gap: 16px;
}

.info-row:last-child { border-bottom: none; }

/* 余额行用朱砂红强调 */
.info-row.highlight {
  padding: 14px 0;
}
.info-row.highlight .info-value.strong {
  font-family: 'Songti SC', 'STSong', serif;
  font-size: 22px;
  font-weight: 500;
  color: var(--cinnabar);
  letter-spacing: 0.02em;
}

.info-label {
  color: var(--n-text-color-3);
  flex-shrink: 0;
  letter-spacing: 0.04em;
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
  color: var(--n-text-color-3);
}

.action-row {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--n-divider-color);
}

.advanced-collapse {
  margin-bottom: 16px;
  border-radius: 12px;
  overflow: hidden;
}

.advanced-collapse :deep(.n-collapse-item__header) {
  padding: 18px 26px;
}

.advanced-collapse :deep(.n-collapse-item__header-main) {
  font-size: 11px;
  font-weight: 600;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.advanced-collapse :deep(.n-collapse-item__content-wrapper) {
  padding: 0 26px 18px;
}

.subcard {
  margin-top: 6px;
  margin-bottom: 0;
  background: rgba(29, 29, 31, 0.02);
  border-radius: 10px;
}

.subcard-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin: 0 0 14px;
}

.about-text {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--n-divider-color);
  line-height: 1.7;
  letter-spacing: 0.04em;
}

.cinnabar { color: var(--cinnabar); font-weight: 500; }

.update-available .info-label,
.update-ok .info-label {
  letter-spacing: 0.04em;
}

.update-downloading {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.update-downloading .info-label {
  font-size: 12.5px;
  color: var(--cinnabar);
  font-weight: 500;
}
.progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(29, 29, 31, 0.06);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--cinnabar);
  border-radius: 2px;
  transition: width 0.2s ease;
}

/* 暗色模式微调 */
:root[data-theme='dark'] .card:hover {
  border-color: rgba(245, 241, 232, 0.12);
}
:root[data-theme='dark'] .subcard {
  background: rgba(245, 241, 232, 0.03);
}
:root[data-theme='dark'] .info-row.highlight .info-value.strong {
  color: #e88068;
}
:root[data-theme='dark'] .progress-bar {
  background: rgba(245, 241, 232, 0.08);
}
</style>
