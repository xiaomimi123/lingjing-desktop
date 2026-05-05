import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import { routes } from './routes'
import { useAuthStore } from '@/stores/auth'

// packaged Electron 加载 file://,vue-router 的 history mode 用 pathname 匹配,
// 但 pathname 在 file:// 下是文件系统路径(如 /D:/cesi/Lingjing/.../index.html),
// 路由匹配不到 → 全屏黑。改用 hash mode(URL 用 # 后面的部分),file:// 下能正常匹配。
// dev 跑 http://localhost,继续用 history mode 保持地址栏干净。
const isFileProtocol =
  typeof window !== 'undefined' && window.location.protocol === 'file:'

const router = createRouter({
  history: isFileProtocol ? createWebHashHistory() : createWebHistory(),
  routes,
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  let authEnabled = false
  try {
    authEnabled = await authStore.checkAuthConfig()
  } catch (error) {
    console.error('[Router] checkAuthConfig failed:', error)
    // 认证配置检查失败时，假设认证已禁用，允许访问
    authEnabled = false
  }

  if (!authEnabled) {
    // 本地 server auth disabled 不代表云端账号 disabled。允许用户去 Login 页登录
    // 灵境云端(api.aitoken.homes),不要拦截。已登录用户去 Login 由下面 meta.public 分支处理。
    next()
    return
  }

  if (to.meta.public) {
    if (to.name === 'Login' && authStore.isAuthenticated) {
      try {
        const valid = await authStore.checkAuth()
        if (valid) {
          const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/'
          next(redirect)
          return
        }
      } catch (error) {
        console.error('[Router] checkAuth failed:', error)
      }
    }
    next()
    return
  }

  if (!authStore.isAuthenticated) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  try {
    const valid = await authStore.checkAuth()
    if (!valid) {
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }
  } catch (error) {
    console.error('[Router] checkAuth failed:', error)
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  next()
})

export default router
