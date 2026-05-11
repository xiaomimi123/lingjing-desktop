# v1.6 Hermes iframe 嵌入 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删 21,000 行 Hermes UI Vue 复刻代码, 用单个 iframe 嵌入 Hermes 原生 dashboard (端口 9119), server 反向代理 + 透明注入 token 让用户感觉无缝.

**Architecture:** Vue 路由 `/hermes/*` → wildcard 路由 → `HermesEmbed.vue` (单 iframe). iframe src = `/api/hermes/embed{subPath}`. server/hermes-proxy.js 新增 `/api/hermes/embed/*` reverse proxy 转发 9119, HTML 响应拦截替换 `window.__HERMES_SESSION_TOKEN__` 注入灵境侧 token. 静态资源 (JS/CSS/字体) 透传, WebSocket 升级透传 (如需).

**Tech Stack:** Vue 3 (前端), Express (server), Node fetch + stream pipe (reverse proxy), Vitest (单测), Playwright (e2e).

**Spec Source:** `docs/superpowers/specs/2026-05-11-hermes-iframe-design.md`

**4 阶段:**
- **阶段 1** (Task 1-3): HermesEmbed.vue + router wildcard + 1 条路由先试通 dev (不动 server proxy, 先验前端骨架)
- **阶段 2** (Task 4-7): server `/api/hermes/embed/*` reverse proxy + token 探明/缓存 + token 注入 + L1 验证
- **阶段 3** (Task 8-10): 切全部 hermes 路由到 wildcard + 删 20 个 Vue 文件 + 编译/e2e 验证
- **阶段 4** (Task 11-13): L3 真实账号 + bump 1.6.0 + dist:win + GitHub Release

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `src/views/hermes/HermesEmbed.vue` | Create | 单 iframe 组件, src 计算 |
| `src/router/routes.ts` | Modify | 删 18 条 hermes 路由, 加 1 条 wildcard |
| `server/hermes-proxy.js` | Modify | 新增 `/api/hermes/embed/*` reverse proxy + token 注入 + token cache |
| `server/index.js` | Modify (小) | (可能) hermesEmbedToken 共享变量 |
| `scripts/smoke-hermes-iframe.mjs` | Create | L1 验证脚本: curl `/api/hermes/embed/` 看是否含注入 token |
| `tests/hermes/iframe-route.spec.ts` | Create | L2 Playwright e2e: 导航 /hermes 路由不报错 |
| `src/views/hermes/*.vue` (13 个) | Delete | Hermes UI advanced 版复刻 |
| `src/views/lingjing/Hermes*.vue` (7 个) | Delete | Hermes UI basic 版复刻 |
| `package.json` scripts | Modify | 加 `smoke:hermes-iframe` |

---

## Task 1: HermesEmbed.vue 单 iframe 组件

**Files:**
- Create: `src/views/hermes/HermesEmbed.vue`

- [ ] **Step 1: Write the component**

`src/views/hermes/HermesEmbed.vue`:

```vue
<script setup lang="ts">
/**
 * v1.6: 单 iframe wrapper, 嵌入 Hermes 原生 dashboard.
 * Vue Router 把 /hermes/* 全部路由到这个组件, 通过 $route.path 计算 iframe src.
 * server 端 /api/hermes/embed/* reverse proxy 到 http://127.0.0.1:9119/* + 注入 token.
 */
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
// 路径映射:
//   /hermes        → /api/hermes/embed/
//   /hermes/chat   → /api/hermes/embed/chat
//   /hermes/foo/bar → /api/hermes/embed/foo/bar
const iframeSrc = computed(() => {
  const sub = route.path.replace(/^\/hermes/, '') || '/'
  return `/api/hermes/embed${sub}`
})
</script>

<template>
  <div class="hermes-embed-root">
    <iframe :src="iframeSrc" class="hermes-embed-frame" />
  </div>
</template>

<style scoped>
.hermes-embed-root {
  width: 100%;
  height: 100%;
  display: flex;
}
.hermes-embed-frame {
  flex: 1;
  border: none;
  width: 100%;
  height: 100%;
}
</style>
```

- [ ] **Step 2: TypeScript compile check**

```bash
npx vue-tsc --noEmit 2>&1 | tail -10
```

Expected: 0 error (现有 Hermes 文件仍在不报错, 新 HermesEmbed.vue 编译通过)

- [ ] **Step 3: Run unit tests (regression)**

```bash
npm run test:unit
```

Expected: 8 passed (现有测试不破)

- [ ] **Step 4: skip — Task 2 接入路由后才能 e2e 验证**

- [ ] **Step 5: Commit**

```bash
git add src/views/hermes/HermesEmbed.vue
git commit -m "feat(hermes): 加 HermesEmbed.vue 单 iframe 组件 (v1.6 选项 B)

iframe src 根据 route.path 动态计算: /hermes/chat → /api/hermes/embed/chat.
server 反向代理 9119 + 注入 token 由 Task 4-6 实现.

Spec: docs/superpowers/specs/2026-05-11-hermes-iframe-design.md"
```

---

## Task 2: router 加 1 条试点路由 (保留旧路由不动)

**Files:**
- Modify: `src/router/routes.ts` (在 `path: 'hermes'` 路由之前加 wildcard 试点)

- [ ] **Step 1: Find the hermes top route**

```bash
grep -n "path: 'hermes'" src/router/routes.ts | head -3
```

应找到 line ~175: `path: 'hermes'` (Hermes 概览)

- [ ] **Step 2: Add new test route 'hermes-embed-test' BEFORE existing hermes routes**

在第一个 hermes 路由之前 (约 line 174 的 `},` 之后) 插入:

```typescript
      {
        path: 'hermes-embed-test',
        name: 'HermesEmbedTest',
        component: () => import('@/views/hermes/HermesEmbed.vue'),
        meta: { title: 'Hermes iframe 试点', icon: 'TabletPortraitOutline', gateway: 'hermes', section: 'system', hidden: true },
      },
```

这是**试点路由**, 不替换现有 `/hermes/*`, 留作并存观察. Task 8 才删旧路由切 wildcard.

- [ ] **Step 3: Boot dev and navigate**

```bash
npm run dev 2>&1 &
sleep 5
# 在浏览器手动开 http://localhost:3001/#/hermes-embed-test
# 预期: iframe 试图加载 /api/hermes/embed/-embed-test
# (因 path 计算 = '/hermes-embed-test'.replace(/^\/hermes/,'') = '-embed-test')
# 暂时 iframe 内会 404 因 server proxy 未做, Task 4-6 才完成
pkill -f vite 2>/dev/null || true
```

> 实际情况: dev 模式打开 /hermes-embed-test 应当 渲染 HermesEmbed.vue + iframe 显示 404 (server proxy 未做). 这是预期, 验证前端骨架就位.

- [ ] **Step 4: skip — e2e 等 server proxy 完成**

- [ ] **Step 5: Commit**

```bash
git add src/router/routes.ts
git commit -m "feat(router): 加 /hermes-embed-test 试点路由

试点路由独立加, 保留所有现有 /hermes/* 路由不动.
等 server proxy 跑通后 (Task 4-6), Task 8 切全部 hermes 路由到 wildcard."
```

---

## Task 3: 手动 dev 试通前端骨架

**Files:** (无文件改动, 仅手动验证)

- [ ] **Step 1: Boot dev server**

```bash
npm run dev 2>&1 &
sleep 6
```

- [ ] **Step 2: Browser test**

打开 http://localhost:3001/#/hermes-embed-test, 应该看到:
- 灵境主框架 (sidebar + header) 渲染
- 中间区域是个 iframe
- iframe 内容 = 404 (因 /api/hermes/embed/-embed-test 后端未实现)

按 F12 → Network → 看到一个 `/api/hermes/embed/-embed-test` 请求, 返回 404.

- [ ] **Step 3: skip — assertion 是手动 visual**

- [ ] **Step 4: Cleanup**

```bash
pkill -f vite 2>/dev/null || true
```

- [ ] **Step 5: 不 commit (无改动)**

---

## Task 4: server `/api/hermes/embed/*` 反向代理 (无 token 注入)

**Files:**
- Modify: `server/hermes-proxy.js` (在 `export default router` 之前加新 endpoint)

- [ ] **Step 1: Find insertion point**

```bash
grep -n "^const router\|^export default" server/hermes-proxy.js | head -3
```

应该有 `const router = Router()` 在顶部和 `export default router` 在底部.

- [ ] **Step 2: Add reverse proxy route**

在 `export default router` 之前加:

```javascript
/**
 * v1.6: Hermes UI iframe 反向代理.
 * /api/hermes/embed/<path>  →  http://127.0.0.1:9119/<path>
 * - HTML 响应拦截, 替换 window.__HERMES_SESSION_TOKEN__ 注入灵境侧 token
 * - 静态资源 (JS/CSS/字体/图片) 透传 stream pipe
 * - 不要求 auth middleware (iframe 内由 Hermes token 自己处理)
 */
let hermesEmbedToken = null
export function setHermesEmbedToken(token) {
  hermesEmbedToken = token
  console.log(`[hermes-embed] token cached, suffix=...${(token || '').slice(-6)}`)
}

router.use('/api/hermes/embed', async (req, res) => {
  try {
    const base = (hermesConfig?.webUrl || 'http://127.0.0.1:9119').replace(/\/+$/, '')
    const upstreamUrl = base + (req.url || '/')

    const fetchOpts = {
      method: req.method,
      headers: { ...req.headers, host: new URL(base).host },
      redirect: 'manual',
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      fetchOpts.body = req
      fetchOpts.duplex = 'half'
    }

    const upstream = await fetch(upstreamUrl, fetchOpts)

    res.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      // 跳过可能阻 iframe 的头 (Hermes 默认没设, 但保险)
      if (/^(x-frame-options|content-security-policy|content-length|transfer-encoding|connection)$/i.test(key)) {
        return
      }
      res.setHeader(key, value)
    })

    const contentType = upstream.headers.get('content-type') || ''
    if (contentType.includes('text/html')) {
      let html = await upstream.text()
      // 替换 token (即使 hermesEmbedToken 为空也替换, 让 iframe 至少不 stale)
      html = html.replace(
        /window\.__HERMES_SESSION_TOKEN__\s*=\s*"[^"]*"/,
        `window.__HERMES_SESSION_TOKEN__="${hermesEmbedToken || ''}"`,
      )
      res.send(html)
    } else {
      // 二进制/JS/CSS/字体 透传
      if (upstream.body) {
        const { Readable } = await import('node:stream')
        Readable.fromWeb(upstream.body).pipe(res)
      } else {
        res.end()
      }
    }
  } catch (e) {
    console.error('[hermes-embed] proxy error:', e?.message || e)
    res.status(503).send(`Hermes 服务未启动或不可达: ${e?.message || e}`)
  }
})
```

- [ ] **Step 3: Verify Hermes dashboard is running, smoke proxy**

```bash
# 启动 hermes dashboard 后台
"resources/hermes/venv/Scripts/hermes.exe" dashboard --port 9119 2>&1 &
sleep 5

# 启 electron:dev 让 server 跑 (better-sqlite3 ABI 问题: 必须经 Electron)
npm run electron:dev 2>&1 &
sleep 30

# Test proxy
curl -s http://127.0.0.1:3000/api/hermes/embed/ | head -20
```

Expected: 返回 Hermes dashboard HTML, 含 `<title>Hermes Agent - Dashboard</title>` + `window.__HERMES_SESSION_TOKEN__=""` (空, 因 setHermesEmbedToken 还没被调用).

- [ ] **Step 4: Cleanup**

```bash
powershell -NoProfile -Command "Get-Process -Name 'Lingjing','electron' -ErrorAction SilentlyContinue | Stop-Process -Force; Get-NetTCPConnection -LocalPort (9119,3000,3001,18789..18795) -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>&1 | tail -1
```

- [ ] **Step 5: Commit**

```bash
git add server/hermes-proxy.js
git commit -m "feat(hermes): 加 /api/hermes/embed/* 反向代理 (token 注入空载)

server/hermes-proxy.js 新增 router.use('/api/hermes/embed') reverse proxy:
- fetch 转发到 Hermes 9119
- HTML 响应拦截替换 window.__HERMES_SESSION_TOKEN__
- 静态资源透传 (web stream → node stream pipe)
- 删可能阻 iframe 的 headers (x-frame-options 等)

hermesEmbedToken 由 setHermesEmbedToken() 注入, Task 5 探明 token 来源后调用."
```

---

## Task 5: 探明 Hermes token 来源 + setHermesEmbedToken 调用点

**Files:**
- Modify: `server/hermes-proxy.js` (在 startHermesDashboard 后加 token 抓取)

- [ ] **Step 1: 探明 Hermes token 生成机制**

```bash
# 启动 Hermes dashboard 看 stdout 是否打印 token
"resources/hermes/venv/Scripts/hermes.exe" dashboard --port 9119 2>&1 | head -30 &
sleep 5

# 看返回 HTML 中 token
curl -s http://127.0.0.1:9119/ | grep -oE '__HERMES_SESSION_TOKEN__="[^"]*"' | head -1

# 看 ~/.hermes-agent/ 状态目录
ls -la ~/.hermes-agent/ 2>&1 | head -10

# Cleanup
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 9119 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>&1 | tail -1
```

期望发现 token 在 HTML 里 (已知事实, 之前 spec 探测确认), 直接从 `curl http://127.0.0.1:9119/` 抓取即可.

- [ ] **Step 2: 加 fetchHermesTokenFromHTML 函数**

`server/hermes-proxy.js` 在 `setHermesEmbedToken` 函数之后加:

```javascript
/**
 * 从 Hermes dashboard HTML 抓取 window.__HERMES_SESSION_TOKEN__.
 * Hermes 启动时把 token 直接写进 HTML <script>, 我们 fetch 一次 / 就能拿到.
 * 由 startHermesDashboard() 启动成功后调用, 缓存到 hermesEmbedToken.
 */
async function fetchHermesTokenFromHTML() {
  try {
    const base = (hermesConfig?.webUrl || 'http://127.0.0.1:9119').replace(/\/+$/, '')
    const r = await fetch(base + '/')
    if (!r.ok) return null
    const html = await r.text()
    const m = html.match(/__HERMES_SESSION_TOKEN__\s*=\s*"([^"]+)"/)
    return m?.[1] || null
  } catch (e) {
    console.warn('[hermes-embed] fetchHermesTokenFromHTML failed:', e?.message || e)
    return null
  }
}
```

- [ ] **Step 3: 找 startHermesDashboard 函数 + 在启动成功后调用**

```bash
grep -n "function startHermesDashboard\|dashboardProcess = spawn" server/hermes-proxy.js | head -5
```

找到启动 dashboard 的位置 (约 line 198 `dashboardProcess = spawn(hermesPath, ['dashboard', '--port', String(port)]...`).

在 spawn 之后, daemon 应该有 5-10s 启动时间. 加 polling token 的 logic. 在 `startHermesDashboard` 函数末尾返回前 (或 dashboard 启动成功的 callback) 加:

```javascript
  // v1.6: 启动后异步轮询 token, 最多 30s
  ;(async () => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const token = await fetchHermesTokenFromHTML()
      if (token) {
        setHermesEmbedToken(token)
        return
      }
    }
    console.warn('[hermes-embed] 30s 内未拿到 Hermes session token, iframe 可能未登录')
  })()
```

具体放哪取决于 startHermesDashboard 的现有代码结构, 实施时 Read 完整函数定位"daemon 起来后"的合适位置 (一般是 spawn 后 + 端口探测通后).

- [ ] **Step 4: 验证 token 被抓取**

```bash
echo "" > .userdata/logs/backend.log
npm run electron:dev 2>&1 &
sleep 60

# 看日志
grep -E "hermes-embed|HERMES_SESSION" .userdata/logs/backend.log | tail -5

powershell -NoProfile -Command "Get-Process -Name 'Lingjing','electron' -ErrorAction SilentlyContinue | Stop-Process -Force" 2>&1 | tail -1
```

Expected: backend.log 含 `[hermes-embed] token cached, suffix=...xxxxxx`

- [ ] **Step 5: Commit**

```bash
git add server/hermes-proxy.js
git commit -m "feat(hermes): 启动 dashboard 后异步抓 Hermes token, 缓存到 hermesEmbedToken

启动成功后 polling fetch http://127.0.0.1:9119/ 抓取 HTML 里的
__HERMES_SESSION_TOKEN__, 最多 30s. 抓到后 setHermesEmbedToken().

后续 /api/hermes/embed/* 反向代理 HTML 拦截把 token 替换, iframe 内
Hermes UI 直接已登录态."
```

---

## Task 6: L1 验证脚本 smoke-hermes-iframe

**Files:**
- Create: `scripts/smoke-hermes-iframe.mjs`
- Modify: `package.json scripts`

- [ ] **Step 1: Write smoke script**

`scripts/smoke-hermes-iframe.mjs`:

```javascript
#!/usr/bin/env node
/**
 * v1.6 L1 验证: Hermes iframe 反向代理 + token 注入端到端能跑.
 * 前置: electron:dev 已起 + Hermes dashboard 在 9119 + token 已抓到.
 *
 * 1. GET http://127.0.0.1:3000/api/hermes/embed/  → 期待 Hermes HTML
 * 2. assert HTML 含 <title>Hermes Agent - Dashboard</title>
 * 3. assert HTML 含 __HERMES_SESSION_TOKEN__="<非空 token>"
 */
import http from 'node:http'

const PORT = process.env.PORT || 3000

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: PORT, path }, (res) => {
      let buf = ''
      res.on('data', (c) => (buf += c))
      res.on('end', () => resolve({ status: res.statusCode, body: buf, headers: res.headers }))
    })
    req.on('error', reject)
  })
}

;(async () => {
  console.log('=== v1.6 Hermes iframe L1 smoke ===')

  const r = await get('/api/hermes/embed/')
  console.log(`HTTP ${r.status}, body bytes=${r.body.length}`)

  if (r.status !== 200) {
    console.error('FAIL: 期待 HTTP 200, 实际', r.status)
    console.error('body 前 200:', r.body.slice(0, 200))
    process.exit(1)
  }

  if (!r.body.includes('Hermes Agent - Dashboard') && !r.body.includes('hermes')) {
    console.error('FAIL: HTML 不像 Hermes dashboard')
    console.error('body 前 200:', r.body.slice(0, 200))
    process.exit(1)
  }

  const tokenMatch = r.body.match(/__HERMES_SESSION_TOKEN__\s*=\s*"([^"]*)"/)
  if (!tokenMatch) {
    console.error('FAIL: HTML 不含 __HERMES_SESSION_TOKEN__')
    process.exit(1)
  }
  const token = tokenMatch[1]
  if (!token) {
    console.error('⚠ WARN: token 为空 (Hermes 未启动或 fetchHermesToken 未跑完)')
    process.exit(1)
  }
  console.log(`✓ token 已注入, suffix=...${token.slice(-6)}`)
  console.log('✓ PASS: Hermes iframe proxy + token injection OK')
})().catch((e) => { console.error('SMOKE 异常:', e); process.exit(1) })
```

- [ ] **Step 2: Add npm script**

`package.json scripts` 加 (在 `smoke:daemon-chat` 之后):

```json
    "smoke:hermes-iframe": "node scripts/smoke-hermes-iframe.mjs",
```

- [ ] **Step 3: Run smoke (需 electron:dev 在跑)**

```bash
# 假定 electron:dev 已在 background 跑
npm run smoke:hermes-iframe
```

Expected: `✓ PASS: Hermes iframe proxy + token injection OK`

If FAIL: 看具体 fail 原因 → 修 Task 4-5 后再跑.

- [ ] **Step 4: skip — manual test 在 Task 7**

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-hermes-iframe.mjs package.json
git commit -m "test(hermes): L1 smoke 脚本验证 iframe proxy + token 注入

npm run smoke:hermes-iframe:
1. GET /api/hermes/embed/ → 200 + Hermes HTML
2. assert __HERMES_SESSION_TOKEN__ 已注入非空 token

发版前手动跑, 失败阻断 v1.6.0 发版."
```

---

## Task 7: 手动 dev iframe 实际显示 Hermes UI

**Files:** (无文件改动, 仅手动验证)

- [ ] **Step 1: Boot electron:dev**

```bash
# 清理 + 启动
powershell -NoProfile -Command "Get-Process -Name 'Lingjing','electron' -ErrorAction SilentlyContinue | Stop-Process -Force" 2>&1 | tail -1
echo "" > .userdata/logs/backend.log
npm run electron:dev 2>&1 &
sleep 60  # 等 Electron + Hermes daemon 都起
```

- [ ] **Step 2: Smoke**

```bash
npm run smoke:hermes-iframe
```

Expected: PASS

- [ ] **Step 3: Browser test**

在 Electron 窗口 (或 http://localhost:3001) 浏览到:
- http://localhost:3001/#/hermes-embed-test
- 应看到 灵境主框架 + 中间 iframe 显示 **Hermes 原版 dashboard** + 已登录态

如果 iframe 内有 React 加载错误 (`/assets/*.js` 404 等), 说明 reverse proxy 对相对路径处理有问题, 回到 Task 4 修.

- [ ] **Step 4: Cleanup**

```bash
powershell -NoProfile -Command "Get-Process -Name 'Lingjing','electron' -ErrorAction SilentlyContinue | Stop-Process -Force" 2>&1 | tail -1
```

- [ ] **Step 5: skip commit (无改动)**

---

## Task 8: 切换所有 hermes 路由到 wildcard

**Files:**
- Modify: `src/router/routes.ts`

- [ ] **Step 1: Find all hermes routes**

```bash
grep -n "path: 'hermes" src/router/routes.ts | head -20
```

应找到 18+ 条 (包括基础版 + advanced 版).

- [ ] **Step 2: Replace all hermes routes with single wildcard**

把 `path: 'hermes'` 到最后一条 `hermes/remote-desktop` 整个块 (约 line 174-284) 替换为:

```typescript
      // v1.6: 所有 /hermes/* 路由统一走单 iframe (HermesEmbed.vue),
      // 嵌入 Hermes 原生 dashboard (9119). server 端 /api/hermes/embed/* 反向代理.
      // 删除 src/views/hermes/*.vue + src/views/lingjing/Hermes*.vue 共 20 个文件.
      // 旧 18 条独立路由统一走 wildcard, Hermes UI 由 Hermes daemon 自己维护.
      {
        path: 'hermes/:section(.*)?',
        name: 'HermesEmbed',
        component: () => import('@/views/hermes/HermesEmbed.vue'),
        meta: { title: 'Hermes', icon: 'GridOutline', gateway: 'hermes', section: 'use' },
      },
```

同时删除 Task 2 加的 `path: 'hermes-embed-test'` 测试路由 (因为 wildcard 已覆盖).

- [ ] **Step 3: Verify routes structure**

```bash
grep -nE "path: 'hermes" src/router/routes.ts
```

Expected: 只剩 1 条 `path: 'hermes/:section(.*)?'`

- [ ] **Step 4: TypeScript compile + unit tests**

```bash
npx vue-tsc --noEmit 2>&1 | head -10
npm run test:unit 2>&1 | tail -3
```

Expected: 0 ts error (虽然 src/views/hermes/*.vue 和 src/views/lingjing/Hermes*.vue 还在但已不被路由引用, ts 编译时它们自身仍要通过) + 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/router/routes.ts
git commit -m "feat(router): 切换所有 hermes 路由到 wildcard 走 iframe

删除 18 条独立 hermes 路由, 替换为单 path: 'hermes/:section(.*)?'
→ HermesEmbed.vue (iframe). 同步删除 Task 2 加的试点路由.

旧路由组件文件 (src/views/hermes/*.vue + src/views/lingjing/Hermes*.vue)
本 commit 暂时保留, Task 9 单独删除避免 commit 过大."
```

---

## Task 9: 删除 20 个 Vue 复刻文件 (单 commit, ~21k 行)

**Files:**
- Delete: `src/views/hermes/HermesChannelsPage.vue`
- Delete: `src/views/hermes/HermesChatPage.vue`
- Delete: `src/views/hermes/HermesCliPage.vue`
- Delete: `src/views/hermes/HermesCronPage.vue`
- Delete: `src/views/hermes/HermesDashboard.vue`
- Delete: `src/views/hermes/HermesFilesPage.vue`
- Delete: `src/views/hermes/HermesMemoryPage.vue`
- Delete: `src/views/hermes/HermesModelsPage.vue`
- Delete: `src/views/hermes/HermesRemoteDesktopPage.vue`
- Delete: `src/views/hermes/HermesSessionsPage.vue`
- Delete: `src/views/hermes/HermesSkillsPage.vue`
- Delete: `src/views/hermes/HermesSystemPage.vue`
- Delete: `src/views/hermes/HermesTerminalPage.vue`
- Delete: `src/views/lingjing/HermesChannelsPage.vue`
- Delete: `src/views/lingjing/HermesCliPage.vue`
- Delete: `src/views/lingjing/HermesCronPage.vue`
- Delete: `src/views/lingjing/HermesMemoryPage.vue`
- Delete: `src/views/lingjing/HermesModelsPage.vue`
- Delete: `src/views/lingjing/HermesSessionsPage.vue`
- Delete: `src/views/lingjing/HermesSkillsPage.vue`

- [ ] **Step 1: Check for any remaining references**

```bash
# 找谁引用了被删的文件
grep -rln "views/hermes/Hermes\|views/lingjing/Hermes" src/ tests/ server/ electron/ 2>&1 | head -20
```

Expected: 只有 `src/views/hermes/HermesEmbed.vue` 不被引用 (它不在被删名单). 其它引用如果存在需先修复 import. 比如 sidebar / breadcrumb 组件可能引用了具体路由 name.

- [ ] **Step 2: Delete files**

```bash
rm src/views/hermes/HermesChannelsPage.vue \
   src/views/hermes/HermesChatPage.vue \
   src/views/hermes/HermesCliPage.vue \
   src/views/hermes/HermesCronPage.vue \
   src/views/hermes/HermesDashboard.vue \
   src/views/hermes/HermesFilesPage.vue \
   src/views/hermes/HermesMemoryPage.vue \
   src/views/hermes/HermesModelsPage.vue \
   src/views/hermes/HermesRemoteDesktopPage.vue \
   src/views/hermes/HermesSessionsPage.vue \
   src/views/hermes/HermesSkillsPage.vue \
   src/views/hermes/HermesSystemPage.vue \
   src/views/hermes/HermesTerminalPage.vue \
   src/views/lingjing/HermesChannelsPage.vue \
   src/views/lingjing/HermesCliPage.vue \
   src/views/lingjing/HermesCronPage.vue \
   src/views/lingjing/HermesMemoryPage.vue \
   src/views/lingjing/HermesModelsPage.vue \
   src/views/lingjing/HermesSessionsPage.vue \
   src/views/lingjing/HermesSkillsPage.vue
```

- [ ] **Step 3: TypeScript compile + unit tests + e2e regression**

```bash
npx vue-tsc --noEmit 2>&1 | head -10
npm run test:unit 2>&1 | tail -3
# e2e 因 fixtures 可能依赖 hermes 路由, 单独跑
npm run test:e2e tests/preflight/ 2>&1 | tail -5
```

Expected:
- vue-tsc: 0 error
- unit: 8 passed
- e2e preflight: 全过 (与 hermes 删除无关)

If error: 看是哪个文件还引用被删的, 修引用.

- [ ] **Step 4: Build production bundle 验证**

```bash
npm run build 2>&1 | tail -10
```

Expected: 0 error, dist/ 大小应该明显减小

- [ ] **Step 5: Commit**

```bash
git add -A src/views/hermes/ src/views/lingjing/
git commit -m "$(cat <<'EOF'
refactor(hermes): 删 20 个 Hermes UI Vue 复刻文件 (~21,000 行)

v1.6 选项 B 核心瘦身. Hermes UI 由 9119 端口 Hermes 原生 dashboard 提供,
灵境前端不再复刻. 所有 /hermes/* 路由 → HermesEmbed.vue (iframe).

删除清单 (合计 ~21,092 行):
- src/views/hermes/ 13 个 advanced 版 (HermesChat/Models/Channels/Skills/Sessions/Cron/Memory/Cli/Terminal/RemoteDesktop/Dashboard/Files/System)
- src/views/lingjing/ 7 个 basic 版 (HermesChannels/Cli/Cron/Memory/Models/Sessions/Skills Page)

净改动: 删 ~21,000 行, 仅留 HermesEmbed.vue (50 行) + router wildcard (15 行).
EOF
)"
```

---

## Task 10: e2e Playwright 验证

**Files:**
- Create: `tests/hermes/iframe-route.spec.ts`

- [ ] **Step 1: Write e2e spec**

```bash
mkdir -p tests/hermes
```

`tests/hermes/iframe-route.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run e2e**

```bash
# 前置: dev server 启动
npm run dev:all 2>&1 &
sleep 10
npm run test:e2e tests/hermes/ 2>&1 | tail -10
```

Expected: 3 passed.

- [ ] **Step 3: Cleanup**

```bash
pkill -f vite 2>/dev/null || true
pkill -f "node --env-file=.env server/index.js" 2>/dev/null || true
```

- [ ] **Step 4: skip**

- [ ] **Step 5: Commit**

```bash
git add tests/hermes/
git commit -m "test(hermes): L2 e2e iframe 路由渲染 + src 计算

3 个 e2e case: /hermes / /hermes/chat / /hermes/foo/bar
assert HermesEmbed.vue 渲染 iframe + src 指向 /api/hermes/embed/<path>"
```

---

## Task 11: L3 真实账号端到端验证 (手动)

**Files:** (无文件改动)

- [ ] **Step 1: Manual L3 checklist**

```
[ ] 1. powershell 清理残留 + npm run electron:dev
[ ] 2. 登录 jax 账号 + PreflightPage 通过
[ ] 3. /chat 发"你好" → 流式回复 (灵境特色 chat 不破)
[ ] 4. /hermes (默认页) → iframe 显示 Hermes 原版 dashboard, 已登录态
[ ] 5. 点 Hermes 内 sidebar 切到 chat / models / channels / skills 等页 → 都能进
[ ] 6. /hermes/chat (直接 URL) → 进 Hermes chat 页
[ ] 7. 看 backend.log 含 [hermes-embed] token cached
[ ] 8. F12 Network 看 /api/hermes/embed/assets/*.js 都 200 (没有 404 资源缺失)
[ ] 9. 灵境特色页 /login /preflight /settings /skills 完全不变
[ ] 10. 关 Electron 重开 → 整套流程仍 OK
```

任一项 fail → 修后重跑.

- [ ] **Step 2: Run all smoke + tests**

```bash
npm run smoke:env
npm run smoke:hermes-iframe
npm run test:unit
npm run test:e2e
```

Expected: 所有全过.

- [ ] **Step 3: skip**

- [ ] **Step 4: skip**

- [ ] **Step 5: 不 commit (无改动)**

---

## Task 12: Bump 1.6.0 + dist:win 构建

**Files:**
- Modify: `package.json` (version 1.5.2 → 1.6.0)

- [ ] **Step 1: Bump version**

`package.json:5`:

```json
  "version": "1.6.0",
```

- [ ] **Step 2: Run dist:win**

```bash
# 前置: 清理所有 Electron / daemon
powershell -NoProfile -Command "Get-Process -Name 'Lingjing','electron' -ErrorAction SilentlyContinue | Stop-Process -Force" 2>&1 | tail -1

# Build (5-15 分钟)
npm run dist:win
```

Expected: release/Lingjing-Setup-1.6.0.exe 生成成功 (约 400MB).

- [ ] **Step 3: Verify build size**

```bash
ls -la release/Lingjing-Setup-1.6.0.exe release/Lingjing-Setup-1.6.0.exe.blockmap release/latest.yml 2>&1 | head -5
```

Expected: 3 个文件都存在. exe 大小应比 v1.5.2 (409MB) 略小 (因为前端 bundle 减了 ~5-10MB).

- [ ] **Step 4: skip**

- [ ] **Step 5: Commit version bump**

```bash
git add package.json
git commit -m "chore(release): bump 1.5.2 -> 1.6.0 (Hermes UI iframe 嵌入)

v1.6.0 主要变化:
- 删 20 个 Hermes UI Vue 复刻文件 (~21,000 行)
- /hermes/* 统一走 iframe 嵌入 Hermes 原生 dashboard (9119)
- server reverse proxy + 透明 token 注入
- 灵境特色 (chat/login/preflight/settings) 不变
- chat 仍走 v1.5.2 bypass 稳定路径

Spec: docs/superpowers/specs/2026-05-11-hermes-iframe-design.md"
```

---

## Task 13: Push + Tag + GitHub Release

**Files:** (无代码改动)

- [ ] **Step 1: Tag v1.6.0**

```bash
git tag v1.6.0
```

- [ ] **Step 2: Push branch + tag**

```bash
git push origin main-fresh:main
git push origin v1.6.0
```

- [ ] **Step 3: Create GitHub Release via API**

写 scripts/.release-tmp.mjs (复用之前模板, 改 tag = v1.6.0) + 跑:

```bash
node scripts/.release-tmp.mjs v1.6.0
```

记下 release_id, 然后上传 3 个 assets:

```bash
TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2)
RELEASE_ID=<release_id_from_step_3>

for asset in "Lingjing-Setup-1.6.0.exe" "Lingjing-Setup-1.6.0.exe.blockmap" "latest.yml"; do
  curl -sS -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @"release/$asset" \
    "https://uploads.github.com/repos/xiaomimi123/lingjing-desktop/releases/$RELEASE_ID/assets?name=$asset" \
    -w "\n$asset http_code: %{http_code}\n"
done
```

Expected: 3 个都返回 201.

- [ ] **Step 4: Cleanup**

```bash
rm scripts/.release-tmp.mjs
```

- [ ] **Step 5: 验证 Release 页面**

打开 https://github.com/xiaomimi123/lingjing-desktop/releases/tag/v1.6.0 看到 3 个 assets + release notes 显示.

---

## Final Verification

After all 13 tasks:

- [ ] **Run all tests + smoke**

```bash
npm run test:unit && npm run test:e2e && npm run smoke:env
```

- [ ] **Manual final smoke**

按 Task 11 的 10 项 checklist 重跑一次.

- [ ] **Observe 1-2 周**

- 用户报告 Hermes UI 风格突变是否能接受
- 没有 Hermes iframe 路由 / token 问题反馈
- 准备 v1.7 (OpenClaw control-ui 评估 + 服务网关化)

---

## Self-Review

After writing the complete plan, checked against spec `2026-05-11-hermes-iframe-design.md`:

**1. Spec coverage:**
- ✅ HermesEmbed.vue 单 iframe → Task 1
- ✅ Vue Router wildcard → Task 8
- ✅ server reverse proxy /api/hermes/embed/* → Task 4
- ✅ HTML 拦截替换 token → Task 4 + 5
- ✅ token 探明 / 缓存 → Task 5
- ✅ 静态资源透传 → Task 4
- ✅ 删 20 个 Vue 文件 → Task 9
- ✅ AppSidebar 不变 → 隐式 (路由 path 不变, 只是 component 变)
- ✅ L1 smoke → Task 6
- ✅ L2 e2e → Task 10
- ✅ L3 真实账号 → Task 11
- ✅ Acceptance criteria 9 条 → Task 11 checklist + Task 12 bundle 检查

**2. Placeholder scan:**
- 无 TBD/TODO ✅
- Task 5 step 3 说 "实施时 Read 完整函数定位合适位置" — 这是位置定位指导, 完整代码已在 step 给出, 不是占位.
- Task 13 step 3 有 `<release_id_from_step_3>` — 这是运行时填入值, 不是 task code 占位.

**3. Type consistency:**
- `hermesEmbedToken` / `setHermesEmbedToken` Task 4/5 一致 ✅
- `fetchHermesTokenFromHTML` Task 5 一处定义 ✅
- `iframe.hermes-embed-frame` class Task 1/10 一致 ✅
- `/api/hermes/embed/<path>` URL 形式 Task 1/4/6/10 一致 ✅

Plan ready.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-11-hermes-iframe-impl.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 每 task 一个 fresh subagent + 两阶段 review, 13 task 适合 subagent.

**2. Inline Execution** - 在当前 session 直接跑, 上下文连贯 (与之前模式一致).

**Which approach?**
