import { test, expect } from './helpers/fixtures'

/**
 * 自定义模型 CRUD —— 走 ModelsPage 的"自定义模型" tab,
 * 数据存 localStorage(lingjing_custom_models),不依赖 server。
 *
 * 覆盖:添加 → 列表出现 → 编辑改名 → 应用生效 → 删除消失。
 */
test.describe('自定义模型 CRUD', () => {
  test('添加 → 编辑 → 应用 → 删除 完整流程', async ({ page }) => {
    const tag = `e2e-custom-${Date.now().toString().slice(-6)}`

    // 进模型管理页
    await page.goto('/models')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // 1) 切到"自定义模型" tab
    await page.locator('.n-tabs-tab:has-text("自定义模型")').click()
    await page.waitForTimeout(500)

    // 记录初始自定义模型数(可能用户之前自己加过)
    const cardsBefore = await page.locator('.custom-card').count()
    console.log('[test] 初始自定义模型数:', cardsBefore)

    // 2) 点"添加模型"按钮 → 弹 modal
    await page.locator('button:has-text("添加模型")').click()
    const modal = page.locator('.n-modal:has-text("添加自定义模型")')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // 3) 填表:名称 / Base URL / 模型 ID / 兼容协议默认 OpenAI / API Key
    const inputs = modal.locator('input')
    await inputs.nth(0).fill(tag)                                     // 名称
    await inputs.nth(1).fill('https://api.example.test/v1')           // Base URL
    await inputs.nth(2).fill('test-model-id')                         // 模型 ID
    // 兼容协议保持默认 OpenAI
    await inputs.nth(3).fill('sk-test-placeholder-not-real')          // API Key

    // 4) 提交"添加"
    await modal.locator('button:has-text("添加")').click()
    await expect(modal).toBeHidden({ timeout: 5000 })
    await page.waitForTimeout(800)

    // 5) 列表里出现刚才的名字
    const cardsAfterCreate = await page.locator('.custom-card').count()
    console.log('[test] 创建后自定义模型数:', cardsAfterCreate)
    expect(cardsAfterCreate).toBe(cardsBefore + 1)

    const newCard = page.locator(`.custom-card:has-text("${tag}")`).first()
    await expect(newCard).toBeVisible({ timeout: 3000 })

    // 6) 编辑 → 改名字
    await newCard.locator('button[title="编辑"]').click()
    const editModal = page.locator('.n-modal:has-text("编辑模型")')
    await expect(editModal).toBeVisible({ timeout: 5000 })

    const editNameInput = editModal.locator('input').first()
    await editNameInput.fill(`${tag}-edited`)
    await editModal.locator('button:has-text("保存")').click()
    await expect(editModal).toBeHidden({ timeout: 5000 })
    await page.waitForTimeout(800)

    const editedCard = page.locator(`.custom-card:has-text("${tag}-edited")`).first()
    await expect(editedCard).toBeVisible({ timeout: 3000 })
    console.log('[test] 编辑后能找到新名字')

    // 7) 应用按钮存在(实际"应用"调 Electron preload bridge,Playwright Chromium
    //    里不可用,只验证按钮渲染对就够;真实环境下用户点击会调 openclaw onboard)
    await expect(editedCard.locator('button:has-text("应用")')).toBeVisible()
    console.log('[test] 应用按钮可见(Electron 桥接外不真测)')

    // 8) 删除 —— 弹 dialog confirm
    await editedCard.locator('button[title="删除"]').click()
    const confirmBtn = page.locator('.n-dialog button:has-text("删除")')
    await expect(confirmBtn).toBeVisible({ timeout: 3000 })
    await confirmBtn.click()
    await page.waitForTimeout(1000)

    // 9) 验证卡片消失
    const cardsAfterDelete = await page.locator('.custom-card').count()
    console.log('[test] 删除后自定义模型数:', cardsAfterDelete)
    expect(cardsAfterDelete).toBe(cardsBefore)

    const stillThere = await page.locator(`.custom-card:has-text("${tag}-edited")`).count()
    expect(stillThere).toBe(0)
    console.log('[test] ✅ 自定义模型 CRUD 全过')
  })
})
