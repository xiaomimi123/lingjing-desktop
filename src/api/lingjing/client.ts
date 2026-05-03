import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

const baseURL =
  (import.meta.env.VITE_LINGJING_API_BASE as string | undefined) ||
  'https://api.aitoken.homes'

export const lingjingClient: AxiosInstance = axios.create({
  baseURL,
  timeout: 20000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 透传一个可选的 Bearer Token(W2 Day 3 拉取/v1/* 时用,登录阶段不用)
let bearerToken: string | null = null
export function setBearerToken(token: string | null) {
  bearerToken = token
}
export function getBearerToken() {
  return bearerToken
}

lingjingClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (bearerToken && config.url?.startsWith('/v1/')) {
    config.headers.set('Authorization', `Bearer ${bearerToken}`)
  }
  return config
})

lingjingClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      error.isUnauthorized = true
      // 跳登录(动态 import 避免和 stores 形成循环依赖)
      try {
        localStorage.removeItem('lingjing_logged_in')
        const { default: router } = await import('@/router')
        const path = router.currentRoute.value.fullPath
        const isPublic = ['/login', '/register', '/welcome'].some((p) =>
          path.startsWith(p),
        )
        if (!isPublic) {
          router.push({ name: 'Login', query: { redirect: path } })
        }
      } catch {
        // ignore — 路由还没初始化时 fallback 到下次请求
      }
    }
    return Promise.reject(error)
  },
)

export interface LingjingApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}
