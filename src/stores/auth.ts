import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as lingjingAuth from '@/api/lingjing/auth'
import type { LingjingUser } from '@/api/lingjing/auth'
import { ensureDesktopToken } from '@/api/lingjing/tokens'

const PROVIDERS_CONFIGURED_KEY = 'lingjing_providers_configured'

// 本地 OpenClaw Gateway 后端的 admin token,用于 /api/*(本地 server,Vite 代理 :3000)
const LOCAL_TOKEN_KEY = 'auth_token'
// 灵境用户标记,用于路由守卫快速判断"已登录"
const LINGJING_LOGGED_IN_KEY = 'lingjing_logged_in'

export const useAuthStore = defineStore('auth', () => {
  // 本地 Gateway token(/api/* 用)
  const token = ref<string | null>(localStorage.getItem(LOCAL_TOKEN_KEY))
  // 灵境用户信息(从 /api/user/self 拉)
  const user = ref<LingjingUser | null>(null)
  // 本地 server 是否启用 auth(原 OpenClaw 行为)
  const authEnabled = ref(true)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const configLoaded = ref(false)
  // 标记已经在灵境云端登录过(刷新后用 cookie 续 session,在 checkAuth 验证)
  const lingjingLoggedIn = ref(localStorage.getItem(LINGJING_LOGGED_IN_KEY) === '1')

  const isAuthenticated = computed(() => lingjingLoggedIn.value)
  const memberId = computed(() => (user.value?.id != null ? String(user.value.id) : '--'))
  const balanceQuota = computed(() => user.value?.quota ?? 0)

  function setLocalToken(newToken: string | null) {
    token.value = newToken
    if (newToken) localStorage.setItem(LOCAL_TOKEN_KEY, newToken)
    else localStorage.removeItem(LOCAL_TOKEN_KEY)
  }

  function setLingjingLoggedIn(flag: boolean) {
    lingjingLoggedIn.value = flag
    if (flag) localStorage.setItem(LINGJING_LOGGED_IN_KEY, '1')
    else localStorage.removeItem(LINGJING_LOGGED_IN_KEY)
  }

  async function checkAuthConfig(forceRefresh = false) {
    if (configLoaded.value && !forceRefresh) return authEnabled.value
    try {
      const response = await fetch('/api/auth/config', {
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      authEnabled.value = !!data.enabled
      configLoaded.value = true
    } catch {
      authEnabled.value = false
      configLoaded.value = true
    }
    return authEnabled.value
  }

  /**
   * 校验灵境云端 session 还活着,顺手刷新 user 信息(余额会跟着更新)。
   * 路由守卫每次切页都会调一次。
   *
   * 副作用:成功后**总是刷新一次本地 admin token**——避免后端重启把内存
   * sessions 清空,而前端还在用老 token 导致 /api/* 401 死循环。
   */
  async function checkAuth(): Promise<boolean> {
    if (!lingjingLoggedIn.value) return false
    try {
      const resp = await lingjingAuth.getSelf()
      if (resp.success && resp.data) {
        user.value = resp.data
        // 后台静默刷一次本地 admin token,失败不阻塞
        if (!token.value) {
          loginLocalSilent()
        } else {
          // 验证现有 token 是否还有效;无效则重新登
          fetch('/api/auth/check', {
            headers: { Authorization: `Bearer ${token.value}` },
          })
            .then((r) => {
              if (!r.ok) loginLocalSilent()
            })
            .catch(() => loginLocalSilent())
        }
        // v1.2.3: stored credential 自动登录(走 checkAuth 不走 login)的用户也强制
        // reconfigure,确保 OpenClaw 配置文件里的 sk-xxx 是最新的;否则 daemon 用的可能是
        // v1.0.x 留下的失效 token,导致 chat.send 卡死。force=true 跳过 sessionStorage 缓存。
        configureLocalProvidersFromLingjing({ force: true }).catch((err) => {
          console.warn('[auth] checkAuth reconfigure failed (non-fatal):', err)
        })
        return true
      }
      setLingjingLoggedIn(false)
      user.value = null
      return false
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.isUnauthorized) {
        setLingjingLoggedIn(false)
        user.value = null
      }
      return false
    }
  }

  /**
   * 拉取/创建灵镜云端 API Token,通过 IPC 让 Electron 主进程把它写进本地
   * OpenClaw / Hermes 的配置里,自动重启网关。这样三条聊天通道
   * (OpenClaw + Hermes + 灵境云端)共用同一余额,用户登录后零额外配置。
   */
  const SELECTED_MODEL_KEY = 'lingjing_selected_model'

  function getSelectedModel(): string {
    return localStorage.getItem(SELECTED_MODEL_KEY) || 'gpt-5.4'
  }

  function setSelectedModel(modelId: string) {
    localStorage.setItem(SELECTED_MODEL_KEY, modelId)
  }

  async function configureLocalProvidersFromLingjing(opts: { force?: boolean; modelId?: string } = {}) {
    // 只有上次成功后才跳;失败时不缓存,下次登录继续尝试
    if (!opts.force && sessionStorage.getItem(PROVIDERS_CONFIGURED_KEY) === 'ok') return

    const bridge = (typeof window !== 'undefined' ? window : ({} as any)).lingjing
    if (!bridge?.configureLocalProviders) {
      console.info('[auth] electron bridge unavailable, skip local provider config')
      return
    }

    console.info('[auth] obtaining lingjing API token...')
    const token = await ensureDesktopToken()
    if (!token) {
      console.warn('[auth] could not obtain lingjing API token, skip local provider config')
      return
    }
    const modelId = opts.modelId || getSelectedModel()
    console.info('[auth] got token (suffix):', token.slice(-6), 'model:', modelId, '— calling main process...')

    const result = await bridge.configureLocalProviders({
      token,
      baseUrl: (import.meta.env.VITE_LINGJING_OPENAI_BASE as string) || 'https://api.aitoken.homes/v1',
      modelId,
    })
    console.info('[auth] configureLocalProviders result:', JSON.stringify(result, null, 2))

    if (result?.openclaw === 'ok' && (result?.hermes === 'ok' || result?.hermes === 'skipped')) {
      sessionStorage.setItem(PROVIDERS_CONFIGURED_KEY, 'ok')
      if (opts.modelId) setSelectedModel(opts.modelId)
    } else {
      console.warn('[auth] provider config failed/partial, will retry on next login')
    }
    return result
  }

  /**
   * 静默登录本地 OpenClaw server(admin/admin),拿 token 给 /api/* 用。
   * 失败不阻塞(不影响灵境云端功能),只记 warning。
   */
  async function loginLocalSilent(): Promise<void> {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' }),
      })
      const data = await response.json()
      if (response.ok && data.ok && data.token) {
        setLocalToken(data.token)
      } else {
        console.warn('[auth] local server login failed (non-fatal):', data.error)
      }
    } catch (e) {
      console.warn('[auth] local server unreachable (non-fatal):', e)
    }
  }

  /**
   * 灵境登录入口:邮箱 + 密码。
   *   1. POST 灵镜 /api/user/login → cookie session + user
   *   2. 后台 admin/admin 登录本地 server 拿 Bearer token(让 /api/* 能跑)
   */
  async function login(email: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const resp = await lingjingAuth.login({ email, password })
      if (!resp.success) {
        error.value = resp.message || '邮箱或密码错误'
        loading.value = false
        return false
      }

      user.value = resp.data ?? null
      setLingjingLoggedIn(true)

      // 后台并行启动本地 admin 登录,失败不阻塞
      loginLocalSilent()

      // 后台并行配置本地 OpenClaw / Hermes Provider —— 让两个网关也走 aitoken.homes
      // 共享同一余额,失败不阻塞登录(本地无网关也能用灵境云端聊天)
      configureLocalProvidersFromLingjing().catch((err) => {
        console.warn('[auth] configureLocalProviders failed (non-fatal):', err)
      })

      loading.value = false
      return true
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '网络错误,请稍后重试'
      error.value = msg
      loading.value = false
      return false
    }
  }

  async function logout() {
    try {
      await lingjingAuth.logout()
    } catch {
      // ignore network failure
    }
    try {
      if (token.value) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token.value}` },
        })
      }
    } catch {
      // ignore
    }
    setLocalToken(null)
    setLingjingLoggedIn(false)
    user.value = null

    // v1.3.0: 退出登录时清 preflight 缓存,下次登录强制重做自检
    try {
      sessionStorage.removeItem('lingjing-preflight-passed')
      sessionStorage.removeItem('lingjing-preflight-last-result')
      sessionStorage.removeItem('lingjing-preflight-skipped')
    } catch {
      // ignore
    }

    // 停掉余额轮询(动态 import 避免 store 之间循环依赖)
    try {
      const { useLingjingBillingStore } = await import('@/stores/lingjing-billing')
      useLingjingBillingStore().reset()
    } catch {
      // ignore
    }
  }

  function getToken(): string | null {
    return token.value
  }

  return {
    token,
    user,
    authEnabled,
    loading,
    error,
    isAuthenticated,
    memberId,
    balanceQuota,
    checkAuthConfig,
    checkAuth,
    login,
    logout,
    getToken,
    getSelectedModel,
    /** 手动触发本地 Provider 配置(可指定 modelId 切换模型) */
    reconfigureProviders: (modelId?: string) =>
      configureLocalProvidersFromLingjing({ force: true, modelId }),
  }
})
