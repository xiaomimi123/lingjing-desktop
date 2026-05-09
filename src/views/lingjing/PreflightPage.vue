<script setup lang="ts">
/**
 * v1.3.0 自检页 — 登录后强制经过的关卡。
 * 6 步逐个验证 + 修复 + 测试,任何一步失败可重试。
 * 全过 → 写 sessionStorage 标记 → router guard 放行 → 跳目标页。
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NButton, NSpace, useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const authStore = useAuthStore()

type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

interface Step {
  key: string
  label: string
  required: boolean
  status: StepStatus
  durationMs: number | null
  message: string
  detail: any
}

const steps = ref<Step[]>([
  { key: 'backend',   label: '后端服务',         required: true,  status: 'pending', durationMs: null, message: '', detail: null },
  { key: 'cleanup',   label: '清理旧版本残留',    required: false, status: 'pending', durationMs: null, message: '', detail: null },
  { key: 'openclaw',  label: '启动本地网关',      required: true,  status: 'pending', durationMs: null, message: '', detail: null },
  { key: 'configure', label: '配置模型 Token',   required: true,  status: 'pending', durationMs: null, message: '', detail: null },
  { key: 'testchat',  label: '测试一次对话',      required: true,  status: 'pending', durationMs: null, message: '', detail: null },
  { key: 'hermes',    label: '启动 Hermes (可选)', required: false, status: 'pending', durationMs: null, message: '', detail: null },
])

const overallRunning = ref(false)
const failedStepIdx = ref<number>(-1)
const startedAt = ref<number>(0)
const elapsed = ref<number>(0)
let elapsedTimer: number | null = null

const totalDurationMs = computed(() =>
  steps.value.reduce((sum, s) => sum + (s.durationMs || 0), 0),
)
const allPassed = computed(() =>
  steps.value.every((s) => s.status === 'success' || (s.status === 'failed' && !s.required) || s.status === 'skipped'),
)

function fmtDuration(ms: number | null): string {
  if (ms == null) return '--'
  if (ms < 1000) return ms + ' ms'
  return (ms / 1000).toFixed(1) + ' s'
}

function setStep(idx: number, patch: Partial<Step>) {
  steps.value[idx] = { ...steps.value[idx], ...patch }
}

async function runStep(idx: number): Promise<boolean> {
  const step = steps.value[idx]
  setStep(idx, { status: 'running', message: '', durationMs: null, detail: null })

  const bridge = (window as any).lingjing
  if (!bridge?.preflight) {
    setStep(idx, { status: 'failed', message: 'Electron 桥接未注入,请重启应用', durationMs: 0 })
    return false
  }

  try {
    let r: any
    switch (step.key) {
      case 'backend':
        r = await bridge.preflight.backendHealth()
        break
      case 'cleanup':
        r = await bridge.preflight.cleanupStale()
        break
      case 'openclaw':
        r = await bridge.preflight.startOpenClaw()
        break
      case 'configure': {
        // configure 实际通过现有 autoConfigureViaMain 完成,失败记录详细信息
        const modelId = (authStore as any).getSelectedModel?.() || 'gpt-5.4'
        const cfg = await bridge.autoConfigureViaMain?.({ modelId })
        const ok = cfg?.openclaw === 'ok'
        r = {
          ok,
          durationMs: 0,
          message: ok ? '' : (cfg?.openclawMessage || cfg?.message || '配置失败'),
          detail: cfg,
        }
        break
      }
      case 'testchat':
        r = await bridge.preflight.testChat()
        break
      case 'hermes':
        r = await bridge.preflight.startHermes()
        break
      default:
        r = { ok: false, message: 'unknown step' }
    }
    setStep(idx, {
      status: r.ok ? 'success' : 'failed',
      durationMs: r.durationMs ?? 0,
      message: r.message || r.warning || '',
      detail: r,
    })
    return !!r.ok
  } catch (e: any) {
    setStep(idx, {
      status: 'failed',
      durationMs: 0,
      message: e?.message || String(e),
      detail: { error: String(e) },
    })
    return false
  }
}

async function runAll() {
  overallRunning.value = true
  failedStepIdx.value = -1
  startedAt.value = Date.now()
  if (elapsedTimer) window.clearInterval(elapsedTimer)
  elapsedTimer = window.setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startedAt.value) / 1000)
  }, 200)

  for (let i = 0; i < steps.value.length; i++) {
    const ok = await runStep(i)
    if (!ok && steps.value[i].required) {
      failedStepIdx.value = i
      overallRunning.value = false
      if (elapsedTimer) { window.clearInterval(elapsedTimer); elapsedTimer = null }
      return
    }
    // 非 required 失败也继续(标 failed 但不阻塞)
  }

  overallRunning.value = false
  if (elapsedTimer) { window.clearInterval(elapsedTimer); elapsedTimer = null }

  // 全部 required 都过 → 标记通过 + 跳目标页
  sessionStorage.setItem('lingjing-preflight-passed', 'ok')
  sessionStorage.setItem('lingjing-preflight-last-result', JSON.stringify(steps.value))
  message.success('自检全部通过,正在进入应用...')
  setTimeout(() => {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect)
  }, 800)
}

async function retryFailed() {
  if (failedStepIdx.value < 0) return
  const idx = failedStepIdx.value
  failedStepIdx.value = -1
  overallRunning.value = true
  // 从失败那步往后重跑
  for (let i = idx; i < steps.value.length; i++) {
    const ok = await runStep(i)
    if (!ok && steps.value[i].required) {
      failedStepIdx.value = i
      overallRunning.value = false
      return
    }
  }
  overallRunning.value = false
  sessionStorage.setItem('lingjing-preflight-passed', 'ok')
  sessionStorage.setItem('lingjing-preflight-last-result', JSON.stringify(steps.value))
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.replace(redirect)
}

function skipAndContinue() {
  // 应急出口:用户在线诊断时,绕过自检直接进 app(高级用户/开发者)
  sessionStorage.setItem('lingjing-preflight-passed', 'ok')
  sessionStorage.setItem('lingjing-preflight-skipped', '1')
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.replace(redirect)
}

async function copyDiagnostic() {
  const bridge = (window as any).lingjing
  let logs: any = null
  if (bridge?.getErrorLogs) {
    try { logs = await bridge.getErrorLogs() } catch { /* ignore */ }
  }
  const header = `=== 灵境 自检失败诊断 ===\n版本: v${logs?.version || '?'}\n平台: ${logs?.platform || '?'} / ${logs?.arch || '?'}\n时间: ${new Date().toISOString()}\n\n=== 自检 6 步结果 ===\n`
  const stepDump = steps.value.map((s, i) => {
    return `${i + 1}. [${s.status.toUpperCase()}] ${s.label}  耗时=${fmtDuration(s.durationMs)}\n   ${s.message || ''}\n   detail: ${JSON.stringify(s.detail).slice(0, 500)}`
  }).join('\n\n')
  const logTail = logs ? `\n\n=== main.log 最后 80 行 ===\n${(logs.main || '').split('\n').slice(-80).join('\n')}\n\n=== backend.log 最后 80 行 ===\n${(logs.backend || '').split('\n').slice(-80).join('\n')}\n\n=== openclaw.log 最后 80 行 ===\n${(logs.openclaw || '').split('\n').slice(-80).join('\n')}` : ''
  const payload = header + stepDump + logTail
  try {
    await navigator.clipboard.writeText(payload)
    message.success('已复制完整诊断到剪贴板,请粘贴到邮件 1186453507@qq.com')
  } catch (e: any) {
    message.error('复制失败: ' + (e?.message || ''))
  }
}

function openFeedbackEmail() {
  const subject = encodeURIComponent('灵境 自检失败反馈')
  const body = encodeURIComponent('请在下方粘贴诊断信息(已复制到剪贴板),并描述你的操作:\n\n')
  window.open(`mailto:1186453507@qq.com?subject=${subject}&body=${body}`, '_self')
}

onMounted(() => {
  // 自动开跑
  runAll()
})
</script>

<template>
  <div class="preflight-root">
    <div class="preflight-card">
      <header class="head">
        <h1 class="title">正在准备您的 AI 助手</h1>
        <p class="subtitle">
          首次启动需 1-2 分钟,通过后即可正常对话
          <span v-if="overallRunning" class="elapsed">(已用 {{ elapsed }}s)</span>
          <span v-else-if="allPassed && failedStepIdx === -1" class="elapsed ok">总耗时 {{ fmtDuration(totalDurationMs) }}</span>
        </p>
      </header>

      <ol class="step-list">
        <li v-for="(step, i) in steps" :key="step.key" class="step-row" :class="step.status">
          <span class="step-icon">
            <span v-if="step.status === 'success'">✓</span>
            <span v-else-if="step.status === 'failed' && step.required">✗</span>
            <span v-else-if="step.status === 'failed'">!</span>
            <span v-else-if="step.status === 'running'" class="spinner">⏳</span>
            <span v-else-if="step.status === 'skipped'">○</span>
            <span v-else>○</span>
          </span>
          <span class="step-label">{{ step.label }}</span>
          <span class="step-meta">
            <span v-if="step.durationMs != null" class="duration">{{ fmtDuration(step.durationMs) }}</span>
            <span v-if="step.message" class="msg">{{ step.message }}</span>
          </span>
        </li>
      </ol>

      <div v-if="failedStepIdx >= 0" class="fail-panel">
        <h3>第 {{ failedStepIdx + 1 }} 步失败 — 「{{ steps[failedStepIdx].label }}」</h3>
        <p class="fail-msg">{{ steps[failedStepIdx].message || '(无详细错误)' }}</p>
        <div class="fail-hints">
          <p v-if="steps[failedStepIdx].key === 'openclaw'">可能原因: 杀毒软件拦截 / 系统权限不足 / 端口 18789-18795 全被占</p>
          <p v-if="steps[failedStepIdx].key === 'configure'">可能原因: 灵境账号已退出 / Token 已失效 → 退出登录重新登</p>
          <p v-if="steps[failedStepIdx].key === 'testchat'">可能原因: Provider Token 配置陈旧 / 灵境云端 API 暂时不可达 / 网络问题</p>
          <p v-if="steps[failedStepIdx].key === 'backend'">可能原因: 后端进程崩溃 / 端口被占 → 重启应用</p>
        </div>
        <NSpace :size="8" wrap>
          <NButton type="primary" :loading="overallRunning" @click="retryFailed">🔄 从失败步骤重试</NButton>
          <NButton @click="copyDiagnostic">📋 复制诊断信息</NButton>
          <NButton @click="openFeedbackEmail">✉ 反馈给开发者</NButton>
          <NButton tertiary type="warning" @click="skipAndContinue">⏭ 跳过(可能聊天不可用)</NButton>
        </NSpace>
      </div>

      <div v-else-if="overallRunning" class="status-running">
        正在执行...
      </div>

      <div v-else-if="allPassed" class="status-ok">
        ✓ 全部通过,即将进入应用...
      </div>
    </div>
  </div>
</template>

<style scoped>
.preflight-root {
  --cinnabar: #c8553d;
  --paper: #f5f1e8;
  --ink: #1d1d1f;
  --muted: rgba(29, 29, 31, 0.55);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  padding: 24px;
}
.preflight-card {
  background: white;
  border-radius: 16px;
  padding: 40px 48px;
  max-width: 640px;
  width: 100%;
  box-shadow: 0 4px 32px rgba(29, 29, 31, 0.08);
  border: 1px solid rgba(29, 29, 31, 0.06);
}
.head { margin-bottom: 32px; }
.title {
  font-family: 'Songti SC', 'STSong', serif;
  font-size: 26px;
  font-weight: 500;
  margin: 0 0 8px;
  color: var(--ink);
  letter-spacing: 0.04em;
}
.subtitle {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
}
.elapsed { margin-left: 6px; font-variant-numeric: tabular-nums; }
.elapsed.ok { color: #28a745; }

.step-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
}
.step-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
  font-size: 14px;
  border-bottom: 1px dashed rgba(29, 29, 31, 0.06);
  transition: background 0.15s;
}
.step-row:last-child { border-bottom: none; }
.step-row.success { color: #28a745; }
.step-row.failed { color: var(--cinnabar); background: rgba(200, 85, 61, 0.04); }
.step-row.running { color: var(--ink); font-weight: 500; }
.step-row.pending { color: rgba(29, 29, 31, 0.35); }

.step-icon {
  display: inline-block;
  width: 24px;
  text-align: center;
  font-size: 14px;
  font-weight: bold;
}
.step-icon .spinner {
  animation: spin 1.5s linear infinite;
  display: inline-block;
}
@keyframes spin {
  from { transform: rotate(0); }
  to   { transform: rotate(360deg); }
}
.step-label {
  flex: 1;
  margin-left: 8px;
}
.step-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
.duration {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.msg {
  color: var(--cinnabar);
  font-size: 11px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fail-panel {
  margin-top: 20px;
  padding: 20px;
  background: rgba(200, 85, 61, 0.06);
  border: 1px solid rgba(200, 85, 61, 0.18);
  border-radius: 10px;
}
.fail-panel h3 {
  margin: 0 0 8px;
  color: var(--cinnabar);
  font-size: 15px;
}
.fail-msg {
  margin: 0 0 12px;
  font-size: 13px;
  font-family: 'JetBrains Mono', Menlo, Consolas, monospace;
  background: white;
  padding: 8px 12px;
  border-radius: 6px;
  word-break: break-all;
}
.fail-hints p {
  margin: 4px 0;
  font-size: 12px;
  color: var(--muted);
}

.status-running, .status-ok {
  text-align: center;
  padding: 16px;
  font-size: 13px;
  color: var(--muted);
}
.status-ok { color: #28a745; font-weight: 500; }
</style>
