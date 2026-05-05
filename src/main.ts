// packaged Electron 用 file:// 协议加载 dist/index.html,fetch('/api/xxx') 会被
// 浏览器解析成 file:///api/xxx → ERR_FILE_NOT_FOUND。这里在最顶端 patch 全局
// fetch/EventSource/WebSocket,把裸 /api/... 自动重写到本地后端 :3000。
// dev 模式 origin 是 http://localhost:3001(vite 代理 :3000),走 if 外原路。
;(function patchApiBaseForFileProtocol() {
  if (typeof window === 'undefined' || window.location.protocol !== 'file:') return
  const HTTP_BASE = 'http://127.0.0.1:3000'
  const WS_BASE = 'ws://127.0.0.1:3000'

  const origFetch = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return origFetch(HTTP_BASE + input, init)
    }
    if (input instanceof URL && input.pathname.startsWith('/api/')) {
      return origFetch(HTTP_BASE + input.pathname + input.search, init)
    }
    if (input instanceof Request && input.url.startsWith('file:///api/')) {
      const path = input.url.replace(/^file:\/\//, '')
      return origFetch(new Request(HTTP_BASE + path, input), init)
    }
    return origFetch(input as RequestInfo, init)
  }) as typeof window.fetch

  const OrigES = window.EventSource
  if (OrigES) {
    window.EventSource = class extends OrigES {
      constructor(url: string | URL, init?: EventSourceInit) {
        let u = typeof url === 'string' ? url : url.toString()
        if (u.startsWith('/api/')) u = HTTP_BASE + u
        super(u, init)
      }
    } as typeof EventSource
  }

  const OrigWS = window.WebSocket
  window.WebSocket = class extends OrigWS {
    constructor(url: string | URL, protocols?: string | string[]) {
      let u = typeof url === 'string' ? url : url.toString()
      if (u.startsWith('/api/') || u.startsWith('/ws')) u = WS_BASE + u
      super(u, protocols)
    }
  } as typeof WebSocket
})()

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
