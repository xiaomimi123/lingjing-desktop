# v1.6 chat 主路径切回 OpenClaw daemon 设计

**Date**: 2026-05-11
**Author**: brainstorm session (用户 + Claude via superpowers:brainstorming)
**Status**: Draft pending user review
**Supersedes**: 部分 v1.5 bypass 路径设计（bypass 降级为 fallback）
**PRODUCT-VISION ref**: §1 (Agent 能力是护城河 / aitoken.homes 是计费渠道), §6 (chat 必经 aitoken.homes), §8 (v1.6 核心战略版本)

## 背景

v1.5 bypass 路径是 v1.3 OpenClaw daemon 在 packaged 环境保存 token 失败时的临时妥协。bypass 把 chat.send 直接转发到 `aitoken.homes/v1/chat/completions`，绕开 daemon。结果：
- ✅ chat 能跑 + quota 计费
- ❌ 用户感受不到 OpenClaw Agent 能力（无工具调用、无 agent 路由、模型自我认同 OpenAI 而非灵境）
- ❌ 灵境退化成 LLM wrapper，**失去产品差异化**

用户 2026-05-10 反馈："**我们的产品要具备 OpenClaw/Hermes 这两个智能体的能力, 而不是直接于我接入的大模型进行对话**"。

PRODUCT-VISION v2 明确护城河是 **OpenClaw + Hermes Agent 能力**, aitoken.homes 仅是计费渠道。bypass 与定位冲突, 必须退役。

## 真根因 (v1.3 卡死) 已修复

v1.4.1 commit (configureOpenClawWindows in main.js:785-911) 已实现 daemon 用 aitoken.homes 作 OpenAI Provider 的 6 步配置：
1. `~/.openclaw/agents/main/agent/auth-profiles.json`: 写 `openai:manual` profile + token
2. `~/.openclaw/openclaw.json`: 加 `auth.profiles` 引用
3. `~/.openclaw/agents/main/agent/models.json`: 加 openai provider (baseUrl=aitoken.homes/v1)
4. `~/.openclaw/gateway.cmd`: 删 watchdog env + 注入 `OPENAI_API_KEY` + `OPENAI_BASE_URL`
5. schtasks `/End` + `/Run` 重启 daemon
6. 轮询 18789 端口 30s 等就绪

**这段代码已存在但实际生产中没被验证 chat 链路** — v1.5 PreflightPage 把 chat 切到 bypass 后, daemon chat 没人真用过。

## 目标 (v1.6 范围)

**A 级 — 身份级表达** (本 spec 范围):
- chat 主路径走 daemon (gateway WebSocket call)
- daemon 内部用 aitoken.homes 作 OpenAI Provider 完成 LLM 调用 (复用 configureOpenClaw 配置)
- system prompt 注入让模型自我认同为 "灵境 AI 智能体助手"
- 用户问"你是 OpenClaw 吗?" 模型回答 "是的, 我是灵境 AI..."
- bypass 保留作 fallback (daemon 不可用时), v1.7 删除

**不在 v1.6 scope**:
- B 级能力 (工具调用) → v1.7 单独 brainstorm
- C 级多智能体切换 → v1.8+
- 商城 / 分销 → v2.0

## 架构 (整体流程)

```
用户在「对话」发消息 (chatStore.sendMessage)
  ↓
Vue → server.POST /api/rpc { method: 'chat.send', params }
  ↓
server/index.js chat.send 拦截层 (v1.6 新逻辑):
  ├─ 优先尝试 daemon: tryDaemonChatSend(params)
  │   ├─ gateway.ws?.readyState === 1 (OPEN)
  │   │   → 注入 LINGJING_SYSTEM_PROMPT 到 messages[0] (若不存在 system role)
  │   │   → gateway.call('chat.send', daemonParams, 30000)
  │   │   → daemon 内部用 aitoken.homes 作 OpenAI Provider 完成 LLM 调用
  │   │   → daemon 流式响应 → server 包装为 chat.delta/chat.final SSE 给前端
  │   │   → 用户感受到 OpenClaw 能力 + quota 在 aitoken.homes 端被扣
  │   └─ daemon 不可用 (ws closed / timeout / call error):
  │       → 自动 fallback handleChatSendBypass(params)
  │       → 也注入 LINGJING_SYSTEM_PROMPT 一致
  │       → 日志告警 "[chat] daemon 不可用, 回退 bypass: <reason>"
  ↓
SSE → 前端流式渲染 (chat.ts 接口不动)
```

### 不变量
- chat 主路径 v1.6 = daemon 优先, bypass 兜底
- 任一路径都经过 aitoken.homes 完成 LLM 调用 → 计费链路不丢
- 两路径都注入相同 system prompt → 用户体验一致
- 前端 chat.ts 不动 (SSE 协议不变)

## System Prompt 注入

**注入点**: server/index.js chat.send 拦截层 (统一控制, 不在 daemon 配置 / 不在前端)

**Prompt 内容**:
```
你是灵境的 AI 智能体助手, 由 OpenClaw 智能体框架驱动。
当用户询问你的身份时, 你是"灵境 AI", 不要说自己是 OpenAI 或其它供应商提供的。
你能为用户调度多智能体、执行自动化任务、调用技能, 让 AI 真正帮上忙。
```

**注入算法**:
```javascript
function injectLingjingSystemPrompt(params) {
  const messages = Array.isArray(params?.messages) ? [...params.messages] : []
  if (messages[0]?.role !== 'system') {
    messages.unshift({ role: 'system', content: LINGJING_SYSTEM_PROMPT })
  }
  return { ...params, messages }
}
```

- 用户的 input 不带 system → 加在首位
- 用户/前端已有 system → 不覆盖 (尊重显式 system prompt, 适配未来 agent 配置)

## Fallback 触发条件

| 触发条件 | 处理 |
|---|---|
| `gateway.ws?.readyState !== 1` | 立刻走 bypass, 不等 daemon |
| `gateway.call('chat.send', ...)` 30s timeout | 走 bypass + 日志 "daemon timeout" |
| `gateway.call` 抛 error: "Provider not configured" / "Unknown method" | 走 bypass + 日志 "daemon error: <msg>" |
| daemon 流式开始后中断 | 不 fallback (避免重复扣 quota), 返回 chat.error 给前端 |

**日志关键**: 每次 fallback 都写 main.log + backend.log, 含触发原因。
**监控**: 若 1 周内 fallback 率 > 5%, 视为 daemon 仍有问题, 需修。

## 实施改动清单

| 文件 | 操作 | 行数 |
|---|---|---|
| `server/index.js` 顶部 | 加 `LINGJING_SYSTEM_PROMPT` 常量 + `injectLingjingSystemPrompt` helper | +15 |
| `server/index.js:1434-1438` | 改 chat.send 拦截: 先 daemon 后 bypass | +30 (替换原 3 行) |
| `server/index.js` 中部 | 新加 `tryDaemonChatSend` 函数: daemon WebSocket call + 流式包装 | +60 |
| `server/index.js handleChatSendBypass` | 也用 injectLingjingSystemPrompt (一致) | +3 |
| `scripts/smoke-daemon-chat.mjs` | L1 dev 模式 daemon-chat smoke 脚本 | 新建 ~50 |
| `tests/chat/daemon-path.spec.ts` | L2 Playwright e2e (mock daemon) | 新建 ~80 |
| `package.json scripts` | 加 `smoke:daemon-chat` | +1 |

**总计**: ~240 行（含测试 130 行）

## 验证策略 (3 层)

### L1 daemon-chat smoke (dev 模式)
脚本 `npm run smoke:daemon-chat` 做:
1. 假设 daemon 已起 (PreflightPage 跑过)
2. 用测试 token 调 server `/api/rpc {method:'chat.send', params:{messages:[{role:'user',content:'ping'}]}}`
3. 等 SSE 流, 20s 内拿到非空 chat.final
4. assert 走 daemon 路径 (非 fallback), 通过 SSE 头部识别

### L2 Playwright e2e
`tests/chat/daemon-path.spec.ts`:
1. 假定 daemon 可达, fixtures 注入登录态 + preflight-passed
2. 导航到 /chat, 发消息 "你好"
3. assert SSE 流响应到达 + 不报"daemon 不可用"

### L3 真实账号端到端 (发版前)
v1.6.0-beta 打包后:
1. 用 jax 账号 (`.env.test` 已就位) 真实登录
2. 发 5 条不同问题, 含"你是 openclaw 吗?"
3. 验证: 流式响应 + 模型自我认同灵境 + aitoken.homes 后台 quota 真扣

**任一层失败 → 阻断 v1.6 发布**, 修完才能继续。

## 错误处理

| 场景 | 用户体验 |
|---|---|
| daemon 可用 + LLM 调用成功 | 流式收到回复 ✓ |
| daemon 可用 + aitoken.homes 余额不足 | 收到"余额不足"错误 (透传 aitoken.homes 错误) |
| daemon 可用 + aitoken.homes 网络异常 | daemon 返回 error → 不 fallback (因为 bypass 也会同样失败) → 显示错误 |
| daemon 不可用 + bypass 可用 | 用户感觉慢 1 秒 + 工具调用消失, 但 chat 能用 |
| daemon 不可用 + bypass 也不可用 | 显示"灵境暂时不可用, 请重启" |

## 不在 v1.6 scope

- B 级能力 (tool calling, file/shell/web)
- 多智能体切换 (UI agent selector)
- daemon 持久化 (token 加密存 userData)
- bypass 删除 (留到 v1.7 验证 1 周后)
- daemon 启动加速 (与本主题无关)

## 影响

- **代码**: 7 文件 ~240 行 (90% 集中在 server/index.js)
- **行为**: chat 用户首次发消息时背后从 fetch aitoken.homes 改成走 daemon, 用户感觉一致但模型回答更"像灵境"
- **回滚**: chat.send 拦截层有 feature flag (env `CHAT_DAEMON_ENABLED=0`) 一键回 bypass, 实施时一定要带这个开关
- **数据迁移**: 无
- **依赖**: 无新 npm 包

## 验收标准 (Acceptance Criteria)

v1.6.0 发布前必须全部通过:

1. ✅ L1 daemon-chat smoke pass (dev 模式)
2. ✅ L2 Playwright e2e pass
3. ✅ L3 真实账号 jax 发 5 条消息, daemon 路径成功率 ≥ 95% (其余允许 fallback)
4. ✅ daemon 路径下用户问 "你是 openclaw 吗?", 回复明确自我认同灵境 / OpenClaw, 不再说"OpenAI 提供"
5. ✅ aitoken.homes 后台验证: daemon 路径与 bypass 路径都正常扣 quota
6. ✅ 关闭 daemon (kill 18789 端口进程) 后, chat 仍能用 (走 bypass fallback) + 日志告警
7. ✅ 现有 v1.5 e2e 全过 (无回归)

## 后续 (本 spec 通过 user review 后)

1. 调 `superpowers:writing-plans` 拆 TDD 实施计划
2. 走 `superpowers:test-driven-development` 实现每个 task
3. v1.6.0-beta 打包 → 真实账号 L3 验证
4. v1.6.0 正式发布 → GitHub Release + R2 镜像
5. 观察 1-2 周, fallback 率 < 5% → 启 v1.7 B 级 (工具调用 brainstorm)
