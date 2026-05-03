import { test } from './helpers/fixtures'

test('screenshot: /hermes/skills 现状', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('hermes_gateway', 'hermes') } catch {}
  })
  await page.setViewportSize({ width: 1600, height: 1100 })
  await page.goto('/hermes/skills')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(6000)
  const text = await page.locator('body').innerText().catch(() => '')
  console.log('=== body 前 800 字 ===')
  console.log(text.slice(0, 800))
  await page.screenshot({ path: 'test-results/_hermes-skills.png', fullPage: false })
})
