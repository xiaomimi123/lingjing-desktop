import { test, expect } from '../helpers/fixtures'

test.describe('v1.6 chat 路径', () => {
  test('mock daemon 路径: payload.lingjingDaemon=true 前端不报错', async ({ page }) => {
    await page.route('**/api/rpc', async (route) => {
      const body = route.request().postDataJSON()
      if (body?.method === 'chat.send') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            payload: { runId: 'mock-daemon-1', lingjingDaemon: true },
          }),
        })
      }
      route.continue()
    })

    await page.goto('/chat')
    await page.waitForLoadState('domcontentloaded')

    const input = page.locator('textarea').first()
    await input.fill('你好')

    const sendBtn = page.getByRole('button', { name: /发送/ })
    await sendBtn.click()
    await page.waitForTimeout(500)

    const errorMsg = page.locator('.error-message, .n-message-error')
    await expect(errorMsg).toHaveCount(0, { timeout: 2000 })
  })

  test('mock fallback 路径: payload.lingjingBypass=true 前端不报错', async ({ page }) => {
    await page.route('**/api/rpc', async (route) => {
      const body = route.request().postDataJSON()
      if (body?.method === 'chat.send') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            payload: { runId: 'mock-bypass-1', lingjingBypass: true },
          }),
        })
      }
      route.continue()
    })

    await page.goto('/chat')
    await page.waitForLoadState('domcontentloaded')

    const input = page.locator('textarea').first()
    await input.fill('你好')
    const sendBtn = page.getByRole('button', { name: /发送/ })
    await sendBtn.click()
    await page.waitForTimeout(500)

    const errorMsg = page.locator('.error-message, .n-message-error')
    await expect(errorMsg).toHaveCount(0, { timeout: 2000 })
  })
})
