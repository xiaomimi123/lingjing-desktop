import { test } from './helpers/fixtures'

test('screenshot: /hermes/models 现状', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('hermes_gateway', 'hermes') } catch {}
  })
  await page.setViewportSize({ width: 1600, height: 1100 })
  await page.goto('/hermes/models')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(6000)
  const text = await page.locator('body').innerText().catch(() => '')
  console.log('=== body 前 1200 字 ===')
  console.log(text.slice(0, 1200))
  await page.screenshot({ path: 'test-results/_hermes-models.png', fullPage: false })
})
