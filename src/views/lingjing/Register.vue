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
const agreedTerms = ref(false)
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
  <div class="register-container">
    <div class="register-wrapper">
      <div class="register-brand-wordmark">灵境</div>

      <NSteps :current="step" size="small" class="register-steps">
        <NStep title="邮箱" />
        <NStep title="验证 + 密码" />
        <NStep title="完成" />
      </NSteps>

      <NAlert
        v-if="error && step !== 3"
        type="error"
        :bordered="false"
        :show-icon="true"
        class="register-alert"
      >
        {{ error }}
      </NAlert>

      <!-- Step 1: 邮箱 -->
      <div v-if="step === 1" class="step-panel">
        <p class="step-desc">输入你的邮箱,我们会发一封 6 位验证码到那里。</p>
        <div class="form-item">
          <label class="form-label">邮箱</label>
          <NInput
            v-model:value="email"
            placeholder="name@example.com"
            size="large"
            class="register-input"
            autofocus
            @keydown.enter="canSendCode && handleSendCode()"
          />
        </div>
        <NButton
          type="primary"
          block
          size="large"
          class="register-btn"
          :loading="sending"
          :disabled="!canSendCode"
          @click="handleSendCode"
        >
          {{ countdown > 0 ? `${countdown}s 后可重发` : '获取验证码' }}
        </NButton>
        <div class="register-footer">
          <span class="footer-text">已有账号?</span>
          <button class="footer-link" @click="goBackToLogin">返回登录</button>
        </div>
      </div>

      <!-- Step 2: 验证码 + 密码 -->
      <div v-else-if="step === 2" class="step-panel">
        <p class="step-desc">
          验证码已发送至 <strong>{{ email }}</strong>
        </p>
        <div class="form-item">
          <label class="form-label">验证码</label>
          <NInput
            v-model:value="verificationCode"
            placeholder="6 位数字"
            size="large"
            maxlength="6"
            class="register-input"
            autofocus
          />
          <button
            class="resend-link"
            :disabled="!canSendCode"
            @click="handleSendCode"
          >
            {{ countdown > 0 ? `${countdown}s 后可重发` : '重新发送' }}
          </button>
        </div>

        <div class="form-item">
          <label class="form-label">密码</label>
          <NInput
            v-model:value="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="至少 8 位"
            size="large"
            class="register-input"
          />
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
            placeholder="再输一次"
            size="large"
            class="register-input"
            @keydown.enter="canSubmit && handleSubmit()"
          />
          <div class="strength-row" v-if="passwordConfirm.length > 0 && !passwordsMatch">
            <span class="mismatch-hint">两次密码不一致</span>
          </div>
        </div>

        <div class="form-item terms-row">
          <NCheckbox v-model:checked="agreedTerms">我同意《用户协议》和《隐私政策》</NCheckbox>
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
          完成注册
        </NButton>

        <div class="register-footer">
          <button class="footer-link" @click="step = 1">修改邮箱</button>
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
  </div>
</template>

<style scoped>
.register-container {
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f7;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
  -webkit-app-region: drag;
  padding: 32px 16px;
}

.register-wrapper {
  width: 100%;
  max-width: 420px;
  -webkit-app-region: no-drag;
}

.register-brand-wordmark {
  text-align: center;
  font-size: 30px;
  font-weight: 200;
  letter-spacing: 0.4em;
  padding-left: 0.4em;
  color: #1f1f1f;
  margin-bottom: 28px;
}

.register-steps {
  margin-bottom: 28px;
}

.register-alert {
  margin-bottom: 16px;
}

.step-panel {
  display: flex;
  flex-direction: column;
}

.step-desc {
  font-size: 13px;
  color: #6e6e73;
  margin-bottom: 18px;
  line-height: 1.5;
}

.step-desc strong {
  color: #1f1f1f;
  font-weight: 500;
}

.form-item {
  margin-bottom: 14px;
  position: relative;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #1f1f1f;
  margin-bottom: 6px;
}

.register-input {
  border-radius: 6px;
}

.resend-link {
  background: none;
  border: none;
  color: var(--n-text-color);
  font-size: 12px;
  cursor: pointer;
  padding: 6px 0 0 0;
  font-family: inherit;
}

.resend-link:disabled {
  color: #b0b0b8;
  cursor: not-allowed;
}

.strength-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.strength-bar {
  flex: 1;
  height: 3px;
  background: rgba(0, 0, 0, 0.06);
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
  color: #d9534f;
}

.terms-row {
  display: flex;
  align-items: center;
  margin-top: 6px;
  margin-bottom: 18px;
}

.register-btn {
  border-radius: 6px;
  height: 40px;
  font-weight: 500;
  font-size: 14px;
}

.register-footer {
  margin-top: 18px;
  text-align: center;
  font-size: 13px;
  color: #6e6e73;
}

.footer-text {
  margin-right: 6px;
}

.footer-link {
  background: none;
  border: none;
  color: var(--n-text-color);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  padding: 0;
}

.footer-link:hover {
  color: var(--n-text-color-disabled);
}

.done-panel {
  text-align: center;
}

.checkmark {
  display: flex;
  justify-content: center;
  margin: 8px 0 18px;
}

.done-title {
  font-size: 22px;
  font-weight: 500;
  color: #1f1f1f;
  margin-bottom: 6px;
}

.done-desc {
  font-size: 13px;
  color: #6e6e73;
  margin-bottom: 22px;
}

.member-id-card {
  background: #ffffff;
  border-radius: 10px;
  padding: 22px 18px;
  margin-bottom: 14px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  position: relative;
}

.member-id-label {
  font-size: 12px;
  color: #6e6e73;
  margin-bottom: 6px;
  letter-spacing: 0.05em;
}

.member-id-value {
  font-size: 26px;
  font-weight: 300;
  color: #1f1f1f;
  letter-spacing: 0.05em;
  font-variant-numeric: tabular-nums;
}

.copy-btn {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(31, 78, 121, 0.08);
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--n-text-color);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s ease;
}

.copy-btn:hover {
  background: rgba(31, 78, 121, 0.14);
}

.done-tip {
  font-size: 12px;
  color: #8e8e93;
  margin-bottom: 22px;
  line-height: 1.5;
}

:root[data-theme='dark'] .register-container { background: #1c1c1e; }
:root[data-theme='dark'] .register-brand-wordmark { color: #f2f2f7; }
:root[data-theme='dark'] .step-desc { color: #98989d; }
:root[data-theme='dark'] .step-desc strong { color: #f2f2f7; }
:root[data-theme='dark'] .form-label { color: #f2f2f7; }
:root[data-theme='dark'] .register-footer { color: #98989d; }
:root[data-theme='dark'] .footer-link { color: #4d8ec5; }
:root[data-theme='dark'] .footer-link:hover { color: #6ea8d6; }
:root[data-theme='dark'] .resend-link { color: #4d8ec5; }
:root[data-theme='dark'] .resend-link:disabled { color: #4a4a52; }
:root[data-theme='dark'] .done-title { color: #f2f2f7; }
:root[data-theme='dark'] .done-desc { color: #98989d; }
:root[data-theme='dark'] .done-tip { color: #6e6e73; }
:root[data-theme='dark'] .member-id-card {
  background: #2c2c2e;
  border-color: rgba(255, 255, 255, 0.06);
}
:root[data-theme='dark'] .member-id-label { color: #98989d; }
:root[data-theme='dark'] .member-id-value { color: #f2f2f7; }
:root[data-theme='dark'] .copy-btn {
  background: rgba(77, 142, 197, 0.18);
  color: #4d8ec5;
}
:root[data-theme='dark'] .copy-btn:hover { background: rgba(77, 142, 197, 0.26); }
:root[data-theme='dark'] .strength-bar { background: rgba(255, 255, 255, 0.08); }
</style>
