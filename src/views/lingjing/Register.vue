<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NInput, NCheckbox, NSteps, NStep, NAlert, useMessage } from 'naive-ui'
import * as lingjingAuth from '@/api/lingjing/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const message = useMessage()

const step = ref(1) // 1=邮箱, 2=验证码+密码, 3=完成

const email = ref('')
const verificationCode = ref('')
const password = ref('')
const passwordConfirm = ref('')
// 单页注册版式:点注册按钮即视作同意条款,不再显式勾选(footer 有文案提示)
const agreedTerms = ref(true)
const showPassword = ref(false)

const sending = ref(false)
const submitting = ref(false)
const error = ref('')
const countdown = ref(0)

const newMemberId = ref<string>('--')

let countdownTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))
const codeValid = computed(() => /^\d{6}$/.test(verificationCode.value))
const passwordValid = computed(() => password.value.length >= 8)
const passwordsMatch = computed(
  () => password.value === passwordConfirm.value && passwordConfirm.value.length > 0,
)
const passwordStrength = computed(() => {
  const p = password.value
  if (p.length < 8) return { level: 'weak', label: '弱', color: '#D9534F' }
  let score = 0
  if (/[a-z]/.test(p)) score += 1
  if (/[A-Z]/.test(p)) score += 1
  if (/\d/.test(p)) score += 1
  if (/[^a-zA-Z0-9]/.test(p)) score += 1
  if (p.length >= 12) score += 1
  if (score >= 4) return { level: 'strong', label: '强', color: '#28A745' }
  if (score >= 2) return { level: 'medium', label: '中', color: '#E0A800' }
  return { level: 'weak', label: '弱', color: '#D9534F' }
})

const canSendCode = computed(() => emailValid.value && countdown.value === 0 && !sending.value)
const canSubmit = computed(
  () =>
    codeValid.value &&
    passwordValid.value &&
    passwordsMatch.value &&
    agreedTerms.value &&
    !submitting.value,
)

function startCountdown(seconds = 60) {
  countdown.value = seconds
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      countdown.value = 0
      if (countdownTimer) clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

async function handleSendCode() {
  if (!emailValid.value) {
    error.value = '请输入有效的邮箱地址'
    return
  }
  sending.value = true
  error.value = ''
  try {
    const resp = await lingjingAuth.sendVerificationCode(email.value.trim())
    if (resp.success) {
      message.success('验证码已发送,请查收邮箱')
      startCountdown(60)
      step.value = 2
    } else {
      error.value = resp.message || '发送失败,请稍后重试'
    }
  } catch (e: any) {
    error.value = e?.response?.data?.message || e?.message || '网络错误,请稍后重试'
  } finally {
    sending.value = false
  }
}

async function handleSubmit() {
  if (!canSubmit.value) return

  if (!passwordsMatch.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const regResp = await lingjingAuth.register({
      email: email.value.trim(),
      password: password.value,
      verificationCode: verificationCode.value,
    })
    if (!regResp.success) {
      error.value = regResp.message || '注册失败,请检查验证码'
      submitting.value = false
      return
    }

    // 注册成功后自动登录,拿到 user.id 作为创客编号
    const ok = await authStore.login(email.value.trim(), password.value)
    if (ok) {
      newMemberId.value = authStore.memberId
      step.value = 3
    } else {
      error.value = authStore.error || '注册成功,但自动登录失败,请返回登录页'
    }
  } catch (e: any) {
    error.value = e?.response?.data?.message || e?.message || '网络错误,请稍后重试'
  } finally {
    submitting.value = false
  }
}

async function copyMemberId() {
  try {
    await navigator.clipboard.writeText(newMemberId.value)
    message.success('已复制创客编号')
  } catch {
    message.error('复制失败,请手动选中')
  }
}

function enterApp() {
  router.replace('/')
}

function goBackToLogin() {
  router.push({ name: 'Login' })
}
</script>

<template>
  <div class="register-stage">
    <!-- 左栏:意境侧 (跟 Login 「灵 / 境」呼应,Register 用 「同 / 道」) -->
    <aside class="pillar">
      <div class="wordmark" aria-label="同道">
        <span class="wordmark-char wordmark-char--1">同</span>
        <span class="wordmark-char wordmark-char--2">道</span>
      </div>
      <p class="tagline">找到与你同道的智能体</p>
      <div class="seal" title="加入灵境">
        <span class="seal-num">新</span>
      </div>
    </aside>

    <!-- 右栏:功能侧 -->
    <main class="form-side">
      <div class="form-wrapper">

      <NAlert
        v-if="error && step !== 3"
        type="error"
        :bordered="false"
        :show-icon="true"
        class="register-alert"
      >
        {{ error }}
      </NAlert>

      <!-- 单页注册:邮箱/密码/确认/验证码全部一起 -->
      <div v-if="step !== 3" class="step-panel">
        <header class="form-header">
          <h2 class="form-title">创建账号</h2>
          <p class="form-sub">免费注册,即刻开始使用</p>
        </header>

        <div class="form-item">
          <label class="form-label">邮箱</label>
          <NInput
            v-model:value="email"
            placeholder="your@example.com"
            size="large"
            class="register-input"
            autofocus
          />
          <div class="field-hint">用作登录账号 + 接收通知</div>
        </div>

        <div class="form-item">
          <label class="form-label">密码</label>
          <div class="password-wrapper">
            <NInput
              v-model:value="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="至少 8 位"
              size="large"
              class="register-input"
            />
            <button
              type="button"
              class="password-toggle"
              tabindex="-1"
              @click="showPassword = !showPassword"
            >
              <svg
                v-if="showPassword"
                xmlns="http://www.w3.org/2000/svg"
                width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              <svg
                v-else
                xmlns="http://www.w3.org/2000/svg"
                width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
          <div class="strength-row" v-if="password.length > 0">
            <div class="strength-bar">
              <div
                class="strength-fill"
                :style="{
                  width:
                    passwordStrength.level === 'weak'
                      ? '33%'
                      : passwordStrength.level === 'medium'
                      ? '66%'
                      : '100%',
                  background: passwordStrength.color,
                }"
              />
            </div>
            <span class="strength-label" :style="{ color: passwordStrength.color }">
              {{ passwordStrength.label }}
            </span>
          </div>
        </div>

        <div class="form-item">
          <label class="form-label">确认密码</label>
          <NInput
            v-model:value="passwordConfirm"
            :type="showPassword ? 'text' : 'password'"
            placeholder="再次输入密码"
            size="large"
            class="register-input"
          />
          <div class="mismatch-hint" v-if="passwordConfirm.length > 0 && !passwordsMatch">
            两次密码不一致
          </div>
        </div>

        <div class="form-item">
          <label class="form-label">邮箱验证码</label>
          <NInput
            v-model:value="verificationCode"
            placeholder="请输入 6 位验证码"
            size="large"
            maxlength="6"
            class="register-input"
            @keydown.enter="canSubmit && handleSubmit()"
          />
          <div class="code-row">
            <span class="field-hint">验证码发送到注册邮箱</span>
            <button
              type="button"
              class="resend-link"
              :disabled="!canSendCode"
              @click="handleSendCode"
            >
              {{ countdown > 0 ? `${countdown}s 后可重发` : (sending ? '发送中...' : '获取验证码') }}
            </button>
          </div>
        </div>

        <NButton
          type="primary"
          block
          size="large"
          class="register-btn"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          免费注册
        </NButton>

        <div class="terms-text">
          注册即表示同意《用户协议》和《隐私政策》
        </div>

        <div class="register-footer">
          <span class="footer-text">已有账号?</span>
          <button class="footer-link" @click="goBackToLogin">立即登录</button>
        </div>
      </div>

      <!-- Step 3: 欢迎页 -->
      <div v-else class="step-panel done-panel">
        <div class="checkmark" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            <circle cx="28" cy="28" r="26" stroke="currentColor" stroke-width="1.5" fill="none" />
            <path
              d="M16 29 L25 38 L41 20"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <h2 class="done-title">欢迎加入灵境</h2>
        <p class="done-desc">你的创客编号已生成,请妥善保留。</p>

        <div class="member-id-card">
          <div class="member-id-label">创客编号</div>
          <div class="member-id-value">NO. {{ newMemberId }}</div>
          <button class="copy-btn" @click="copyMemberId">复制</button>
        </div>

        <p class="done-tip">编号已与你的邮箱绑定,可在"设置"中随时查看。</p>

        <NButton
          type="primary"
          block
          size="large"
          class="register-btn"
          @click="enterApp"
        >
          开始使用
        </NButton>
      </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* ================================================================
 * 灵境 Register —「极简东方」编排,跟 Login 同体系
 * 左:同/道 + 朱砂红「新」印章;右:NSteps 三步表单
 * ================================================================ */
.register-stage {
  --ink: #1d1d1f;
  --paper: #f5f1e8;
  --paper-deep: #ece6d3;
  --cinnabar: #c8553d;
  --muted: #6e6e73;
  --muted-soft: #a89e87;

  min-height: 100vh;
  width: 100%;
  display: grid;
  grid-template-columns: 55fr 45fr;
  background: var(--paper);
  background-image:
    radial-gradient(ellipse 80% 60% at 20% 20%, rgba(200, 85, 61, 0.025), transparent 60%),
    radial-gradient(ellipse 70% 50% at 90% 90%, rgba(29, 29, 31, 0.03), transparent 60%);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
  color: var(--ink);
  -webkit-app-region: drag;
  overflow: hidden;
  position: relative;
}

.register-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(0deg, rgba(29, 29, 31, 0.013) 0px, transparent 1px, transparent 2px),
    repeating-linear-gradient(90deg, rgba(29, 29, 31, 0.013) 0px, transparent 1px, transparent 3px);
  pointer-events: none;
  z-index: 0;
}

/* ====== 左栏 ====== */
.pillar {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 96px 64px 64px 96px;
  border-right: 1px solid rgba(29, 29, 31, 0.06);
  z-index: 1;
}

.wordmark {
  display: flex;
  flex-direction: column;
  font-family: 'Songti SC', 'STSong', 'SimSun', '宋体', serif;
  font-size: clamp(96px, 12vw, 168px);
  font-weight: 500;
  line-height: 0.95;
  letter-spacing: 0.04em;
  color: var(--ink);
  margin-bottom: 32px;
  user-select: none;
}

.wordmark-char {
  display: block;
  opacity: 0;
  transform: translateY(28px);
  filter: blur(6px);
  animation: ink-drop 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.wordmark-char--1 { animation-delay: 0.2s; }
.wordmark-char--2 { animation-delay: 0.55s; }

@keyframes ink-drop {
  60% { filter: blur(0); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

.tagline {
  font-size: 14px;
  letter-spacing: 0.18em;
  color: var(--muted);
  margin: 0 0 0 4px;
  opacity: 0;
  transform: translateY(12px);
  animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.85s forwards;
}

.seal {
  position: absolute;
  bottom: 64px;
  left: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border: 2px solid var(--cinnabar);
  background: var(--cinnabar);
  color: var(--paper);
  font-family: 'Songti SC', 'STSong', 'SimSun', '宋体', serif;
  font-size: 22px;
  font-weight: 600;
  border-radius: 4px;
  transform: rotate(-4deg);
  box-shadow: 0 2px 8px rgba(200, 85, 61, 0.22);
  opacity: 0;
  animation: seal-stamp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 1.4s forwards;
}

.seal::before {
  content: '';
  position: absolute;
  inset: 4px;
  border: 1px solid rgba(245, 241, 232, 0.6);
  border-radius: 2px;
  pointer-events: none;
}

@keyframes seal-stamp {
  0% { opacity: 0; transform: rotate(0deg) scale(1.6); }
  60% { opacity: 1; transform: rotate(-4deg) scale(0.92); }
  100% { opacity: 1; transform: rotate(-4deg) scale(1); }
}

@keyframes rise {
  to { opacity: 1; transform: translateY(0); }
}

/* ====== 右栏 ====== */
.form-side {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px);
  z-index: 1;
  overflow-y: auto;
}

.form-wrapper {
  width: 100%;
  max-width: 380px;
  -webkit-app-region: no-drag;
  opacity: 0;
  animation: rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) 1.0s forwards;
}

.register-steps { display: none; } /* 单页布局,不再用 */

.register-alert {
  margin-bottom: 16px;
  border-radius: 8px;
}

.form-header {
  margin-bottom: 28px;
}
.form-title {
  font-family: 'Songti SC', 'STSong', 'SimSun', '宋体', serif;
  font-size: 32px;
  font-weight: 500;
  color: var(--ink);
  margin: 0 0 8px;
  letter-spacing: 0.02em;
}
.form-sub {
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 0.1em;
  margin: 0;
}

.field-hint {
  font-size: 11.5px;
  color: var(--muted-soft);
  margin-top: 6px;
  letter-spacing: 0.04em;
}

.password-wrapper { position: relative; }

.password-toggle {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--muted-soft);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.18s ease;
  z-index: 2;
}
.password-toggle:hover { color: var(--ink); }

.code-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  gap: 12px;
}

.terms-text {
  margin-top: 14px;
  font-size: 11.5px;
  color: var(--muted-soft);
  text-align: center;
  letter-spacing: 0.04em;
}

.step-panel {
  display: flex;
  flex-direction: column;
}

.step-desc {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 22px;
  line-height: 1.6;
  letter-spacing: 0.04em;
}

.step-desc strong {
  color: var(--ink);
  font-weight: 500;
}

.form-item {
  margin-bottom: 18px;
  position: relative;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.register-input {
  border-radius: 8px;
}

.resend-link {
  background: none;
  border: none;
  color: var(--cinnabar);
  font-size: 12px;
  cursor: pointer;
  padding: 8px 0 0 0;
  font-family: inherit;
  font-weight: 500;
}

.resend-link:disabled {
  color: var(--muted-soft);
  cursor: not-allowed;
}

.strength-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.strength-bar {
  flex: 1;
  height: 3px;
  background: rgba(29, 29, 31, 0.06);
  border-radius: 2px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.2s ease, background 0.2s ease;
}

.strength-label {
  font-size: 12px;
  font-weight: 500;
  min-width: 18px;
  text-align: right;
}

.mismatch-hint {
  display: inline-block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--cinnabar);
}

.terms-row {
  display: flex;
  align-items: center;
  margin-top: 6px;
  margin-bottom: 22px;
}

.register-btn {
  border-radius: 8px;
  height: 44px;
  font-weight: 500;
  font-size: 14px;
  letter-spacing: 0.1em;
  margin-top: 4px;
}

.register-footer {
  margin-top: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

.footer-text {
  margin-right: 6px;
}

.footer-link {
  background: none;
  border: none;
  color: var(--cinnabar);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  padding: 0;
  font-weight: 500;
  position: relative;
}
.footer-link::after {
  content: '';
  position: absolute;
  left: 0; right: 0;
  bottom: -2px;
  height: 1px;
  background: var(--cinnabar);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.footer-link:hover::after { transform: scaleX(1); }

/* ====== Step 3 完成页 ====== */
.done-panel {
  text-align: center;
}

.checkmark {
  display: flex;
  justify-content: center;
  margin: 8px 0 22px;
  color: var(--cinnabar);
}

.done-title {
  font-family: 'Songti SC', 'STSong', 'SimSun', '宋体', serif;
  font-size: 26px;
  font-weight: 500;
  color: var(--ink);
  margin-bottom: 10px;
  letter-spacing: 0.02em;
}

.done-desc {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 28px;
  letter-spacing: 0.06em;
}

.member-id-card {
  background: rgba(255, 255, 255, 0.55);
  border-radius: 10px;
  padding: 22px 18px;
  margin-bottom: 14px;
  border: 1px solid rgba(29, 29, 31, 0.08);
  position: relative;
}

.member-id-label {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 6px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.member-id-value {
  font-family: 'Songti SC', 'STSong', serif;
  font-size: 26px;
  font-weight: 500;
  color: var(--ink);
  letter-spacing: 0.05em;
  font-variant-numeric: tabular-nums;
}

.copy-btn {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(200, 85, 61, 0.1);
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--cinnabar);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 500;
  transition: background 0.15s ease;
}

.copy-btn:hover { background: rgba(200, 85, 61, 0.18); }

.done-tip {
  font-size: 12px;
  color: var(--muted-soft);
  margin-bottom: 22px;
  line-height: 1.6;
  letter-spacing: 0.05em;
}

/* ====== 暗色模式 ====== */
:root[data-theme='dark'] .register-stage {
  --ink: #ece6d3;
  --paper: #161618;
  --paper-deep: #1f1f22;
  --muted: #98989d;
  --muted-soft: #6e6960;
  background: var(--paper);
  background-image:
    radial-gradient(ellipse 80% 60% at 20% 20%, rgba(200, 85, 61, 0.04), transparent 60%),
    radial-gradient(ellipse 70% 50% at 90% 90%, rgba(245, 241, 232, 0.025), transparent 60%);
}
:root[data-theme='dark'] .register-stage::before {
  background-image:
    repeating-linear-gradient(0deg, rgba(245, 241, 232, 0.018) 0px, transparent 1px, transparent 2px),
    repeating-linear-gradient(90deg, rgba(245, 241, 232, 0.018) 0px, transparent 1px, transparent 3px);
}
:root[data-theme='dark'] .pillar {
  border-right-color: rgba(245, 241, 232, 0.06);
}
:root[data-theme='dark'] .form-side {
  background: rgba(0, 0, 0, 0.18);
}
:root[data-theme='dark'] .strength-bar {
  background: rgba(245, 241, 232, 0.08);
}
:root[data-theme='dark'] .member-id-card {
  background: rgba(245, 241, 232, 0.04);
  border-color: rgba(245, 241, 232, 0.08);
}

/* ====== 小屏:堆叠 ====== */
@media (max-width: 900px) {
  .register-stage {
    grid-template-columns: 1fr;
    grid-template-rows: 36vh 1fr;
  }
  .pillar {
    padding: 48px 36px 24px;
    border-right: none;
    border-bottom: 1px solid rgba(29, 29, 31, 0.06);
  }
  .wordmark { font-size: clamp(64px, 16vw, 120px); }
  .seal { bottom: 32px; left: auto; right: 36px; }
  .form-side { padding: 36px 24px; }
}
</style>
