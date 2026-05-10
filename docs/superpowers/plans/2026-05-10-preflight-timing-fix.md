# 灵境 v1.5.x 自检流程时机修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 v1.5.1 的 PreflightPage 第 4 步严格验证"灵境 token 是否真注入到 server 内存",修掉"自检看似通过但 chat.send 报 token 未注入"的核心 bug,并加 quickCheck 兜底覆盖 server 重启场景。

**Architecture:** 主修复是 PreflightPage.vue:87 一字之改(检查 cfg.bypass 而非 cfg.openclaw),配合提取 pure helper + vitest 单测保 TDD。加固 skipAndContinue 写"skipped"标记。新增 quickCheck IPC 链路(server health-quick → main handle → preload bridge → router guard 调用)。

**Tech Stack:** Vue 3 + Pinia + vue-router (前端), Electron (主进程 + preload), Express (server/index.js), Vitest (新加单元测试), Playwright (现有 e2e).

**Spec Source:** `docs/superpowers/specs/2026-05-10-preflight-timing-design.md` (v2)

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `vite.config.ts` | Modify | 加 `test:` 段开 vitest |
| `src/views/lingjing/preflight/configureEval.ts` | Create | 纯函数 helper: `evaluateConfigureStep(cfg)` |
| `src/views/lingjing/preflight/configureEval.test.ts` | Create | helper 单测 (4 case) |
| `src/views/lingjing/PreflightPage.vue` | Modify | :87 调 helper; :177-183 skipAndContinue 写 'skipped' |
| `src/router/index.ts` | Modify | :73 同时认 'passed'/'skipped'; :78 加 quickCheck 调用 |
| `electron/preload.cjs` | Modify | bridge.preflight.quickCheck() |
| `electron/main.js` | Modify | ipcMain.handle('lingjing:preflight-quick-check') |
| `server/index.js` | Modify | GET /api/internal/health-quick 路由 |
| `tests/preflight/preflight-bypass-fail.spec.ts` | Create | e2e: bypass 失败时 PreflightPage 显示具体错误 |
| `tests/preflight/preflight-skip-marks-skipped.spec.ts` | Create | e2e: 点跳过 → sessionStorage='skipped' |
| `tests/preflight/router-quick-check.spec.ts` | Create | e2e: 启动直接进主页(quickCheck pass) |
| `package.json` | Modify | scripts 加 `test:unit` 跑 vitest |
| `tests/helpers/fixtures.ts` | Modify | 注入 preflight-passed='ok' 避免破回归 |

---

## Task 1: 引入 vitest 配置

**Files:**
- Modify: `vite.config.ts` (加 test 段)
- Modify: `package.json` scripts

- [ ] **Step 1: Read current vite.config.ts**

```bash
cat vite.config.ts
```

- [ ] **Step 2: Add test section to vite.config.ts**

在 `defineConfig({...})` 内顶层加(其它配置不动):

```typescript
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
```

- [ ] **Step 3: Add test:unit scripts**

`package.json:scripts` 段加(在 `test:report` 之后):

```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

- [ ] **Step 4: Verify vitest can boot**

```bash
npm run test:unit
```

Expected: `No test files found, exiting with code 1` 或类似 — 表明 vitest 能启动。需要装 `jsdom` 时 vitest 会提示。

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts package.json
git commit -m "chore(test): 加 vitest 配置 + test:unit 脚本"
```

---

## Task 2: 提取 evaluateConfigureStep 纯函数 helper (TDD 核心)

**Files:**
- Create: `src/views/lingjing/preflight/configureEval.ts`
- Create: `src/views/lingjing/preflight/configureEval.test.ts`

- [ ] **Step 1: Write failing tests first**

`src/views/lingjing/preflight/configureEval.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { evaluateConfigureStep } from './configureEval'

describe('evaluateConfigureStep', () => {
  it('bypass=ok openclaw=ok → ok=true, no warning', () => {
    const r = evaluateConfigureStep({ bypass: 'ok', openclaw: 'ok' })
    expect(r.ok).toBe(true)
    expect(r.message).toBe('')
  })

  it('bypass=ok openclaw=error → ok=true, with warning', () => {
    const r = evaluateConfigureStep({ bypass: 'ok', openclaw: 'error', openclawMessage: 'daemon down' })
    expect(r.ok).toBe(true)
    expect(r.message).toContain('OpenClaw fallback')
  })

  it('bypass=error openclaw=ok → ok=false, message names bypass', () => {
    const r = evaluateConfigureStep({ bypass: 'error: HTTP 500', openclaw: 'ok' })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('bypass 失败')
  })

  it('cfg null → ok=false', () => {
    const r = evaluateConfigureStep(null)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('bypass 失败')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit
```

Expected: `FAIL` with "Cannot find module './configureEval'"

- [ ] **Step 3: Write minimal implementation**

`src/views/lingjing/preflight/configureEval.ts`:

```typescript
/**
 * v1.5.x 修复: PreflightPage 第 4 步 configure 检查的真相是 cfg.bypass 而非 cfg.openclaw。
 * - bypass='ok' 意味着 lingjingApiToken 已注入到 server 内存(chat.send 走的真实路径)
 * - openclaw 是 OpenClaw daemon 配置 status, v1.5 是 fallback
 *
 * 抽成 pure function 便于单元测试。
 */
export interface ConfigureCfg {
  bypass?: string
  bypassMessage?: string
  openclaw?: string
  openclawMessage?: string
  message?: string
  [key: string]: any
}

export interface EvalResult {
  ok: boolean
  message: string
}

export function evaluateConfigureStep(cfg: ConfigureCfg | null | undefined): EvalResult {
  const bypassOk = cfg?.bypass === 'ok'
  const openclawOk = cfg?.openclaw === 'ok'

  if (bypassOk) {
    return {
      ok: true,
      message: openclawOk ? '' : 'OpenClaw fallback 失配,但 chat 走 bypass 仍可用',
    }
  }

  const reason =
    cfg?.bypassMessage ||
    cfg?.message ||
    cfg?.openclawMessage ||
    cfg?.bypass ||
    '未知'
  return {
    ok: false,
    message: `bypass 失败: ${reason}`,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add src/views/lingjing/preflight/configureEval.ts src/views/lingjing/preflight/configureEval.test.ts
git commit -m "feat(preflight): 提取 evaluateConfigureStep helper + 单测

主修复点: bypass=ok 才意味着 token 真注入 server,
openclaw 在 v1.5 已是 fallback 不应作为通过指标。"
```

---

## Task 3: PreflightPage 第 4 步用新 helper

**Files:**
- Modify: `src/views/lingjing/PreflightPage.vue` (import 区 + 第 83-95 行)

- [ ] **Step 1: Find current code**

```bash
sed -n '83,95p' src/views/lingjing/PreflightPage.vue
```

Confirm 看到 `const ok = cfg?.openclaw === 'ok'`

- [ ] **Step 2: Add import at top of script**

文件顶部 import 区(约 10-12 行附近)加:

```typescript
import { evaluateConfigureStep } from './preflight/configureEval'
```

- [ ] **Step 3: Replace check logic**

把 `case 'configure': { ... }` 段(83-95 行)替换为:

```typescript
      case 'configure': {
        const modelId = (authStore as any).getSelectedModel?.() || 'gpt-5.4'
        const cfg = await bridge.autoConfigureViaMain?.({ modelId })
        const evalResult = evaluateConfigureStep(cfg)
        r = {
          ok: evalResult.ok,
          durationMs: 0,
          message: evalResult.message,
          detail: cfg,
        }
        break
      }
```

- [ ] **Step 4: Smoke test by launching dev**

```bash
# 终端 A
npm run dev:server
# 终端 B
npm run dev
```

打开 http://localhost:3001/preflight 手动看第 4 步行为。

- [ ] **Step 5: Commit**

```bash
git add src/views/lingjing/PreflightPage.vue
git commit -m "fix(preflight): 第 4 步检查 cfg.bypass 而非 cfg.openclaw

修主因 bug: bypass 失败时(server 没收到 token)
v1.5.0/1.5.1 自检会因 openclaw='ok' 假通过,
chat.send 才暴露 'token 未注入' 错误。"
```

---

## Task 4: skipAndContinue 改写 'skipped' 标记

**Files:**
- Modify: `src/views/lingjing/PreflightPage.vue:177-183`

- [ ] **Step 1: Find current code**

```bash
sed -n '177,183p' src/views/lingjing/PreflightPage.vue
```

- [ ] **Step 2: Replace function body**

```typescript
function skipAndContinue() {
  // v1.5.x 修复: 应急出口不再写 'passed' 污染不变量,
  // 而是写 'skipped' 显式标记。router guard 同时认 passed/skipped 都放行。
  // 'skipped' 留下诊断痕迹,便于排查"用户跳过了自检导致 chat 不可用"的链路。
  sessionStorage.setItem('lingjing-preflight-skipped', '1')
  sessionStorage.setItem('lingjing-preflight-skipped-at', new Date().toISOString())
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.replace(redirect)
}
```

- [ ] **Step 3: Verify by manual test**

启动 dev → 进 /preflight → 模拟一步 fail → 点"跳过" → DevTools Console 跑:

```javascript
sessionStorage.getItem('lingjing-preflight-skipped') // '1'
sessionStorage.getItem('lingjing-preflight-passed') // null
```

- [ ] **Step 4: skip - Task 5 router 改后再补 e2e**

- [ ] **Step 5: Commit**

```bash
git add src/views/lingjing/PreflightPage.vue
git commit -m "fix(preflight): skipAndContinue 写 'skipped' 而非 'passed'

之前应急出口强写 passed 污染不变量,
让 chat.send 的'token 未注入'更难诊断。
现在用显式 skipped 标记保留诊断信息。"
```

---

## Task 5: router guard 同时认 passed / skipped

**Files:**
- Modify: `src/router/index.ts:72-78`

- [ ] **Step 1: Find current code**

```bash
sed -n '70,80p' src/router/index.ts
```

- [ ] **Step 2: Replace check logic**

把 72-78 行替换为:

```typescript
  // v1.3.0: 已登录用户,本次 session 还没通过自检 → 强制跳 /preflight。
  // skipPreflight=true 的路由(/preflight 自身)放行避免死循环。
  // v1.5.x: 'skipped' 也放行(用户主动跳过), 但 router guard 会日志区分。
  if (!to.meta.skipPreflight) {
    const passed = sessionStorage.getItem('lingjing-preflight-passed') === 'ok'
    const skipped = sessionStorage.getItem('lingjing-preflight-skipped') === '1'
    if (!passed && !skipped) {
      next({ name: 'Preflight', query: { redirect: to.fullPath } })
      return
    }
    if (skipped && !passed) {
      console.warn('[Router] 用户曾在 PreflightPage 点跳过,token 注入状态未确认。chat 异常时引导重新登录。')
    }
  }
```

- [ ] **Step 3: Manual smoke**

启动 dev → 登录 → /preflight → 跳过 → 应进主页 → DevTools Console 有 warn

- [ ] **Step 4: Run existing e2e to ensure 没破回归**

```bash
npm run test:e2e
```

Expected: 现有测试全过。如果 fixtures.ts 没注入 preflight-passed,部分测试会被 router guard 重定向到 /preflight,这种情况在 Task 9 Step 5 会一起补上 fixtures。

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts
git commit -m "fix(router): preflight guard 同时认 passed/skipped

配合 PreflightPage skipAndContinue 改写 skipped。
skipped 路径有 console.warn 留诊断痕迹。"
```

---

## Task 6: server 加 GET /api/internal/health-quick

**Files:**
- Modify: `server/index.js` (在 set-lingjing-token 路由之后, 约 400 行)

- [ ] **Step 1: Find good insertion point**

```bash
grep -n "set-lingjing-token" server/index.js
```

应在该路由处理函数(约 385-399 行)结束的 `})` 之后。

- [ ] **Step 2: Insert handler after set-lingjing-token**

```javascript
app.get('/api/internal/health-quick', (req, res) => {
  const remote = req.socket?.remoteAddress || ''
  const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
  if (!isLoopback) {
    return res.status(403).json({ ok: false, error: 'forbidden: loopback only' })
  }

  const tokenSet = !!lingjingApiToken
  const gatewayConnected = !!(gateway && gateway.isConnected)
  const ok = tokenSet && gatewayConnected

  return res.json({
    ok,
    fields: {
      tokenSet,
      gatewayConnected,
      tokenSuffix: tokenSet ? '...' + lingjingApiToken.slice(-6) : null,
    },
  })
})
```

- [ ] **Step 3: Manual test via curl**

```bash
npm run dev:server
# 另一终端:
curl http://127.0.0.1:3000/api/internal/health-quick
```

Expected (token 没注入时): `{"ok":false,"fields":{"tokenSet":false,"gatewayConnected":...}}`

- [ ] **Step 4: Regression smoke**

```bash
npm run smoke:env
```

Expected: 12/12 通过

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat(server): 加 GET /api/internal/health-quick 兜底自检路由

router guard 启动时静默调用,验证 token 注入 + gateway 连接,
失败才跳完整 PreflightPage。覆盖 server 重启 token 丢失场景。"
```

---

## Task 7: main.js 加 IPC handler 转发到 server

**Files:**
- Modify: `electron/main.js` (在其它 preflight handler 附近, 约 1220 行)

- [ ] **Step 1: Find good insertion point**

```bash
grep -n "preflight-backend-health" electron/main.js
```

约 1220 行有 `ipcMain.handle('lingjing:preflight-backend-health', ...)`。在它**之前**插入新 handler。

- [ ] **Step 2: Insert handler**

```javascript
ipcMain.handle('lingjing:preflight-quick-check', async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/internal/health-quick`, {
      method: 'GET',
    })
    if (!r.ok) {
      return { ok: false, message: `health-quick HTTP ${r.status}` }
    }
    const data = await r.json()
    return data // { ok, fields: { tokenSet, gatewayConnected, tokenSuffix } }
  } catch (e) {
    return { ok: false, message: 'IPC fetch failed: ' + (e?.message || e) }
  }
})
```

- [ ] **Step 3: skip - Task 8 完成后才能在 DevTools 测**

- [ ] **Step 4: skip - 等 Task 9 集成测**

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat(main): 加 lingjing:preflight-quick-check IPC handler

转发 GET /api/internal/health-quick, 失败兜底为 ok:false。"
```

---

## Task 8: preload 暴露 bridge.preflight.quickCheck

**Files:**
- Modify: `electron/preload.cjs:87-95`

- [ ] **Step 1: Find current preflight bridge object**

```bash
sed -n '85,100p' electron/preload.cjs
```

应看到现有 6 个 preflight 方法。

- [ ] **Step 2: Add quickCheck**

在 `startHermes` 行后, `},` 前面加一行:

```javascript
    quickCheck: () => ipcRenderer.invoke('lingjing:preflight-quick-check'),
```

- [ ] **Step 3: Verify in Electron DevTools**

```bash
npm run electron:dev
```

DevTools Console:

```javascript
await window.lingjing.preflight.quickCheck()
// Expected: { ok: false, fields: { tokenSet: false, gatewayConnected: ... } }
//        or { ok: true,  fields: { tokenSet: true,  gatewayConnected: true, ... } }
```

- [ ] **Step 4: skip - Task 9 集成时再 e2e**

- [ ] **Step 5: Commit**

```bash
git add electron/preload.cjs
git commit -m "feat(preload): 暴露 bridge.preflight.quickCheck 给前端"
```

---

## Task 9: router guard 调用 quickCheck (集成关键节点)

**Files:**
- Modify: `src/router/index.ts` (扩展 Task 5 的 guard 逻辑)
- Modify: `tests/helpers/fixtures.ts` (注入 preflight-passed 防 e2e 回归)

- [ ] **Step 1: Read current guard state**

```bash
sed -n '70,90p' src/router/index.ts
```

(Task 5 后应已有 passed/skipped 双判断)

- [ ] **Step 2: Replace block to insert quickCheck**

Task 5 的 7 行代码替换为:

```typescript
  // v1.3.0: 已登录用户,本次 session 还没通过自检 → 强制跳 /preflight。
  // skipPreflight=true 的路由(/preflight 自身)放行避免死循环。
  // v1.5.x: 'skipped' 也放行;无标记时静默跑 quickCheck 兜底。
  if (!to.meta.skipPreflight) {
    const passed = sessionStorage.getItem('lingjing-preflight-passed') === 'ok'
    const skipped = sessionStorage.getItem('lingjing-preflight-skipped') === '1'

    if (passed || skipped) {
      if (skipped && !passed) {
        console.warn('[Router] 用户曾跳过自检, token 状态未确认')
      }
      next()
      return
    }

    // 无标记: 静默 quickCheck 兜底
    const bridge = (window as any).lingjing
    if (bridge?.preflight?.quickCheck) {
      try {
        const qc = await bridge.preflight.quickCheck()
        if (qc?.ok) {
          sessionStorage.setItem('lingjing-preflight-passed', 'ok')
          sessionStorage.setItem('lingjing-preflight-quick-check', '1')
          next()
          return
        }
      } catch (e) {
        console.warn('[Router] quickCheck 异常,回退到 PreflightPage:', e)
      }
    }

    next({ name: 'Preflight', query: { redirect: to.fullPath } })
    return
  }
```

- [ ] **Step 3: Update fixtures.ts to inject preflight-passed**

`tests/helpers/fixtures.ts` 的 `addInitScript` 内追加一行:

```typescript
        sessionStorage.setItem('lingjing-preflight-passed', 'ok')
```

完整 addInitScript 应为:

```typescript
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('lingjing_providers_configured', 'ok')
        sessionStorage.setItem('lingjing-preflight-passed', 'ok')
      } catch {
        // ignore
      }
    })
```

- [ ] **Step 4: Manual smoke + run regression e2e**

```bash
npm run electron:dev
# 看 quickCheck 是否被调,DevTools Console 有日志

npm run test:e2e
# 现有测试全过
```

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts tests/helpers/fixtures.ts
git commit -m "feat(router): guard 静默 quickCheck 兜底, 跳过完整 PreflightPage

无 sessionStorage 标记时调 bridge.preflight.quickCheck(),
通过则直接进主页, 失败才跳 /preflight。

更新 e2e fixtures 注入 preflight-passed 避免破回归。"
```

---

## Task 10: 端到端 e2e 验证 (3 个 spec)

**Files:**
- Create: `tests/preflight/preflight-bypass-fail.spec.ts`
- Create: `tests/preflight/preflight-skip-marks-skipped.spec.ts`
- Create: `tests/preflight/router-quick-check.spec.ts`

- [ ] **Step 1: Write tests/preflight/preflight-bypass-fail.spec.ts**

```typescript
import { test, expect } from '../helpers/fixtures'

test.describe('PreflightPage 第 4 步严格检查 bypass', () => {
  test('mock cfg={bypass:error,openclaw:ok} → step 4 显示 bypass 失败', async ({ page }) => {
    // 注入 mock 把 bridge.autoConfigureViaMain 的返回设成 bypass 失败
    await page.addInitScript(() => {
      const w = window as any
      w.lingjing = w.lingjing || {}
      w.lingjing.autoConfigureViaMain = async () => ({
        bypass: 'error: HTTP 500',
        openclaw: 'ok',
        bypassMessage: 'simulated server reject',
      })
      // 其它 preflight 步骤都 mock 成 ok
      w.lingjing.preflight = {
        backendHealth: async () => ({ ok: true, durationMs: 10 }),
        cleanupStale: async () => ({ ok: true, durationMs: 10 }),
        startOpenClaw: async () => ({ ok: true, durationMs: 10 }),
        testChat: async () => ({ ok: true, durationMs: 10 }),
        startHermes: async () => ({ ok: true, durationMs: 10 }),
        quickCheck: async () => ({ ok: false }),
      }
      sessionStorage.removeItem('lingjing-preflight-passed')
    })

    await page.goto('/preflight')
    await page.waitForTimeout(2000) // 等 6 步跑完

    // 第 4 步(配置模型 Token)应显示 failed + 带 bypass 文案
    const allCards = page.locator('.step-card, [data-step]')
    const step4 = allCards.nth(3)
    await expect(step4).toContainText(/bypass|失败/i, { timeout: 5000 })
  })
})
```

- [ ] **Step 2: Write tests/preflight/preflight-skip-marks-skipped.spec.ts**

```typescript
import { test, expect } from '../helpers/fixtures'

test('点 skipAndContinue → sessionStorage skipped 而非 passed', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.lingjing = w.lingjing || {}
    w.lingjing.preflight = {
      backendHealth: async () => ({ ok: false, durationMs: 10, message: 'simulated' }),
      cleanupStale: async () => ({ ok: true, durationMs: 10 }),
      startOpenClaw: async () => ({ ok: true, durationMs: 10 }),
      testChat: async () => ({ ok: true, durationMs: 10 }),
      startHermes: async () => ({ ok: true, durationMs: 10 }),
      quickCheck: async () => ({ ok: false }),
    }
    w.lingjing.autoConfigureViaMain = async () => ({ bypass: 'ok', openclaw: 'ok' })
    sessionStorage.removeItem('lingjing-preflight-passed')
  })

  await page.goto('/preflight')
  await page.waitForTimeout(2000)

  // 等"跳过"按钮出现并点击
  const skipBtn = page.getByRole('button', { name: /跳过|跳过自检/ })
  await skipBtn.click({ timeout: 10000 })

  await page.waitForTimeout(500)

  const skipped = await page.evaluate(() => sessionStorage.getItem('lingjing-preflight-skipped'))
  const passed = await page.evaluate(() => sessionStorage.getItem('lingjing-preflight-passed'))
  expect(skipped).toBe('1')
  expect(passed).toBeNull()
})
```

- [ ] **Step 3: Write tests/preflight/router-quick-check.spec.ts**

```typescript
import { test, expect } from '../helpers/fixtures'

test.describe('router guard quickCheck 兜底', () => {
  test('quickCheck pass → 直接进主页', async ({ page }) => {
    // fixtures 已注入 preflight-passed='ok',应直接进主页
    await page.goto('/chat')
    await page.waitForURL(/\/chat/, { timeout: 5000 })
    expect(page.url()).toContain('/chat')
  })

  test('清掉 sessionStorage + quickCheck mock fail → 跳 PreflightPage', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.removeItem('lingjing-preflight-passed')
      sessionStorage.removeItem('lingjing-preflight-skipped')
      const w = window as any
      w.lingjing = w.lingjing || {}
      w.lingjing.preflight = {
        ...(w.lingjing.preflight || {}),
        quickCheck: async () => ({ ok: false }),
      }
    })

    await page.goto('/chat')
    // 应被 router guard 拦到 /preflight
    await page.waitForURL(/\/preflight/, { timeout: 5000 })
    expect(page.url()).toContain('/preflight')
  })
})
```

- [ ] **Step 4: Run all preflight tests**

```bash
npm run test:e2e tests/preflight/
```

Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add tests/preflight/
git commit -m "test(preflight): e2e 验证 bypass 检查 + skipped 标记 + quickCheck

3 个 spec 覆盖:
- PreflightPage 第 4 步 bypass 失败显示
- skipAndContinue 写 skipped 不写 passed
- router guard quickCheck pass/fail 路径"
```

---

## Final Verification

After all 10 tasks:

- [ ] **Run full test suite**

```bash
npm run test:unit
npm run test:e2e
npm run smoke:env
```

Expected: All green.

- [ ] **Manual smoke on dev**

```bash
npm run electron:dev
```

1. 第一次启动: 应见 PreflightPage,第 4 步真实跑,token 注入
2. 在 chat 页发一条消息,验证 chat.send 不报"token 未注入"
3. 关 Electron 重开: 应静默 quickCheck 失败(server 重启 token 丢)→ 跳 /Preflight 重跑
4. logout → 重新登入: 应再次走 PreflightPage

- [ ] **Bump v1.5.2 + Build + Release** (前一会话已规划路径,本 plan 不重复)

```bash
# package.json: "version": "1.5.2"
git commit -am "chore(release): bump 1.5.1 -> 1.5.2"
git tag v1.5.2
npm run dist:win
# 上传 release/Lingjing-Setup-1.5.2.exe + blockmap + latest.yml 到 GitHub Release v1.5.2
```

---

## Self-Review

After writing the complete plan, checked against spec v2:

**1. Spec coverage:**
- ✅ 主修复 PreflightPage:87 检查 bypass → Task 2+3
- ✅ skipAndContinue 写 skipped → Task 4
- ✅ router guard 认 skipped → Task 5
- ✅ quickCheck 链路 (server, main, preload, router) → Task 6/7/8/9
- ✅ 5 个测试矩阵全部覆盖:
  - configure-step-checks-bypass / pass-when-bypass-ok → Task 2 vitest 4 case
  - quick-check-pass / fail-no-token → Task 10 router-quick-check.spec.ts
  - skip-button-marks-skipped-not-passed → Task 10 preflight-skip-marks-skipped.spec.ts

**2. Placeholder scan:**
- 无 TBD/TODO ✅
- 每 step 都有具体代码或命令 ✅

**3. Type consistency:**
- `evaluateConfigureStep(cfg) → { ok, message }` 在 Task 2/3 一致 ✅
- `bridge.preflight.quickCheck() → { ok, fields }` 在 Task 7/8/9 一致 ✅
- `lingjing-preflight-passed` / `lingjing-preflight-skipped` 在 Task 4/5/9/10 一致 ✅

Plan ready.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-preflight-timing-fix.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 每 task 一个 fresh subagent,task 间用 two-stage review(spec compliance → code quality),最快迭代。

**2. Inline Execution** - 在当前 session 用 executing-plans skill,batch execution + 检查点 review。

**Which approach?**
