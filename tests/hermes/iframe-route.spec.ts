import { test, expect } from '../helpers/fixtures'

test.describe('v1.6 Hermes iframe 路由', () => {
  test('/hermes 渲染 iframe + src 指向 /api/hermes/embed/', async ({ page }) => {
    await page.goto('/hermes')
    await page.waitForLoadState('domcontentloaded')

    const iframe = page.locator('iframe.hermes-embed-frame')
    await expect(iframe).toHaveCount(1, { timeout: 5000 })
    const src = await iframe.getAttribute('src')
    expect(src).toContain('/api/hermes/embed')
  })

  test('/hermes/chat 渲染 iframe + src 含 /chat', async ({ page }) => {
    await page.goto('/hermes/chat')
    await page.waitForLoadState('domcontentloaded')

    const iframe = page.locator('iframe.hermes-embed-frame')
    await expect(iframe).toHaveCount(1, { timeout: 5000 })
    const src = await iframe.getAttribute('src')
    expect(src).toContain('/api/hermes/embed/chat')
  })

  test('/hermes/foo/bar 深层路径也渲染 iframe', async ({ page }) => {
    await page.goto('/hermes/foo/bar')
    await page.waitForLoadState('domcontentloaded')

    const iframe = page.locator('iframe.hermes-embed-frame')
    await expect(iframe).toHaveCount(1, { timeout: 5000 })
    const src = await iframe.getAttribute('src')
    expect(src).toContain('/api/hermes/embed/foo/bar')
  })
})
