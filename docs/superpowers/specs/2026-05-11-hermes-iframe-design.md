# Hermes UI iframe 嵌入设计 (v1.6 重定义为选项 B)

**Date**: 2026-05-11
**Status**: Draft pending user review
**Supersedes**: v1.6 "chat 切 daemon" 设计 (`2026-05-11-chat-daemon-switch-design.md`) — 该路径因 4 层协议差异未通而废弃
**Source**: docs/ARCHITECTURE-OPTIONS.md 选项 B + 用户决策"信任你推荐" + Hermes 9119 iframe 兼容性已实测验证

## 背景

v1.6 原计划 chat 切回 OpenClaw daemon 实施时遇到 4 层协议差异（schema/event name/sessionKey 映射/BOOTSTRAP.md 身份），陷入修一层暴露一层的循环。架构调研后发现：
- 灵境前端 70% 是 **Hermes UI 的 Vue 复刻**（13+7=20 个 .vue，21,092 行）
- Hermes 自带完整 dashboard（FastAPI+React 19+Vite，端口 9119）
- 实测 Hermes 9119 **无 X-Frame-Options / CSP 限制** → iframe 兼容
- HTML 已含 `window.__HERMES_SESSION_TOKEN__` 注入点 + `__HERMES_DASHBOARD_EMBEDDED_CHAT__` flag → **Hermes 本来就预期被嵌**

v1.6 重定义为：删 21,092 行 Vue 复刻，所有 `/hermes/*` 路由改 iframe，server 反向代理 9119 + 注入 token。

## 目标 (v1.6 范围)

**主目标**:
- 灵境不再复刻 Hermes UI
- 用户在 /hermes/* 路由直接看到 Hermes 原生 dashboard（chat/models/channels/skills/sessions/cron 等 10+ 页面）
- token 透明注入：用户登录灵境 → server 拿 Hermes token → iframe 内 Hermes 已登录
- 灵境特色页（/chat /login /preflight /settings /skills /home）**完全不动**

**不在 v1.6 scope**:
- OpenClaw chat 切 daemon（永久放弃，chat 继续走 v1.5.2 bypass）
- OpenClaw control-ui iframe（OpenClaw 走 RPC 模式没问题，留 v1.7+ 评估）
- Hermes 内部协议变更（Hermes 自治）

## 架构

### 整体流程

```
浏览器内 Vue Router
  ├─ /chat /login /preflight /settings /skills (灵境特色, 保留)
  │
  └─ /hermes/* (Hermes 全部路由)
       ↓
   <HermesEmbed.vue>
   单 <iframe src="/api/hermes/embed{path}">
       ↓
   server/hermes-proxy.js
   /api/hermes/embed/* 反向代理:
   1. HTML 拦截 → 替换 window.__HERMES_SESSION_TOKEN__ = 灵境 server hermesToken
   2. 静态资源透传 (/assets/*.js, *.css, fonts, images)
   3. WebSocket 升级透传 (如有)
   4. API 请求转发到 9119
       ↓
   Hermes daemon (http://127.0.0.1:9119)
   FastAPI + React 19 + Vite 完整 dashboard
```

### Hermes 自身 token 机制 (已实测)

Hermes 服务返回的 HTML 含:
```html
<script>
  window.__HERMES_SESSION_TOKEN__="jSYFFlYiBh66Hao7ukgpM_e8vm7XEvDrY7bPmNjcUf4";
  window.__HERMES_DASHBOARD_EMBEDDED_CHAT__=false;
</script>
```

server 拦截 HTML 响应, 用正则把 `__HERMES_SESSION_TOKEN__="xxx"` 替换为灵境侧持有的 Hermes token。Hermes 前端读 `window.__HERMES_SESSION_TOKEN__` 完成认证。

### token 来源

灵境 server (`server/hermes-proxy.js`) 已有 `hermesConfig` 对象, 含 `apiKey` / `webUrl` 配置。需要确认:
- Hermes 启动时是否生成持久 token (在 ~/.hermes-agent/state.json 或类似)
- 或者每次 dashboard 启动重新生成 (从 stdout 解析?)
- 灵境从哪里读这个 token

**实施时探明**: 启动 Hermes dashboard 后, 从 HTML 抓取首次返回的 token (或者从 hermes daemon CLI 拿), 缓存到 server 内存 `hermesEmbedToken`。

## 文件改动清单

### 删除 (合计 21,092 行)

| 文件 | 行数估 |
|---|---|
| `src/views/hermes/HermesChannelsPage.vue` | ~1500 |
| `src/views/hermes/HermesChatPage.vue` | ~2000 |
| `src/views/hermes/HermesCliPage.vue` | ~1000 |
| `src/views/hermes/HermesCronPage.vue` | ~1000 |
| `src/views/hermes/HermesDashboard.vue` | ~800 |
| `src/views/hermes/HermesFilesPage.vue` | ~1000 |
| `src/views/hermes/HermesMemoryPage.vue` | ~1000 |
| `src/views/hermes/HermesModelsPage.vue` | ~1500 |
| `src/views/hermes/HermesRemoteDesktopPage.vue` | ~800 |
| `src/views/hermes/HermesSessionsPage.vue` | ~1000 |
| `src/views/hermes/HermesSkillsPage.vue` | ~1000 |
| `src/views/hermes/HermesSystemPage.vue` | ~800 |
| `src/views/hermes/HermesTerminalPage.vue` | ~700 |
| `src/views/lingjing/HermesChannelsPage.vue` | ~400 |
| `src/views/lingjing/HermesCliPage.vue` | ~400 |
| `src/views/lingjing/HermesCronPage.vue` | ~400 |
| `src/views/lingjing/HermesMemoryPage.vue` | ~400 |
| `src/views/lingjing/HermesModelsPage.vue` | ~400 |
| `src/views/lingjing/HermesSessionsPage.vue` | 356 |
| `src/views/lingjing/HermesSkillsPage.vue` | 353 |

(行数 wc -l 实测部分, 部分估算; 21,092 行是合计实测)

### 新建

| 文件 | 行数 |
|---|---|
| `src/views/hermes/HermesEmbed.vue` | ~50 |

```vue
<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
// /hermes/chat → /api/hermes/embed/chat
// /hermes (root) → /api/hermes/embed/
const iframeSrc = computed(() => {
  const subPath = route.path.replace(/^\/hermes/, '') || '/'
  return `/api/hermes/embed${subPath}`
})
</script>

<template>
  <iframe :src="iframeSrc" class="hermes-embed-frame" />
</template>

<style scoped>
.hermes-embed-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
</style>
```

### 修改

| 文件 | 改动 | 估行数 |
|---|---|---|
| `src/router/routes.ts` | 删除所有 `/hermes/*` 现有路由 (18 条), 加 1 条 wildcard `path: 'hermes/:section(.*)?'` → `HermesEmbed.vue` | -100/+15 |
| `src/components/layout/AppSidebar.vue` | Hermes 侧边栏菜单项保留, 但都指向 `/hermes/<section>` (不变 link 形态) | 不动 |
| `server/hermes-proxy.js` | 新增 `/api/hermes/embed/*` 反向代理 + HTML token 替换 + 静态资源透传 + (可能的) WS 透传 | +100 |
| `server/index.js` | 挂 hermes-proxy 路由（如未挂）+ 加 `hermesEmbedToken` 内存变量 | +5 |

### 总改动
- **删除**: 20 个 Vue 文件, **~21,000 行**
- **新建**: 1 个 Vue 文件 + 1 个 server reverse proxy 函数, **~150 行**
- **净减**: ~20,850 行

## token 透明注入实现

server/hermes-proxy.js 加新路由 `/api/hermes/embed/*`:

```javascript
router.use('/api/hermes/embed', async (req, res) => {
  const hermesUrl = (hermesConfig.webUrl || 'http://127.0.0.1:9119') +
                    req.url // 已 strip /api/hermes/embed

  const upstream = await fetch(hermesUrl, {
    method: req.method,
    headers: { ...req.headers, host: '127.0.0.1:9119' },
    body: ['GET','HEAD'].includes(req.method) ? undefined : req,
  })

  // 透传 status + headers
  res.status(upstream.status)
  upstream.headers.forEach((v, k) => {
    // 删可能的 X-Frame-Options 防御 (Hermes 没设, 但保险)
    if (!/^x-frame-options|content-security-policy/i.test(k)) {
      res.setHeader(k, v)
    }
  })

  // HTML 拦截: 替换 token
  const contentType = upstream.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    let html = await upstream.text()
    html = html.replace(
      /window\.__HERMES_SESSION_TOKEN__\s*=\s*"[^"]*"/,
      `window.__HERMES_SESSION_TOKEN__="${hermesEmbedToken || ''}"`,
    )
    res.send(html)
  } else {
    // 二进制/JS/CSS 透传
    upstream.body.pipe(res)
  }
})
```

## 数据流

```
用户在 Electron 内点 "/hermes/chat"
  ↓ Vue Router 匹配 hermes/:section(.*)?
  ↓ 渲染 HermesEmbed.vue
  ↓ iframe src="/api/hermes/embed/chat"
  ↓
Vite dev server (3001) /api/* 代理到 Express server (3000)
  ↓
server/hermes-proxy.js /api/hermes/embed/chat
  ↓ fetch http://127.0.0.1:9119/chat
  ↓ Hermes daemon 返回 HTML (含 __HERMES_SESSION_TOKEN__)
  ↓ server 拦截 HTML, 替换 token 为灵境 token
  ↓
iframe 渲染 Hermes 原生 dashboard, 已登录状态
```

## 错误处理

| 场景 | 处理 |
|---|---|
| Hermes daemon 未启动 (9119 不通) | server 返回 503 "Hermes 服务未启动, 请重启灵境"; iframe 显示错误页 |
| hermesEmbedToken 未获取 | server 返回 HTML 但 token 为空; Hermes UI 显示未登录;用户重新登录灵境触发 token 重新获取 |
| Hermes 内部错误 (5xx) | 透传给 iframe; iframe 显示 Hermes 自己的错误页 |
| iframe 内导航跳出灵境主框 (如点击外链) | HermesEmbed.vue 用 `sandbox` 属性限制 (后续优化, v1.6 默认不加 sandbox 信任 Hermes) |

## 风险

1. **Hermes 内部相对路径 `/assets/*.js`**: iframe 内 Hermes 加载 `/assets/foo.js` 时, 浏览器会请求 `/api/hermes/embed/assets/foo.js` (相对当前 URL), server 反向代理时需正确转发到 9119/assets/foo.js. (实施时验证)

2. **Hermes WebSocket**: 如 Hermes 内部用 WS, server 需 ws-proxy 模式. (实施时验证, 当前未知)

3. **token 时效**: hermesEmbedToken 从哪里获取/什么时候刷新, 实施时探明.

4. **iframe 跳出灵境主框**: Hermes 内 navigate 用 `<a target="_blank">` 或 `window.open` 会破窗. (沙盒限制留 v1.7)

5. **代码删 21,000 行后被引用代码可能引发编译错误**: TypeScript / Vue 编译先解决 import 路径问题, 实施时逐步 commit.

## 验收标准

v1.6.0 发布前必须全部通过:

1. ✅ /hermes 默认页能进 (iframe 显示 Hermes 主 dashboard)
2. ✅ /hermes/chat /hermes/models /hermes/channels /hermes/skills /hermes/sessions /hermes/cron 等 10+ 子路由能进 iframe 显示对应 Hermes 页
3. ✅ iframe 内 Hermes 已登录态 (token 注入成功, 不再显示登录页)
4. ✅ Hermes 内导航不跳出 iframe 主框
5. ✅ /chat (灵境特色) 仍正常工作 (chat 走 bypass 不变)
6. ✅ /login /preflight /settings 等灵境特色页**完全不变**
7. ✅ v1.5.2 现有付费用户升级后 chat 仍可用
8. ✅ npm run test:unit + npm run test:e2e (现有) 全过 (除 hermes 删除后必须的 fixture 调整)
9. ✅ v1.5.2 → v1.6.0 安装包从 ~409MB 减少 (前端 bundle 变小 ~5-10MB)

## 不在本次 scope 内 (Out of scope)

- OpenClaw chat 切 daemon (永久搁置, chat 继续 bypass)
- OpenClaw control-ui iframe 嵌入 (v1.7+ 评估)
- iframe sandbox 严格限制 (v1.7+)
- Hermes 上游升级跟进流程 (v1.7+)
- BOOTSTRAP.md 身份覆写 (v1.7+, 当前 chat 走 bypass 已有 system prompt)

## 影响

- **代码**: 删 21,000 行, 加 150 行 (净减 ~20,850)
- **行为**: Hermes 部分 UI 从灵境东方美学 Vue 切到 Hermes 原版 React 风格 (UX 取舍)
- **回滚**: git revert 到 v1.5.2 状态
- **数据迁移**: 无
- **依赖**: 无新 npm 包 (可能要装 http-proxy 库或者用 fetch 手写)
- **打包**: dist bundle 应该减小 5-10MB

## 后续

写完本 spec → user review → 调 `superpowers:writing-plans` 出 TDD 实施计划 (拆 10-15 个 task)。

实施推荐分阶段:
1. **阶段 1** (1 天): HermesEmbed.vue + router wildcard + 1 条 hermes 路由先改 iframe 试通
2. **阶段 2** (1 天): server reverse proxy + token 注入 + 验证 1 条路由能在 iframe 显示 Hermes 已登录
3. **阶段 3** (1 天): 切换所有 hermes 路由到 wildcard + 删 20 个 Vue 文件
4. **阶段 4** (1 天): 端到端 L3 验证 + bump 1.6.0 + dist:win + Release
