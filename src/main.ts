import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from '@/i18n'
import './assets/styles/main.css'
import './assets/styles/chat-simplify.css'
import './assets/styles/sessions-simplify.css'
import './assets/styles/hermes-dashboard-simplify.css'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(router)

// 启动时强制刷新本地 admin token —— 后端重启会清空内存 sessions,
// 老 token 会导致 /api/* 401 死循环。这里同步刷新一次保证 wsStore 拿到的是新的。
async function refreshLocalAdminToken() {
  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    })
    const data = await resp.json()
    if (resp.ok && data.ok && data.token) {
      localStorage.setItem('auth_token', data.token)
    }
  } catch {
    // 本地 server 没起来/.env 改动等情况下静默,不阻塞 UI
  }
}

refreshLocalAdminToken().finally(() => {
  app.mount('#app')
})
