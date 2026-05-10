# 灵境桌面 v1.5.x 自检流程时机修复设计

**Date**: 2026-05-10
**Author**: brainstorm session(用户 + Claude via superpowers:brainstorming)
**Status**: v2 — Draft pending user review
**Topic**: 修复 v1.5.1 中"自检看似通过但 token 未注入到 server"的根因

> **v2 修订说明**: writing-plans 阶段 explore 代码时发现 v1 spec 有事实错误。Bug A 在 v1.3.0 已修复(`auth.ts:236-243`),Bug B 真正根因不是"标记误写",而是"PreflightPage 第 4 步检查的是错字段"。本 v2 spec 用真实根因替换。

## 背景

v1.5.1 用户报告链路:
1. 第一次打开应用没有进行自检 (PreflightPage 没出现)
2. 登录后调用 chat.send 报错 `灵境 token 未注入,请先登录`
3. 重新登入后依然无法对话

代码考古确认:
- `src/views/lingjing/PreflightPage.vue:1-6` "v1.3.0 自检页 — 登录后强制经过的关卡"
- `src/router/index.ts:72-78` 用 `sessionStorage['lingjing-preflight-passed']` 作为通过标记
- `src/stores/auth.ts:236-243` logout **已经清** sessionStorage 这 3 个 key (v1.3.0 引入)
- `server/index.js:385-399` `lingjingApiToken` 通过 `/api/internal/set-lingjing-token` 由 main 进程注入
- `server/index.js:1435-1437` `chat.send` 入口检查 `lingjingApiToken`,空则报错

## 真正的根因 (v2 修正)

### 主因 - Bug B: PreflightPage 第 4 步检查的是错字段

`PreflightPage.vue:83-95`:

```typescript
case 'configure': {
  const cfg = await bridge.autoConfigureViaMain?.({ modelId })
  const ok = cfg?.openclaw === 'ok'   // ← 错!
  ...
}
```

但 `electron/main.js:1106-1114` 返回的对象里:

```javascript
return {
  bypass: bypassStatus,        // ← v1.5 真正决定 chat.send 能跑的字段
  openclaw: oc.status,         // ← v1.5 fallback,不再是主路径
  hermes: hm.status,
  ...
}
```

`bypass = 'ok'` 才意味着 `lingjingApiToken` 已注入到 server 内存。`openclaw = 'ok'` 只意味着 OpenClaw daemon 内部配置成功(v1.4 之前的主路径)。

**bug 触发场景**: bypass 失败(比如 server 拒绝 token 注入)+ openclaw 成功 → PreflightPage 算成功 → sessionStorage 标记"通过" → router guard 放行进 chat → server.lingjingApiToken=null → chat.send 返回"灵境 token 未注入"。

这正是用户报告的现象。

### 隐患 Bug A': skipAndContinue 应急按钮无视失败强写标记

`PreflightPage.vue:177-183`:

```typescript
function skipAndContinue() {
  // 应急出口
  sessionStorage.setItem('lingjing-preflight-passed', 'ok')
  ...
}
```

任何状态都会强写"通过"标记。用户如果在自检失败页点过"跳过",sessionStorage 会被永久标记成功(直到 logout/应用关闭)。

### Bug C: server 重启后 token 内存丢失

应用退出 → 重启 server 进程 → `lingjingApiToken=null`。但 sessionStorage(同一个 Electron app session)未清。两边节奏不同。

不过 sessionStorage 的"session"在 Electron 整个 app 关闭时清,所以在大多数日常使用中 Bug C 影响有限。它的真实暴露场景是:server 进程被杀但 Electron 主进程没死(比如 main 自动重启 server)。

### 已确认 v1.3.0 修复(无需再做)

~~Bug A: logout 没清 sessionStorage~~ — `auth.ts:236-243` 已正确清掉。

## 解决方案

### 主修复: PreflightPage 第 87 行检查 cfg.bypass

把 `const ok = cfg?.openclaw === 'ok'` 改为同时验证 bypass 和 openclaw,**bypass 必须 ok**(因为 v1.5 chat.send 走 bypass 路径):

```typescript
case 'configure': {
  const cfg = await bridge.autoConfigureViaMain?.({ modelId })
  // v1.5 真相: chat.send 走 bypass 直连 aitoken.homes,
  // openclaw daemon 是 fallback。bypass 没 ok 就等于 token 没真到 server。
  const bypassOk = cfg?.bypass === 'ok'
  const openclawOk = cfg?.openclaw === 'ok'
  const ok = bypassOk  // 至少 bypass 要 ok 才能保证 chat.send 不报"token 未注入"
  r = {
    ok,
    durationMs: 0,
    message: ok
      ? (openclawOk ? '' : 'OpenClaw fallback 失配,但 chat 走 bypass 仍可用')
      : `bypass 失败: ${cfg?.bypassMessage || cfg?.message || cfg?.openclawMessage || '未知'}`,
    detail: cfg,
  }
  break
}
```

### 加固: skipAndContinue 显式标记"被跳过"

`PreflightPage.vue:177-183` 改为不写"passed",而写"skipped":

```typescript
function skipAndContinue() {
  sessionStorage.setItem('lingjing-preflight-skipped', '1')
  // 不再写 lingjing-preflight-passed,router guard 检查到 skipped 也放行,但记录此情况用于诊断
  ...
}
```

router guard 同时认 'passed' 或 'skipped' 都放行,但日志区分。

### 加固: quickCheck 兜底

加一个 router guard 之前的"启动健康自检",验证 3 项:
1. server 内存 `lingjingApiToken` 是否存在
2. OpenClaw Gateway WebSocket 是否仍连接
3. Express server 是否健康

通过 → 写 sessionStorage 标记 → 进主页
失败 → 跳 `/Preflight` 完整自检

预算 < 500ms。这条路径覆盖 Bug C(server 重启 token 丢失)。

### 整体流程

```
应用启动
  ↓
[router guard]
  ├─ 未登录 → /Login
  └─ 已登录
       ↓
   [sessionStorage 'preflight-passed' = 'ok' 或 'skipped'?]
   ├─ 是 → quickCheck 兜底验证
   │       ├─ 通过 → 进主页
   │       └─ 失败 → 清标记 → /Preflight
   └─ 否 → quickCheck (背后默默跑, < 500ms)
        ├─ 通过 → 写 sessionStorage 标记 → 进主页
        └─ 失败 → /Preflight 跑完整 6 步
                    ├─ 第 4 步 configure 严格检查 cfg.bypass === 'ok'
                    ├─ 通过 → 写 sessionStorage 标记 → 进主页
                    └─ 失败 → 卡在 /Preflight 让用户重试
```

**关键不变量**: sessionStorage 'passed' 标记 ⇒ server 内存 token 已注入。任何路径破坏这条不变量都视为 bug。

### 修复清单

| 改动 | 文件 | 行数 |
|---|---|---|
| 1. PreflightPage 第 4 步检查 cfg.bypass | `src/views/lingjing/PreflightPage.vue:87` | +5 |
| 2. skipAndContinue 改写 'skipped' 而非 'passed' | `src/views/lingjing/PreflightPage.vue:177-183` | +2 |
| 3. router guard 同时认 'passed' 或 'skipped' | `src/router/index.ts:73` | +2 |
| 4. quickCheck IPC: bridge.preflight.quickCheck() | `electron/preload.cjs:87-95` | +1 |
| 5. main: ipcMain.handle('lingjing:preflight-quick-check') | `electron/main.js:1220 附近` | +20 |
| 6. server: GET /api/internal/health-quick | `server/index.js` | +25 |
| 7. router guard 调 quickCheck | `src/router/index.ts:78` | +15 |
| 8. 测试 | `tests/preflight/*.spec.ts` | 新建,~150 |

**主代码改动**: ~70 行,7 个文件 + 测试。

### 数据流

```
[router guard]                    [main process]                  [server process]
     │                                    │                               │
     │ if !sessionStorage flag            │                               │
     ├──IPC: preflight.quickCheck()──────>│                               │
     │                                    ├──HTTP: GET /api/internal/    │
     │                                    │    health-quick ────────────>│
     │                                    │                               │ check:
     │                                    │                               │  - lingjingApiToken !== null
     │                                    │                               │  - gateway.isConnected
     │                                    │                               │  - server alive
     │                                    │<──{ ok: true/false, fields }──│
     │<──{ ok: true/false }──────────────│                               │
     │                                    │                               │
   if ok: setItem('preflight-passed', 'ok')                              │
          → next()                                                       │
   if fail: → /Preflight                                                 │
```

### 错误处理

- quickCheck 网络/IPC 异常 → 当作失败,跳 /Preflight (保守路径)
- /Preflight 任意 required 步骤失败 → sessionStorage 不写 + 用户可见错误信息 + 「重试」按钮
- 第 4 步 configure 失败时,UI 上显示具体是 bypass 失败还是 openclaw 失败,方便用户/支持反馈

### 测试矩阵 (TDD)

| 测试 | 验证什么 | 文件 |
|---|---|---|
| `configure-step-checks-bypass.spec.ts` | mock cfg={bypass:'error', openclaw:'ok'} → 第 4 步 fail (主修复回归) | tests/preflight/ |
| `configure-step-pass-when-bypass-ok.spec.ts` | mock cfg={bypass:'ok', openclaw:'error'} → 第 4 步 pass + warning message | tests/preflight/ |
| `quick-check-pass.spec.ts` | server 内存有 token + gateway 连着 → 跳过 PreflightPage | tests/preflight/ |
| `quick-check-fail-no-token.spec.ts` | server 内存清空 token → 跳到 PreflightPage | tests/preflight/ |
| `skip-button-marks-skipped-not-passed.spec.ts` | 点 skipAndContinue → sessionStorage='skipped' 而非 'passed' | tests/preflight/ |

跑 `npm run test:e2e tests/preflight/` 全过 → 修复完成。

## 不在本次 scope 内 (Out of scope)

- 重新设计自检为"登入前 + 登入后"分两段 (路径 2,延后)
- 把 OpenClaw token 持久化到 userData 加密文件 (v1.6 候选)
- 把 PreflightPage 的 6 步本身改快 (与时机无关)
- /Preflight 5 次连续失败的引导帮助页 (v1.6)

## 影响

- **代码改动**: 7 文件,~70 行 + 测试 ~150 行
- **行为变化**:
  - bypass 失败的用户立刻在 PreflightPage 第 4 步看到具体错误,不会"假通过"
  - skipAndContinue 留下显式痕迹,便于后续诊断
  - 大多数启动用户感觉不到 quickCheck (静默)
- **回滚**: 改回 `git revert` 即可
- **数据迁移**: 无
- **依赖**: 无新 npm 包

## 验收标准

修复完成后,Win 安装版 v1.5.x:
1. **首次启动**: 登录 → 完整 PreflightPage,第 4 步严格验证 bypass=ok → 进主页 → chat.send 不报"token 未注入"
2. **关闭重开**: 自动登录 + 静默 quickCheck (因为 sessionStorage 在新 Electron session 是空的) → 通过则直接进主页 → 失败跳 /Preflight
3. **logout → 重新登入**: 强制再走 PreflightPage(已是 v1.3.0 行为,本次不动)
4. **模拟杀掉 server 重启**: 进主页前 quickCheck 失败 → 跳 /Preflight 重新注入
5. **bypass 配置失败**: PreflightPage 第 4 步显示具体是 bypass 失败而非笼统"配置失败"

## 后续(下一次会话)

写完此 v2 spec 并通过用户 review 后:
1. 调用 `superpowers:writing-plans` skill 生成详细实施计划
2. 调用 `superpowers:test-driven-development` skill 实现 (RED-GREEN-REFACTOR)
3. 验证 → bump v1.5.2 → 重新构建 → 发 Release
