<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NButton, NAlert, NInput, NForm, NCheckbox } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const REMEMBER_EMAIL_KEY = 'lingjing_remember_email'

const email = ref(localStorage.getItem(REMEMBER_EMAIL_KEY) || '')
const password = ref('')
const rememberEmail = ref(true)
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  if (authStore.isAuthenticated) {
    const valid = await authStore.checkAuth()
    if (valid) {
      const redirect = (route.query.redirect as string) || '/'
      router.replace(redirect)
    }
  }
})

async function handleLogin() {
  if (!email.value || !password.value) {
    error.value = '请输入邮箱和密码'
    return
  }

  loading.value = true
  error.value = ''

  const ok = await authStore.login(email.value.trim(), password.value)

  if (ok) {
    if (rememberEmail.value) localStorage.setItem(REMEMBER_EMAIL_KEY, email.value.trim())
    else localStorage.removeItem(REMEMBER_EMAIL_KEY)

    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  } else {
    error.value = authStore.error || '登录失败,请检查邮箱和密码'
    loading.value = false
  }
}

function goRegister() {
  router.push({ name: 'Register' })
}
</script>

<template>
  <div class="login-stage">
    <!-- 左栏:意境侧 -->
    <aside class="pillar">
      <div class="wordmark" aria-label="灵境">
        <span class="wordmark-char wordmark-char--1">灵</span>
        <span class="wordmark-char wordmark-char--2">境</span>
      </div>
      <p class="tagline">让 AI 智能体走进你的桌面</p>
      <div class="seal" title="灵境 v1.0">
        <span class="seal-num">v1.0</span>
      </div>
    </aside>

    <!-- 右栏:功能侧 -->
    <main class="form-side">
      <div class="form-wrapper">
        <header class="form-header">
          <h2 class="form-title">登录</h2>
          <p class="form-sub">使用灵境账号继续</p>
        </header>

        <NAlert
          v-if="error"
          type="error"
          :bordered="false"
          :show-icon="true"
          class="form-alert"
        >
          {{ error }}
        </NAlert>

        <NForm @submit.prevent="handleLogin">
          <div class="form-item">
            <label class="form-label">邮箱</label>
            <NInput
              v-model:value="email"
              placeholder="name@example.com"
              size="large"
              class="form-input"
              autofocus
              @keydown.enter="handleLogin"
            />
          </div>

          <div class="form-item">
            <label class="form-label">密码</label>
            <div class="password-wrapper">
              <NInput
                v-model:value="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入密码"
                size="large"
                class="form-input"
                @keydown.enter="handleLogin"
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
          </div>

          <div class="form-item remember-row">
            <NCheckbox v-model:checked="rememberEmail">记住邮箱</NCheckbox>
          </div>

          <NButton
            type="primary"
            block
            size="large"
            class="form-btn"
            :loading="loading"
            @click="handleLogin"
          >
            登录
          </NButton>
        </NForm>

        <div class="form-footer">
          <span>还没有账号?</span>
          <button class="link" @click="goRegister">立即注册</button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* ================================================================
 * 灵境 Login —「极简东方」编排
 * 字体: 大字 Songti SC / SimSun (中文 serif),正文 PingFang SC
 * 配色: 墨黑 #1d1d1f / 宣纸米 #f5f1e8 / 朱砂红 #c8553d (印章)
 * 入场: 灵 → 0.3s → 境 → 0.5s → tagline → 0.7s → 表单 stagger
 * ================================================================ */

.login-stage {
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

/* 宣纸纤维微噪 (CSS-only) */
.login-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(
      0deg,
      rgba(29, 29, 31, 0.013) 0px,
      transparent 1px,
      transparent 2px
    ),
    repeating-linear-gradient(
      90deg,
      rgba(29, 29, 31, 0.013) 0px,
      transparent 1px,
      transparent 3px
    );
  pointer-events: none;
  z-index: 0;
}

/* ====== 左栏:意境侧 ====== */
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
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
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
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
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

.seal-num {
  font-family: 'Songti SC', 'STSong', serif;
  letter-spacing: 0;
}

@keyframes seal-stamp {
  0% { opacity: 0; transform: rotate(0deg) scale(1.6); }
  60% { opacity: 1; transform: rotate(-4deg) scale(0.92); }
  100% { opacity: 1; transform: rotate(-4deg) scale(1); }
}

@keyframes rise {
  to { opacity: 1; transform: translateY(0); }
}

/* ====== 右栏:功能侧 ====== */
.form-side {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px);
  z-index: 1;
}

.form-wrapper {
  width: 100%;
  max-width: 360px;
  -webkit-app-region: no-drag;
}

.form-wrapper > * {
  opacity: 0;
  transform: translateY(10px);
  animation: rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.form-header { animation-delay: 1.0s; }
.form-alert { animation-delay: 1.05s; }
.form-wrapper .n-form { animation-delay: 1.1s; }
.form-footer { animation-delay: 1.3s; }

.form-header {
  margin-bottom: 36px;
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

.form-alert {
  margin-bottom: 16px;
  border-radius: 8px;
}

.form-item {
  margin-bottom: 16px;
}

.remember-row {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-top: 4px;
  margin-bottom: 22px;
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

.form-input {
  border-radius: 8px;
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

.form-btn {
  border-radius: 8px;
  height: 44px;
  font-weight: 500;
  font-size: 14px;
  letter-spacing: 0.1em;
  margin-top: 8px;
}

.form-footer {
  margin-top: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

.link {
  background: none;
  border: none;
  color: var(--cinnabar);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  padding: 0 0 0 6px;
  font-weight: 500;
  position: relative;
  transition: opacity 0.15s ease;
}
.link::after {
  content: '';
  position: absolute;
  left: 6px; right: 0;
  bottom: -2px;
  height: 1px;
  background: var(--cinnabar);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.link:hover::after { transform: scaleX(1); }

/* ====== 暗色模式 ====== */
:root[data-theme='dark'] .login-stage {
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
:root[data-theme='dark'] .login-stage::before {
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

/* ====== 小屏:堆叠 ====== */
@media (max-width: 900px) {
  .login-stage {
    grid-template-columns: 1fr;
    grid-template-rows: 40vh 1fr;
  }
  .pillar {
    padding: 48px 36px 24px;
    border-right: none;
    border-bottom: 1px solid rgba(29, 29, 31, 0.06);
  }
  .wordmark { font-size: clamp(64px, 16vw, 120px); }
  .seal {
    bottom: 32px;
    left: auto;
    right: 36px;
  }
  .form-side { padding: 36px 24px; }
}
</style>
