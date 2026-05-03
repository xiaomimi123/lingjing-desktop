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
  <div class="login-container">
    <div class="login-right">
      <div class="login-form-wrapper">
        <div class="login-brand-wordmark">灵境</div>

        <div class="login-form-header">
          <h2 class="login-form-title">登录</h2>
          <p class="login-form-desc">你的 AI 创客助手</p>
        </div>

        <NAlert
          v-if="error"
          type="error"
          :bordered="false"
          :show-icon="true"
          style="margin-bottom: 16px;"
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
              class="login-input"
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
                class="login-input"
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
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                  />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg
                  v-else
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
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
            class="login-btn"
            :loading="loading"
            @click="handleLogin"
          >
            登录
          </NButton>
        </NForm>

        <div class="login-footer">
          <span class="footer-text">还没有账号?</span>
          <button class="footer-link" @click="goRegister">立即注册</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f7;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
  -webkit-app-region: drag;
}

.login-right {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.login-form-wrapper {
  width: 100%;
  max-width: 380px;
  -webkit-app-region: no-drag;
}

.login-brand-wordmark {
  text-align: center;
  font-size: 30px;
  font-weight: 200;
  letter-spacing: 0.4em;
  padding-left: 0.4em;
  color: #1f1f1f;
  margin-bottom: 36px;
}

.login-form-header {
  margin-bottom: 28px;
  text-align: center;
}

.login-form-title {
  font-size: 22px;
  font-weight: 500;
  color: #1f1f1f;
  margin-bottom: 6px;
  letter-spacing: -0.2px;
}

.login-form-desc {
  color: #6e6e73;
  font-size: 13px;
  font-weight: 400;
}

.form-item {
  margin-bottom: 14px;
}

.remember-row {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-top: 4px;
  margin-bottom: 18px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #1f1f1f;
  margin-bottom: 6px;
}

.login-input {
  border-radius: 6px;
}

.password-wrapper {
  position: relative;
}

.password-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #8e8e93;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease;
  z-index: 2;
}

.password-toggle:hover {
  color: #1f1f1f;
}

.login-btn {
  border-radius: 6px;
  height: 40px;
  font-weight: 500;
  font-size: 14px;
  margin-top: 8px;
}

.login-footer {
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

:root[data-theme='dark'] .login-container { background: #1c1c1e; }
:root[data-theme='dark'] .login-brand-wordmark { color: #f2f2f7; }
:root[data-theme='dark'] .login-form-title { color: #f2f2f7; }
:root[data-theme='dark'] .login-form-desc { color: #98989d; }
:root[data-theme='dark'] .form-label { color: #f2f2f7; }
:root[data-theme='dark'] .password-toggle { color: #8e8e93; }
:root[data-theme='dark'] .password-toggle:hover { color: #f2f2f7; }
:root[data-theme='dark'] .login-footer { color: #98989d; }
:root[data-theme='dark'] .footer-link { color: #4d8ec5; }
:root[data-theme='dark'] .footer-link:hover { color: #6ea8d6; }
</style>
