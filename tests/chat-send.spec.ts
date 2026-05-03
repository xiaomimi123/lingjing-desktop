import { test, expect } from './helpers/fixtures'
import { attachLogCapture, summarize } from './helpers/log-capture'
import { snapshotGatewayLog, readSince, summarizeGatewayLog } from './helpers/gateway-log'

/**
 * 测试目标:模拟用户进对话页 → 发送消息 → 等待回复
 *
 * 关心三个层面是否通:
 *   A. 前端 Console 有没有 JS 报错
 *   B. /api/rpc 的 chat.send 有没有真的发出去 + 回包
 *   C. OpenClaw Gateway 有没有收到 chat.send + 是不是成功
 *
 * 失败时打印三方日志全文,定位是前端、本地后端代理、还是 Gateway 卡住。
 */
test.describe('对话发送流程', () => {
  test('打开对话页 → 发送 hi → 等待 60 秒收到回复', async ({ page }) => {
    const logs = attachLogCapture(page)
    const gatewaySnap = await snapshotGatewayLog()

    // 1) 直接进对话页(认证由 setup project 一次性完成,storageState 复用 cookie)
    await page.goto('/chat')
    await page.waitForLoadState('domcontentloaded')

    // 3) 给对话页 5 秒初始化(拉模型/会话/历史)
    await page.waitForTimeout(5000)

    // 4) 找输入框 —— 项目里 textarea 占位是"给灵境发消息..."(我们改过)
    //    或原版的"输入消息(...)"
    const input = page
      .locator('textarea[placeholder*="发消息"], textarea[placeholder*="输入消息"]')
      .first()
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.click()
    await input.fill('hi 简单回复 ok 即可')

    // 5) 找发送按钮(原版 chat 文案 "发送" / lingjing 版 "发送")
    const sendBtn = page.locator('button:has-text("发送")').first()
    await expect(sendBtn).toBeEnabled({ timeout: 5_000 })
    await sendBtn.click()

    // 6) 等回复 —— 看页面上有没有出现助手气泡(.chat-bubble.is-assistant 或 .msg-row-assistant)
    //    最长等 60 秒(适配 Win 上 OpenClaw 冷启动后第一次 chat.send 慢到 25s+)。
    //    超时也不算 fail,继续打印日志。
    const assistantLocator = page.locator(
      '.chat-bubble.is-assistant, .msg-row-assistant',
    )
    let firstReplySeen = false
    try {
      await expect(assistantLocator.first()).toBeVisible({ timeout: 60_000 })
      firstReplySeen = true
    } catch {
      // 不抛错,继续打印日志诊断
    }

    await page.waitForTimeout(2000) // 多等 2 秒让 SSE 事件流跑完

    // 7) 收集 + 打印诊断
    const newGatewayLines = await readSince(gatewaySnap)
    console.log('\n' + summarize(logs))
    console.log('\n' + summarizeGatewayLog(newGatewayLines))

    // 8) 断言:必须看到回复
    if (!firstReplySeen) {
      const chatSendCalls = logs.rpcCalls.filter((c) => c.method === 'chat.send')
      const gatewayChatSend = newGatewayLines.filter((l) => /chat\.send/.test(l))
      throw new Error(
        `❌ 60 秒没收到回复\n` +
          `  - 前端尝试 chat.send: ${chatSendCalls.length} 次\n` +
          `  - Gateway 收到 chat.send: ${gatewayChatSend.length} 次\n` +
          `  - 详见上方完整日志\n`,
      )
    }
  })
})
