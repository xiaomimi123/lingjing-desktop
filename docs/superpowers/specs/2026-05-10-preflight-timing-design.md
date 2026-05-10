# 灵境桌面 v1.5.x 自检流程时机修复设计

**Date**: 2026-05-10
**Author**: brainstorm session(用户 + Claude via superpowers:brainstorming)
**Status**: Draft pending user review
**Topic**: 修复 v1.5.1 中"自检被跳过 + token 未注入 + 重登仍失败"3 个 bug

## 背景

v1.5.1 用户报告链路:
1. 第一次打开应用没有进行自检 (PreflightPage 没出现)
2. 登录后调用 chat.send 报错 `灵境 token 未注入,请先登录`
3. 重新登入后依然无法对话

代码考古发现:
- `src/views/lingjing/PreflightPage.vue:1-6` 注释明确:"v1.3.0 自检页 — 登录后强制经过的关卡"
- `src/router/index.ts:72-78` 用 `sessionStorage['lingjing-preflight-passed']` 作为"自检已通过"标记
- `server/index.js:385-399` `lingjingApiToken` 通过 `/api/internal/set-lingjing-token` 由 main 进程注入
- `server/index.js:1435-1437` `chat.send` 入口检查 `lingjingApiToken`,空则报错

## 根因

**sessionStorage 的"自检通过"标记 vs server 内存的 `lingjingApiToken`,生命周期没有绑定。**

| 状态变量 | 生命周期 | 持久化层 |
|---|---|---|
| `sessionStorage['lingjing-preflight-passed']` | 浏览器 session(应用进程) | 前端 |
| `lingjingApiToken` | server 进程内存 | 后端 |
| `authStore.token` | localStorage | 前端 |

**3 个具体 bug**:

### Bug A: logout 没清 sessionStorage
`auth.ts` 的 logout action 清了 localStorage 的 auth token,但没清 sessionStorage 的 `lingjing-preflight-passed`。导致下次登入时 router guard 误以为自检还有效,跳过 PreflightPage。

### Bug B: 自检步骤失败但 sessionStorage 仍可能被写
`PreflightPage.vue` 当前逻辑容忍 `required: false` 的步骤失败 + 全部完成后无条件写 sessionStorage。如果 `step 4 configure` 这个 required 步骤"看起来 ok 但 token 没真注入到 server",sessionStorage 会被错误写入。

### Bug C: 重启 server 后 token 内存丢失
应用退出 → 重启 server 进程 → `lingjingApiToken=null`。但 sessionStorage(前端 hash 路由的内存层)在 Electron 整个应用关闭才清。两边节奏不同。

## 解决方案: 路径 1 (修 bug + 保持现架构 + 加 quickCheck)

### 整体流程

```
应用启动
  ↓
[router guard]
  ├─ 未登录 → /Login
  └─ 已登录
       ↓
   [sessionStorage 有 'preflight-passed' 标记?]
   ├─ 是 → 进主页 (用户感觉不到任何检查)
   └─ 否 → 跑 quickCheck (背后默默跑, < 500ms)
        ↓
       [quickCheck 通过?]
       ├─ 通过 → 写 sessionStorage 标记 → 进主页
       └─ 失败 → 跳 /Preflight 跑完整 6 步
                    ↓
                 [完整自检通过?]
                 ├─ 通过 → 写 sessionStorage 标记 → 进主页
                 └─ 失败 → 卡在 /Preflight 让用户重试
```

**关键不变量**: sessionStorage 标记 ↔ server 内存 token ↔ gateway 连接。任一缺失,标记自动失效。

### quickCheck 的检查项

只跑最关键、最快的 3 项,总预算 < 500ms:

| 项 | 失败意味着 | 耗时 |
|---|---|---|
| 1. server 内存 `lingjingApiToken` 是否存在 | server 重启了,token 丢了 | <50ms |
| 2. OpenClaw Gateway WebSocket 是否仍连接 | 网关挂了 | <100ms |
| 3. Express server 是否健康 (200 ok) | server 进程崩了 | <50ms |

**不查的项**:
- aitoken.homes 网络可达性 (慢,且 chat 调用时会自然失败)
- 测试聊天 (太重,且每次启动都跑会浪费 token)

### 3 个 bug 的具体修法

| Bug | 修法 | 文件 | 预计行数 |
|---|---|---|---|
| A | logout action 追加 `sessionStorage.removeItem('lingjing-preflight-passed')` | `src/stores/auth.ts` | +2 |
| B | PreflightPage 完成时只在 `allPassed=true` 才写标记;任意 required 步骤失败立即 `sessionStorage.removeItem` | `src/views/lingjing/PreflightPage.vue` | +5 |
| C | 1) router guard 加 quickCheck 调用<br>2) 加 `bridge.preflight.quickCheck()` IPC<br>3) main 转发到 server `/api/internal/health-quick` | `router/index.ts`, `electron/preload.cjs`, `electron/main.js`, `server/index.js` | +30~50 |

**总改动**: ~40-60 行,5 个文件。

### 数据流

```
[router guard]                    [main process]                  [server process]
     │                                    │                               │
     │ if !sessionStorage flag            │                               │
     ├──IPC: preflight.quickCheck()──────>│                               │
     │                                    ├──HTTP: /api/internal/health──>│
     │                                    │                               │ check:
     │                                    │                               │  - lingjingApiToken !== null
     │                                    │                               │  - gateway.isConnected
     │                                    │                               │  - server alive
     │                                    │<──{ ok: true/false, fields: {}}│
     │<──{ ok: true/false }──────────────│                               │
     │                                    │                               │
   if ok: setItem('preflight-passed')     │                               │
          → next()                        │                               │
   if fail: → /Preflight                  │                               │
```

### 错误处理

- quickCheck 网络/IPC 异常 → 当作失败,跳 /Preflight (保守路径)
- /Preflight 任意 required 步骤失败 → sessionStorage 不写 + 用户可见错误信息 + 「重试」按钮
- /Preflight 5 次连续失败 → 引导用户去帮助页 (本设计不实现,留作 v1.6)

### 测试矩阵 (TDD,先写测试再写代码)

| 测试 | 验证什么 | 文件 |
|---|---|---|
| `quick-check-pass.spec.ts` | server 内存有 token + gateway 连着 → 跳过 PreflightPage,进主页 | tests/preflight/ |
| `quick-check-fail-no-token.spec.ts` | server 内存清空 token → 跳到 PreflightPage | tests/preflight/ |
| `logout-clears-preflight.spec.ts` | logout 后 sessionStorage 被清,下次登录强制 PreflightPage | tests/preflight/ |
| `preflight-failure-clears-flag.spec.ts` | step 4 模拟失败 → sessionStorage 不写 → 下次启动还会再跑 | tests/preflight/ |

跑 `npm run test:e2e tests/preflight/` 全过 → 修复完成。

## 不在本次 scope 内 (Out of scope)

- 重新设计自检为"登入前 + 登入后"分两段 (路径 2,延后)
- 把 OpenClaw token 持久化到 userData 加密文件
- 把 PreflightPage 的 6 步本身改快 (与时机无关)
- 修复 quickCheck 失败后的"自动恢复" (留 PreflightPage 作为人工通道)

## 影响

- **代码改动**: 5 文件,~50 行,含测试
- **行为变化**: 大多数启动用户感觉不到自检页;只有真出问题才看到
- **回滚**: 改回 `git revert` 即可,sessionStorage 行为退回旧版
- **数据迁移**: 无 (没有 schema 变化)
- **依赖**: 无新 npm 包

## 验收标准

修复完成后,Win 安装版 v1.5.x:
1. 首次启动 → 登录 → 自动跑完整 PreflightPage → 进主页 → 能正常对话
2. 关闭应用 → 重新打开 → 自动登录 + 静默 quickCheck → 直接进主页 (不见自检页)
3. logout → 重新登录 → 强制再走 PreflightPage
4. 模拟杀掉 server 后重启 → 进主页前 quickCheck 失败 → 跳 PreflightPage 重新注入

## 后续(下一次会话)

写完此 spec 并通过用户 review 后:
1. 调用 `superpowers:writing-plans` skill 生成详细实现计划 (拆任务到 2-5 分钟一个)
2. 调用 `superpowers:test-driven-development` skill 实现每个任务 (RED-GREEN-REFACTOR)
3. 验证 → bump v1.5.2 → 重新构建 → 发 Release (路径在前一次会话已规划)
