import { test as setup, expect } from '@playwright/test'
import { getCredentialsFromEnv } from './helpers/auth'

/**
 * 全局登录:整个测试套只调一次灵镜 /api/user/login,把 cookie + localStorage
 * 存进 storageState 文件,后续所有 test 复用——避免云端登录限频。
 *
 * 走真实浏览器表单(而非 apiRequestContext.post)——后者在 Node TLS 栈下偶发
 * "socket disconnected before secure TLS",browser fetch 走 Chromium TLS 栈稳定。
 */
const STORAGE_STATE = 'playwright/.auth/user.json'

setup('authenticate', async ({ page, context }) => {
  const creds = getCredentialsFromEnv()
  if (!creds) {
    throw new Error(
      '缺少测试账号:请在 .env.test 设置 LINGJING_TEST_EMAIL / LINGJING_TEST_PASSWORD',
    )
  }

  // 1. 进登录页
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // 2. 填表单 + 提交(走 authStore.login → axios → /api/user/login,
  //    cookie 自动落到 context)
  const emailInput = page.locator('input[placeholder="name@example.com"]')
  const passwordInput = page.locator('input[placeholder="请输入密码"]')
  await expect(emailInput).toBeVisible({ timeout: 10_000 })

  await emailInput.fill(creds.email)
  await passwordInput.fill(creds.password)
  await page.locator('button:has-text("登录")').first().click()

  // 3. 等路由跳出 /login —— 跳走说明登录成功 + checkAuth 也通过
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 20_000,
  })

  // 4. 校验 cookie 真的拿到了
  const cookies = await context.cookies('https://api.aitoken.homes')
  const sess = cookies.find((c) => c.name === 'session_v2')
  expect(sess, '云端登录后没拿到 session_v2 cookie').toBeTruthy()

  // 5. 持久化 cookie + localStorage(sessionStorage 由 fixtures.ts 每次重注入)
  await context.storageState({ path: STORAGE_STATE })
})
