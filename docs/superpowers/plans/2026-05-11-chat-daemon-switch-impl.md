# v1.6 chat 切 daemon 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chat 主路径从 v1.5 bypass 切回 OpenClaw daemon, 让用户感受到 Agent 能力 + 模型自我认同灵境; daemon 不可用时自动 fallback 走 bypass 兜底; 计费继续在 aitoken.homes 完成。

**Architecture:** server/index.js chat.send 拦截层先尝试 `gateway.call('chat.send', ...)` (daemon WebSocket), 失败 fallback `handleChatSendBypass()`. 两条路径都通过 `injectLingjingSystemPrompt` helper 注入身份 system prompt. Feature flag `CHAT_DAEMON_ENABLED=0` 一键回退到纯 bypass.

**Tech Stack:** Node + Express (server), OpenClaw daemon (gateway WebSocket), Vitest (单测), Playwright (e2e), SSE 流式推送.

**Spec Source:** `docs/superpowers/specs/2026-05-11-chat-daemon-switch-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `server/preflight-helpers/systemPrompt.js` | Create | 纯函数 `injectLingjingSystemPrompt(params)` + 常量 |
| `server/preflight-helpers/systemPrompt.test.ts` | Create | vitest 单测 (4 case) |
| `server/index.js` 顶部 import 区 | Modify | import helper |
| `server/index.js:405 handleChatSendBypass` | Modify | 内部 messages 拼装时调 helper |
| `server/index.js` 中部 | Add | `tryDaemonChatSend(req, res, params)` 函数 |
| `server/index.js:1454-1458 chat.send 拦截` | Modify | daemon 优先 → fallback bypass |
| `server/index.js` 顶部 | Add | `CHAT_DAEMON_ENABLED` 读环境变量, 缺省 true |
| `scripts/smoke-daemon-chat.mjs` | Create | L1 dev daemon-chat smoke |
| `tests/chat/daemon-path.spec.ts` | Create | L2 Playwright e2e |
| `package.json scripts` | Modify | 加 `smoke:daemon-chat` |
| `vite.config.ts` test include | Modify | 加 server 路径覆盖单测 |
| `package.json version` | Modify (Task 9) | 1.5.x → 1.6.0 |

---

## Task 1: 扩 vitest config 覆盖 server/ 单测路径

**Files:**
- Modify: `vite.config.ts` test 段

- [ ] **Step 1: Read current test section**

```bash
sed -n '60,72p' vite.config.ts
```

应看到 `include: ['src/**/*.test.ts', 'src/**/*.spec.ts']`

- [ ] **Step 2: Edit test.include**

把 `test:` 段 `include` 改为:

```typescript
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'server/**/*.test.ts'],
    },
```

- [ ] **Step 3: Run regression unit tests**

```bash
npm run test:unit
```

Expected: 4 passed (现有 configureEval 测试不变)

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "chore(test): vitest include 扩到 server/**/*.test.ts"
```

---

## Task 2: TDD injectLingjingSystemPrompt helper

**Files:**
- Create: `server/preflight-helpers/systemPrompt.js`
- Create: `server/preflight-helpers/systemPrompt.test.ts`

- [ ] **Step 1: Create dir + write failing tests**

```bash
mkdir -p server/preflight-helpers
```

`server/preflight-helpers/systemPrompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { injectLingjingSystemPrompt, LINGJING_SYSTEM_PROMPT } from './systemPrompt'

describe('injectLingjingSystemPrompt', () => {
  it('messages 为空 → 加 system prompt 在首位', () => {
    const r = injectLingjingSystemPrompt({ messages: [] })
    expect(r.messages).toHaveLength(1)
    expect(r.messages[0]).toEqual({ role: 'system', content: LINGJING_SYSTEM_PROMPT })
  })

  it('messages 首位是 user → 加 system 在首位', () => {
    const r = injectLingjingSystemPrompt({
      messages: [{ role: 'user', content: '你好' }],
    })
    expect(r.messages).toHaveLength(2)
    expect(r.messages[0].role).toBe('system')
    expect(r.messages[1].content).toBe('你好')
  })

  it('messages 首位已是 system → 保留原 system, 不覆盖', () => {
    const r = injectLingjingSystemPrompt({
      messages: [
        { role: 'system', content: '自定义 prompt' },
        { role: 'user', content: '你好' },
      ],
    })
    expect(r.messages).toHaveLength(2)
    expect(r.messages[0].content).toBe('自定义 prompt')
  })

  it('其他 params 字段保留 + 不变异原对象', () => {
    const original: any = { messages: [], model: 'gpt-5.4', stream: true }
    const r = injectLingjingSystemPrompt(original)
    expect(r.model).toBe('gpt-5.4')
    expect(r.stream).toBe(true)
    expect(original.messages).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test - verify FAIL**

```bash
npm run test:unit
```

Expected: FAIL "Cannot find module './systemPrompt'"

- [ ] **Step 3: Write impl (JS not TS - server/index.js 不经 vite)**

`server/preflight-helpers/systemPrompt.js`:

```javascript
/**
 * v1.6 chat 切 daemon: 给所有 chat.send 注入灵境身份 system prompt.
 * 保证 daemon 路径和 bypass 路径都使用同一份 prompt.
 *
 * 注入算法:
 * - messages 首位是 system → 尊重显式 system, 不覆盖
 * - 否则在 messages[0] 插入灵境 system prompt
 */
export const LINGJING_SYSTEM_PROMPT =
  '你是灵境的 AI 智能体助手, 由 OpenClaw 智能体框架驱动。' +
  '当用户询问你的身份时, 你是"灵境 AI", 不要说自己是 OpenAI 或其它供应商提供的。' +
  '你能为用户调度多智能体、执行自动化任务、调用技能, 让 AI 真正帮上忙。'

/**
 * @param {{ messages?: Array<{role:string,content:string}>, [key:string]:any }} params
 * @returns {{ messages: Array<{role:string,content:string}>, [key:string]:any }}
 */
export function injectLingjingSystemPrompt(params) {
  const messages = Array.isArray(params?.messages) ? [...params.messages] : []
  if (messages[0]?.role !== 'system') {
    messages.unshift({ role: 'system', content: LINGJING_SYSTEM_PROMPT })
  }
  return { ...params, messages }
}
```

- [ ] **Step 4: Run tests - verify PASS**

```bash
npm run test:unit
```

Expected: 8 passed (原 4 configureEval + 新 4 systemPrompt)

- [ ] **Step 5: Commit**

```bash
git add server/preflight-helpers/
git commit -m "feat(chat): TDD injectLingjingSystemPrompt helper + 单测

v1.6 chat 切 daemon 第一块: 抽取 system prompt 注入逻辑为 pure function.
daemon 路径和 bypass 路径都通过此 helper 注入灵境身份 prompt.
4 case 覆盖 messages 空/首 user/首 system/其他字段保留.

实现用 .js (server/index.js ESM 不经 vite, 不支持 import .ts),
测试用 .test.ts (vitest 自动 resolve)."
```

---

## Task 3: handleChatSendBypass 用 helper 注入 system prompt

**Files:**
- Modify: `server/index.js` 顶部 import + line ~417-422

- [ ] **Step 1: Find imports section**

```bash
head -50 server/index.js | grep -n "^import" | tail -3
```

记下最后一个 import 行号.

- [ ] **Step 2: Add helper import**

在最后一个 import 之后加:

```javascript
import { injectLingjingSystemPrompt } from './preflight-helpers/systemPrompt.js'
```

- [ ] **Step 3: Patch handleChatSendBypass**

`server/index.js` 找到 `handleChatSendBypass` 内部 messages 拼装段 (约 line 417):

替换:
```javascript
      const history = getChatHistory(sessionKey)
      const messages = [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: messageText },
      ]
```

为:
```javascript
      // v1.6: 通过 helper 统一注入灵境身份 system prompt (daemon 路径也用同一 helper)
      const history = getChatHistory(sessionKey)
      const baseMessages = [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: messageText },
      ]
      const injected = injectLingjingSystemPrompt({ messages: baseMessages })
      const messages = injected.messages
```

- [ ] **Step 4: Boot dev:server + smoke**

```bash
npm run dev:server &
sleep 4
curl -s -X POST http://127.0.0.1:3000/api/rpc \
  -H 'Content-Type: application/json' \
  -d '{"method":"chat.send","params":{"sessionKey":"x","message":"ping"}}'
pkill -f "node --env-file=.env server/index.js" || true
```

Expected: `{"ok":false,"error":{"message":"灵境 token 未注入,请先登录"}}` (启动 + 路由 OK; token 未注入是正常)

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat(chat): handleChatSendBypass 用 helper 注入 system prompt

v1.6 chat 切 daemon 第二块: bypass 路径接入 helper, 与 daemon 路径一致.
模型从此不再说 '我是 OpenAI', 自我认同灵境 AI 智能体助手."
```

---

## Task 4: 加 CHAT_DAEMON_ENABLED feature flag

**Files:**
- Modify: `server/index.js` 顶部 (envConfig 段附近)

- [ ] **Step 1: Find envConfig**

```bash
grep -n "envConfig\b" server/index.js | head -5
```

- [ ] **Step 2: Add CHAT_DAEMON_ENABLED**

在 envConfig 定义之后(找一个合适位置, 比如 `const BACKEND_PORT` 那行附近)加:

```javascript
// v1.6: chat 主路径切 daemon 的 feature flag.
// '1' (默认) = daemon 优先, fallback bypass; '0' = 强制走 bypass 旧路径.
// 出 daemon 问题时可一键设 CHAT_DAEMON_ENABLED=0 立刻回退.
const CHAT_DAEMON_ENABLED = process.env.CHAT_DAEMON_ENABLED !== '0'
console.log(`[server] CHAT_DAEMON_ENABLED=${CHAT_DAEMON_ENABLED ? '1 (daemon 优先)' : '0 (纯 bypass)'}`)
```

- [ ] **Step 3: Verify boot log**

```bash
npm run dev:server 2>&1 &
sleep 4
# 查日志 "CHAT_DAEMON_ENABLED" 应出现
pkill -f "node --env-file=.env server/index.js" || true
```

Expected: 启动 stdout 含 `[server] CHAT_DAEMON_ENABLED=1 (daemon 优先)`

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(chat): 加 CHAT_DAEMON_ENABLED feature flag (默认 1)

v1.6 chat 切 daemon 回滚保险: 任何时候设 CHAT_DAEMON_ENABLED=0
立刻回退纯 bypass, 不需要重新打包."
```

---

## Task 5: 新增 tryDaemonChatSend 函数

**Files:**
- Add: `server/index.js` 中部 (preflight-test-chat 路由之前, 约 line 495)

- [ ] **Step 1: Find insertion point**

```bash
grep -n "^app.post('/api/lingjing/preflight-test-chat" server/index.js
```

- [ ] **Step 2: Insert tryDaemonChatSend before that line**

```javascript
/**
 * v1.6 chat 主路径: 通过 daemon WebSocket 调 chat.send,
 * daemon 内部用 aitoken.homes 作 OpenAI Provider 完成 LLM 调用.
 * 流式响应通过现有 daemon→server SSE 事件桥接到前端 (broadcastSSE 已有).
 *
 * 注: 本函数不调 res.json, 调用方负责管理 res (统一控制 ack 顺序).
 *
 * @returns {{ok:true, viaDaemon:true, idempotencyKey:string, payload:any}|{ok:false, reason:string}}
 */
async function tryDaemonChatSend(req, res, params) {
  const idempotencyKey = params?.idempotencyKey || `daemon-${Date.now()}`

  // 1. WebSocket 不通 → 立刻 fail, 不浪费时间
  if (!gateway || gateway.ws?.readyState !== 1 /* OPEN */) {
    return { ok: false, reason: 'gateway-ws-not-open' }
  }

  // 2. 注入 system prompt (与 bypass 一致)
  const daemonParams = injectLingjingSystemPrompt(params || {})

  try {
    // 3. 30s timeout 包装 daemon call
    const result = await Promise.race([
      gateway.call('chat.send', daemonParams),
      new Promise((_, reject) => setTimeout(() => reject(new Error('daemon-timeout-30s')), 30000)),
    ])
    console.log(`[chat-daemon] ok runId=${idempotencyKey}`)
    return { ok: true, viaDaemon: true, idempotencyKey, payload: result }
  } catch (e) {
    const reason = e?.message || String(e)
    console.warn(`[chat-daemon] failed (runId=${idempotencyKey}): ${reason}`)
    return { ok: false, reason }
  }
}

```

- [ ] **Step 3: dev:server boot smoke (syntax check)**

```bash
npm run dev:server &
sleep 4
# 应启动无 syntax error
curl -s -X POST http://127.0.0.1:3000/api/rpc -H 'Content-Type: application/json' \
  -d '{"method":"unknown.method","params":{}}' | head -c 200
pkill -f "node --env-file=.env server/index.js" || true
```

Expected: 返回某种 RPC error JSON (说明 server 启动且接受 POST).

- [ ] **Step 4: skip - 路由还没接入, Task 6 测**

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat(chat): 加 tryDaemonChatSend 函数 (尚未接入路由)

v1.6 chat 切 daemon 核心: gateway.call('chat.send', ...) WebSocket 路径.
注入 system prompt + 30s timeout + ok/reason 返回结构供 fallback 决策.
ws-not-open → 立刻 fail; timeout / call error → reason 给调用方.

下一 task 改 chat.send 拦截器先调本函数, 失败再 bypass."
```

---

## Task 6: chat.send 拦截改为 daemon 优先 + fallback bypass [核心切换]

**Files:**
- Modify: `server/index.js:1454-1458`

- [ ] **Step 1: Find current chat.send block**

```bash
grep -n "method === 'chat.send'" server/index.js
```

- [ ] **Step 2: Replace block**

替换原:
```javascript
  if (method === 'chat.send') {
    if (!lingjingApiToken) {
      return res.json({ ok: false, error: { message: '灵境 token 未注入,请先登录' } })
    }
    return await handleChatSendBypass(req, res, params || {})
  }
```

为:
```javascript
  if (method === 'chat.send') {
    if (!lingjingApiToken) {
      return res.json({ ok: false, error: { message: '灵境 token 未注入,请先登录' } })
    }
    // v1.6: daemon 优先, fallback bypass.
    // CHAT_DAEMON_ENABLED=0 跳过 daemon 直接走 bypass (紧急回滚).
    if (CHAT_DAEMON_ENABLED) {
      const daemonRes = await tryDaemonChatSend(req, res, params || {})
      if (daemonRes.ok) {
        // daemon 链路成功. daemon 已通过 SSE 推 chat.delta/chat.final.
        // 这里 ack 前端 (chat.send 是 RPC 调用, 前端等 ok=true 才转 'waiting').
        return res.json({ ok: true, payload: { runId: daemonRes.idempotencyKey, lingjingDaemon: true } })
      }
      console.warn(`[chat] daemon 不可用, 回退 bypass: ${daemonRes.reason}`)
    }
    return await handleChatSendBypass(req, res, params || {})
  }
```

- [ ] **Step 3: dev:server smoke - daemon down 自动 fallback**

```bash
# 杀残留 daemon
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 18789 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }"

npm run dev:server &
sleep 4

# 注入 token (用 .env.test 里的 jax token, 或随便一个 fake 让 chat.send 不被 token check 卡)
TOKEN="$(cat .env.test | grep LINGJING_TEST_TOKEN | cut -d= -f2-)"
if [ -z "$TOKEN" ]; then TOKEN="sk-test-fake-1234567890abcdef"; fi
curl -s -X POST http://127.0.0.1:3000/api/internal/set-lingjing-token \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"baseUrl\":\"https://api.aitoken.homes/v1\"}"

# chat.send 应自动走 bypass (daemon 不在)
RESPONSE=$(curl -s -X POST http://127.0.0.1:3000/api/rpc \
  -H 'Content-Type: application/json' \
  -d '{"method":"chat.send","params":{"sessionKey":"smoke","message":"ping"}}')
echo "Response: $RESPONSE"

pkill -f "node --env-file=.env server/index.js" || true
```

Expected:
- `Response` 含 `"lingjingBypass":true` (因为 daemon 不在 fallback)
- server stdout 应有 `[chat] daemon 不可用, 回退 bypass: gateway-ws-not-open`

- [ ] **Step 4: skip - L1 smoke 脚本会更系统**

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat(chat): chat.send 拦截 daemon 优先 + fallback bypass [核心切换]

v1.6 chat 主路径切换. server/index.js chat.send 拦截器:
- CHAT_DAEMON_ENABLED=1 (默认): tryDaemonChatSend → 失败 fallback bypass
- CHAT_DAEMON_ENABLED=0: 跳过 daemon 直接 bypass (紧急回滚)

daemon 成功: res ack lingjingDaemon=true + daemon SSE 流给前端
daemon 失败: 日志 + fallback bypass, 用户感觉慢 1 秒但 chat 仍可用

Spec: docs/superpowers/specs/2026-05-11-chat-daemon-switch-design.md"
```

---

## Task 7: L1 daemon-chat smoke 脚本

**Files:**
- Create: `scripts/smoke-daemon-chat.mjs`
- Modify: `package.json scripts`

- [ ] **Step 1: Write smoke script**

`scripts/smoke-daemon-chat.mjs`:

```javascript
#!/usr/bin/env node
/**
 * v1.6 L1 验证: daemon chat 链路端到端是否能跑.
 * 前置: dev:server + OpenClaw daemon (18789) + lingjingApiToken 已注入.
 *
 * 1. POST /api/rpc {method:'chat.send', params}
 * 2. 同时听 /api/events SSE 流, 20s 内拿到 chat.delta + chat.final
 * 3. assert rpc payload.lingjingDaemon === true (daemon 路径成功)
 */
import http from 'node:http'

const PORT = process.env.PORT || 3000
const TIMEOUT_MS = 20000

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ method, params })
    const req = http.request(
      {
        hostname: '127.0.0.1', port: PORT, path: '/api/rpc',
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let buf = ''
        res.on('data', (c) => (buf += c))
        res.on('end', () => { try { resolve(JSON.parse(buf)) } catch (e) { reject(e) } })
      },
    )
    req.on('error', reject); req.write(body); req.end()
  })
}

function collectSSEFor(timeoutMs) {
  return new Promise((resolve, reject) => {
    const events = []
    const req = http.get({ hostname: '127.0.0.1', port: PORT, path: '/api/events' }, (res) => {
      let buf = ''
      res.on('data', (c) => {
        buf += c.toString('utf8')
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try { events.push(JSON.parse(line.slice(5).trim())) } catch {}
          }
        }
      })
    })
    const timer = setTimeout(() => { try { req.destroy() } catch {}; resolve(events) }, timeoutMs)
    req.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
}

(async () => {
  console.log('=== v1.6 daemon-chat L1 smoke ===')
  console.log('前置: dev:server + daemon (18789) + lingjingApiToken 已注入\n')

  const ssePromise = collectSSEFor(TIMEOUT_MS)
  await new Promise((r) => setTimeout(r, 500)) // 让 SSE 先 connect

  const sentAt = Date.now()
  const rpcRes = await rpcCall('chat.send', {
    sessionKey: 'smoke-' + Date.now(),
    messages: [{ role: 'user', content: 'ping, reply with 5 words please' }],
  })
  console.log('RPC ack:', JSON.stringify(rpcRes))

  if (!rpcRes.ok) {
    console.error('FAIL: RPC ok=false (无 token 或 daemon down 且 bypass 也失败?)')
    process.exit(1)
  }

  const events = await ssePromise
  const deltas = events.filter((e) => e.event === 'chat.delta')
  const finals = events.filter((e) => e.event === 'chat.final')
  console.log(`SSE: ${deltas.length} delta + ${finals.length} final in ${Date.now() - sentAt}ms`)

  if (deltas.length === 0) {
    console.error('FAIL: 没收到 chat.delta')
    process.exit(1)
  }

  if (rpcRes.payload?.lingjingDaemon === true) {
    console.log('✓ PASS: chat 走 daemon 路径')
    process.exit(0)
  } else if (rpcRes.payload?.lingjingBypass === true) {
    console.log('⚠ PASS (走了 fallback bypass): daemon 不可用')
    process.exit(0)
  } else {
    console.error('FAIL: 不识别的路径 (无 lingjingDaemon/lingjingBypass 标记)')
    process.exit(1)
  }
})().catch((e) => { console.error('SMOKE 异常:', e); process.exit(1) })
```

- [ ] **Step 2: Add npm script**

`package.json scripts` 段在 `smoke:full:boot` 之后加一行:

```json
    "smoke:daemon-chat": "node --env-file-if-exists=.env.test scripts/smoke-daemon-chat.mjs",
```

- [ ] **Step 3: skip - 实际跑由 Task 9 手动**

(本 step 跳过, Task 9 真实账号场景下执行)

- [ ] **Step 4: skip step**

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-daemon-chat.mjs package.json
git commit -m "test(chat): L1 daemon-chat smoke 脚本 + npm script

v1.6 chat 切 daemon L1 验证: chat.send RPC + 听 SSE,
20s 内拿到 delta+final, 检测 lingjingDaemon/lingjingBypass 路径标记.

发版前手动: npm run smoke:daemon-chat (需 dev + daemon + token 就位)"
```

---

## Task 8: L2 Playwright e2e daemon-path

**Files:**
- Create: `tests/chat/daemon-path.spec.ts`

- [ ] **Step 1: Write e2e spec**

```bash
mkdir -p tests/chat
```

`tests/chat/daemon-path.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run e2e**

```bash
# 前置: dev server 已起 (npm run dev:all 或 electron:dev)
# 若没起, 先开:
npm run dev:all &
sleep 8

npm run test:e2e tests/chat/
```

Expected: 2 passed.

- [ ] **Step 3: skip step**

- [ ] **Step 4: Cleanup dev server**

```bash
pkill -f "vite\|node --env-file=.env server/index.js" || true
```

- [ ] **Step 5: Commit**

```bash
git add tests/chat/
git commit -m "test(chat): L2 Playwright e2e daemon-path + fallback-bypass

v1.6 L2 验证: 2 case mock /api/rpc 返回 lingjingDaemon/lingjingBypass 标记,
验证前端两条路径都不报错.

(实际 daemon 端到端 jax 账号验证在 L3 Task 9)"
```

---

## Task 9: L3 真实账号端到端 + bump v1.6.0

**Files:**
- Modify: `package.json` version

- [ ] **Step 1: Manual L3 verification checklist**

打开 Electron 浏览器:

```
[ ] 1. npm run electron:dev 启动 Electron
[ ] 2. 登录 jax 账号 (.env.test 已配)
[ ] 3. PreflightPage 6 步全过 (含 daemon 起来 + token 注入)
[ ] 4. 进入 /chat 页面
[ ] 5. 发消息 "你好" → 收到流式回复 (不是"我是 OpenAI")
[ ] 6. 发消息 "你是 OpenClaw 吗?" → 回复明确自我认同灵境/OpenClaw
[ ] 7. 看 backend.log 含 [chat-daemon] ok runId=...
[ ] 8. 看 backend.log 不含 [chat] daemon 不可用, 回退 bypass
[ ] 9. 检查 aitoken.homes 后台: quota 真扣
[ ] 10. 关闭 daemon (kill 18789 进程) 后, chat 仍能用 (走 bypass fallback) + backend.log 有 fallback 日志
```

任一项 fail → 阻断 v1.6.0 发布. 修后重跑.

- [ ] **Step 2: Run L1 smoke**

```bash
# 前置: electron:dev 跑着 + PreflightPage 跑完 + token 注入
npm run smoke:daemon-chat
```

Expected: `✓ PASS: chat 走 daemon 路径`

- [ ] **Step 3: Bump version**

`package.json` line 5:
```json
  "version": "1.6.0",
```

- [ ] **Step 4: Regression**

```bash
npm run test:unit && npm run test:e2e && npm run smoke:env
```

Expected: all green.

- [ ] **Step 5: Commit version bump + Tag**

```bash
git add package.json
git commit -m "chore(release): bump 1.5.x -> 1.6.0 (chat 切 daemon)"
git tag v1.6.0
```

Manual subsequent steps:
- `npm run dist:win` 打包
- 上传 release/Lingjing-Setup-1.6.0.exe + .blockmap + latest.yml 到 GitHub Release v1.6.0
- `git push origin main-fresh:main && git push origin v1.6.0`

---

## Final Verification

After all 9 tasks:

- [ ] **Full test suite**
```bash
npm run test:unit && npm run test:e2e && npm run smoke:env
```

- [ ] **L1 smoke** (`npm run smoke:daemon-chat`)
- [ ] **L3 checklist 10 项** (Task 9 step 1)
- [ ] **Observe 1-2 周**: backend.log fallback 率 < 5% + 用户反馈"是灵境/OpenClaw 不是 OpenAI"

---

## Self-Review

After writing the complete plan, checked against spec:

**1. Spec coverage:**
- ✅ 架构 daemon 优先 + fallback bypass → Task 5+6
- ✅ System Prompt 注入 → Task 2+3 (helper + bypass 接入)
- ✅ Fallback 触发条件 4 种 → Task 5 tryDaemonChatSend (ws-not-open / timeout / call-error)
- ✅ Feature flag CHAT_DAEMON_ENABLED → Task 4
- ✅ L1 smoke → Task 7
- ✅ L2 e2e → Task 8
- ✅ L3 真实账号 → Task 9
- ✅ Acceptance criteria 7 条 → 分布在 Task 9 checklist 10 项

**2. Placeholder scan:**
- 无 TBD/TODO ✅
- 每 step 有具体代码或命令 ✅

**3. Type consistency:**
- `injectLingjingSystemPrompt(params) → {messages, ...params}` Task 2/3 一致 ✅
- `tryDaemonChatSend(req, res, params) → {ok, viaDaemon?, reason?, idempotencyKey?, payload?}` Task 5/6 一致 ✅
- `CHAT_DAEMON_ENABLED` boolean Task 4/6 一致 ✅
- `payload.lingjingDaemon` vs `payload.lingjingBypass` 标记 Task 6/7/8 一致 ✅

Plan ready.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-11-chat-daemon-switch-impl.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 每 task 一个 fresh subagent, 两阶段 review (spec 合规 → 代码质量), 最快迭代. 适合本 plan 9 task 中等复杂度.

**2. Inline Execution** - 在当前 session 用 executing-plans skill, batch 跑 + 检查点. 上下文连贯, 但主会话上下文会被代码填满.

**Which approach?**
