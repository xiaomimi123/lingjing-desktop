# 我对灵境项目的理解（Phase A 综合报告）

**Date**: 2026-05-10
**Author**: Claude (基于 3 个并行 explore agent 的综合)
**Purpose**: 在做任何修复或升级之前，先把"我看到的项目"写下来给用户对照修正。这份文档是技术决策的事实底盘。

---

## TL;DR（30 秒摘要）

灵境(`lingjing-desktop` v1.5.1) 本质是：

> **从 itq5/OpenClaw-Admin fork 出来、7 天内完成品牌独立化的"小白用户向"AI Agent 桌面门户**。
> 它把 OpenClaw + Hermes 两个开源 Agent 框架打包成"装上就能用"的产品。
> **核心价值是降低中国小白用户接入 AI Agent 的门槛**，不是技术创新本身。
> 商业基础设施（自建云、quota 计费、创客编号分销、技能商城）**代码已就位但 v1.5.1 公开版未激活**。

---

## 1. 代码架构（事实层）

### 进程拓扑

```
┌──────────────────────────────────────────────────────────────────┐
│ Electron 主进程  (electron/main.js)                              │
│  ├─ 管理窗口 (welcomeWindow / mainWindow)                        │
│  ├─ 启动 Express server / OpenClaw / Hermes daemon              │
│  ├─ 端口探测 (OpenClaw 在 18789-18795 范围自选)                 │
│  ├─ 强制清理旧 daemon (避免协议不一致)                          │
│  └─ IPC 暴露: 通过 preload.cjs 给前端                           │
│                                                                   │
│  ├──→ Express server     (port 3000)                            │
│  │     ├─ /api/rpc        ← chat.send 入口 (走 v1.5 bypass)    │
│  │     ├─ /api/events     ← SSE 流给前端                       │
│  │     ├─ /api/hermes/*   ← Hermes 代理                        │
│  │     ├─ /api/auth/*     ← 灵境云端登录                       │
│  │     └─ /api/internal/  ← main 注入 token (loopback only)    │
│  │                                                                │
│  ├──→ OpenClaw gateway   (port 18789-18795)                     │
│  │     ├─ skills / agents / sessions                             │
│  │     └─ chat (v1.4 主路径，v1.5 已降为 fallback)              │
│  │                                                                │
│  └──→ Hermes daemon      (内嵌 Python venv, 端口 Hermes 自选)   │
│        └─ Agent execution / channels / models                    │
│                                                                   │
│  └──→ Vue 3 前端          (Vite dev: 3001 / packaged: file://)  │
│        ├─ HTTP POST /api/rpc          → 后端调用                 │
│        ├─ EventSource /api/events     → SSE 订阅                 │
│        └─ Pinia stores: chat/auth/websocket/hermes-cli/...      │
└──────────────────────────────────────────────────────────────────┘
```

### chat.send 完整链路（v1.5 bypass 路径）

```
用户在 ChatPage 输入 → chatStore.sendMessage()
  ↓
RPCClient POST /api/rpc { method: 'chat.send', params }
  ↓
Express server:
  1. 检查 lingjingApiToken 存在 (← 这里是出 bug 的地方)
  2. 立刻 HTTP 200 ack { runId }
  3. 异步 fetch https://api.aitoken.homes/v1/chat/completions?stream=true
  4. 解析 SSE delta → broadcastSSE 给所有前端 EventSource
  ↓
前端 ChatPage 收到 chat.delta SSE → 流式渲染到对话气泡
```

**关键事实**：v1.5 之后 chat.send **绕过了 OpenClaw daemon**，直接转发到 `aitoken.homes`。OpenClaw daemon 仅保留 `skills.list` / `agents.list` / `sessions.list` 等 read-only 方法。

### 核心模块速查

| 模块 | 主要文件 | 职责 |
|---|---|---|
| 灵境云端聊天 | `src/views/chat/ChatPage.vue` | 走 bypass 直连 aitoken.homes |
| Hermes Agent 聊天 | `src/views/hermes/HermesChatPage.vue` | rich UI，工具调用面板 |
| Hermes 管理面板 | `src/views/lingjing/Hermes*Page.vue` | Channels / CLI / Cron / Models / Sessions / Skills |
| 系统设置 | `src/views/settings/SettingsPage.vue` | Provider、自检诊断、日志 |
| 启动自检 | `src/views/lingjing/PreflightPage.vue` | 6 步登录后检查 |
| 状态层 | `src/stores/*.ts` | chat / auth / websocket / hermes-cli / agent / session / skill / lingjing-billing |

### 关键架构决策

| 决策 | 为什么 |
|---|---|
| 用 Express server 而不直接 IPC | chat 需要 SSE 流式 + 数据库必须在 userData + 端口/进程集中管理 |
| v1.5 chat 走 bypass | v1.0-1.4 OpenClaw daemon 在 packaged 环境无法保存 API key,bypass 直发 aitoken.homes 避开 daemon auth 问题 |
| 内嵌 OpenClaw + Hermes + Python + Node | npm registry 不稳、Python 依赖复杂、用户机器 Node 版本可能不兼容 — **零配置体验优先** |
| `api.aitoken.homes` 是灵境自建云 | 中央认证、quota 计费、模型分发都在一处 |

---

## 2. 演进历程（v1.0.0 → v1.5.1，7 天 12+ 个版本）

### 版本时间线

| 版本 | 日期 | 主题 |
|---|---|---|
| v1.0.0 | 2026-05-03 | 首次公开，从 itq5/OpenClaw-Admin fork |
| v1.0.1 | 2026-05-04 | **commit 9f3596f: 完整品牌独立** (删 22 张原作者截图，850→200 行重写 README，UI 文本 'Claw Admin'→'灵境') |
| v1.1.x | 2026-05-05/06 | 极简东方 UI 重设计 + 自动更新 + 瘦身 -650MB |
| v1.2.0-1.2.3 | 2026-05-06/07 | 错误日志面板（诊断核心）+ R2 镜像 + NSIS 卸载脚本 |
| **v1.3.0-1.3.6** | 2026-05-07/08 | **48 小时发 6 版（含 2 失败）** — 引入启动自检页架构，但暴露 OpenClaw 启动 bug |
| v1.4.x | 2026-05-07/08 | 节奏混乱期，无单版 commit |
| v1.5.0-1.5.1 | 2026-05-08/09 | bypass 路径上线 + 内嵌 Node 20 + smoke:full |

### 关键转折点

**1. 品牌独立化 (v1.0.1, 9f3596f)**
- 从 OpenClaw-Admin 完整剥离作者品牌，确立"灵境"独立身份
- 这不是 fork，是 **wrapper + 重新定义**

**2. v1.3 自检页+启动 bug 大坑 (v1.3.0-1.3.6)**
- v1.3.0 同时做了"自检页架构" + "OpenClaw 启动修复"两个独立变量 → 后续 5 版无法 bisect
- 最终 v1.3.6 客户手动验证才发现根因：`gateway.cmd` 缺 `OPENAI_API_KEY` → daemon 卡死
- **这次失败催生了 docs/v1.3-postmortem.md**

**3. v1.5 bypass 路径**
- 在客户验证 daemon auth 真根因后，作者决定**绕过 daemon chat**，server 直接 fetch aitoken.homes
- 这是商业角度的关键 — 让计费链路真正可控（chat 不经 daemon = 不会被 daemon bug 卡住计费）

### docs/v1.3-postmortem.md 体现的方法论

postmortem 是这个项目的**独特资产**，作者从 12 版失败中学到了 5 条：
1. 先写诊断脚本拿数据，不是立刻改代码
2. 每个假设都要最低成本验证（如 `schtasks /Query` 看 XML、`</dev/null` 测 cli 交互性）
3. 先建观测能力（错误日志面板、daemon 日志镜像）再做功能修复
4. **架构改动和 bug 修复永远分开发版**
5. 每次发版前必须设计"5 行 PowerShell 验证根因"的手动绕过

### 协作模式

- **个人开发 + Claude Opus 4.7 协作**（每个关键 commit 标 `Co-Authored-By: Claude Opus 4.7`）
- 中英混合 commit message（主中文）
- 高频迭代（postmortem 自评"48 小时 12 版本不正常"，是客户紧急反馈驱动）

---

## 3. 产品意图（README + commit + 代码暗示）

### 目标用户（明示）

| 渠道 | 措辞 |
|---|---|
| 中文 README | "面向中国小白用户" |
| 英文 README | "Beginner-friendly" |
| 一致点 | "无需懂 npm/pip/Python/Node，双击即用" |

**核心价值主张**：降低 AI Agent 在中国市场的接入门槛，不是技术创新。

### 商业基础设施（代码已就位）

| 维度 | 代码证据 | 状态 |
|---|---|---|
| 自建云 | `api.aitoken.homes/v1` (灵境自有，非第三方) | 在用 |
| Quota 计费 | `lingjing-billing.ts` 跟踪 quota/used_quota，CNY+USD 双币 | 在用 |
| 创客编号 | Register.vue 注册返回 user.id 作"创客编号"，UI 强调"妥善保留" | 在用，UI 暗示分销 |
| 邀请码 | auth API `aff_code` 字段后端支持，前端 UI 未实现 | **代码 ready，UI 暂未开放** |
| 技能商城 | SkillsPage.vue 接 ClawHub，搜索能跑 | 在用，未明确变现 |
| 模型路由 | 登录后自动配 Provider → aitoken.homes 作 OpenAI 兼容端点 | 在用 |

**商业模式推断**：
1. 用户获取：免费注册 + 云端试用额度 + 创客编号分销推广
2. 变现：按用量（quota）计费，CNY/USD 充值
3. 粘性：本地 OpenClaw/Hermes 能力（Agent/Cron/Skills）加深依赖

**v1.5 bypass 路径商业层意义**：chat 不经 daemon，**aitoken.homes 端 100% 计费可控**（不会被本地 daemon bug 卡住付费链路）。

### 第三方关系

| 项目 | 上游 | 灵境的做法 |
|---|---|---|
| OpenClaw | github.com/openclaw/openclaw | 内嵌锁定版本（resources/openclaw），中国镜像，环境变量补丁 |
| Hermes | github.com/NousResearch/hermes-agent | 内嵌 Python venv，messaging gateway 适配国内 IM |

**关系定性**：灵境**不是 fork，而是 wrapper**。包装并定制上游成"开箱即用"的桌面产品。

### 品牌定位

- **中文 tagline**（Login.vue）："让 AI 智能体走进你的桌面"
- **注册页**（Register.vue 左栏）："找到与你同道的智能体"（同道 = 共鸣/找同伴）
- **美学**：东方传统（宋体、朱砂红、油纸）+ 现代 UI
- **市场**：定位"国产精品"而非"开源工具"

### 19 个通信渠道（README 列出）

国内 5 个：QQ / 微信 / 飞书 / 钉钉 / 企业微信
海外 14 个：Telegram / Discord / Slack 等

**这是关键差异化**——竞品（Coze/Dify）很少同时覆盖国内国外 IM。

---

## 4. 代码异味与隐忧（我看到的风险）

### 隐忧 1：chat 历史内存泄漏

`chatHistoryStore` 是全局 Map，每 session 留最近 50 条但**没有过期清理**。
- 用户长期运行上千个不同 sessionKey → 内存线性增长
- 建议：LRU 或时间戳淘汰，或持久化

### 隐忧 2：broadcastSSE 缺流量控制

`broadcastSSE()` 遍历所有 sseClients 逐个 write，**任一客户端网络慢 → 阻塞当前消息**。
- 没 backpressure、没超时、没写队列
- 建议：async iterator 或队列缓冲 + 超时

### 隐忧 3：单元测试缺位

`tests/` 全是 e2e（Playwright），但：
- `server/index.js` 4000+ 行无单元测试
- chat bypass 流解析、历史管理、RPC 方法映射都没覆盖
- preflight 自检 6 步顺序依赖，单步失败难追根因

### 隐忧 4：v1.5.1 自检 bug 已被 spec 抓住

`PreflightPage.vue:87` 检查 `cfg.openclaw` 而非 `cfg.bypass`，导致"假通过 + chat 实际不可用"——这正是上一会话生成 spec 要修的。

### 隐忧 5：sessionStorage / server 内存生命周期不绑定

sessionStorage 标记"自检通过" vs server 内存的 token，两边节奏不同。
server 重启后 token 丢失但 sessionStorage 没失效 → 需要 quickCheck 兜底（spec 已含）。

---

## 5. 我的疑问清单（你 Phase B 要回答）

> 这些问题是 UNDERSTANDING.md 真正的价值。我光读代码答不了它们。

### 🎯 P0 — 商业模式确认（决定一切）

1. **`api.aitoken.homes` 真的是你自建吗？** 还是借用别人的服务自己包了一层？
2. **quota 计费现在已激活吗？用户现在用 chat 真的扣 quota 吗？**
3. **创客编号 + aff_code 分销机制 — 是计划在哪个版本启用？这是 v2.0 的核心商业化触发点吗？**
4. **技能商城 ClawHub 你打算怎么变现？分成？平台费？还是一直免费？**
5. **bypass 路径设计的真实动机是"让计费可控"还是"让 chat 稳定"？还是两者都有？**

### 🎯 P0 — 当前痛点排序（决定下一版优先级）

6. **v1.5.1 跑不了 chat（spec 已识别）—— 是用户报的最痛的事吗？**
7. **如果让你列下一版（v1.5.2 / v1.6）必须修的 3 件事，按优先级是什么？**
8. **你说"这个项目关乎我未来商业计划"——这个商业计划离"产品能赚钱"还差什么？是技术稳定？是用户量？是商业模式跑通？**

### 🎯 P1 — 目标用户具体化

9. **"小白用户"具体是谁？** 学生？小老板？内容创作者？还是想用 AI 但被门槛挡住的普通白领？给我一个**具体的姓名/职业/年龄虚构画像**。
10. **你的"第一批 100 个付费用户"长什么样？怎么找到他们？**

### 🎯 P1 — 路线图

11. **6 个月想做到什么？1 年？3 年？**
12. **有没有"过了 X 月没拿到 Y 必须放弃"的红线？**

### 🎯 P2 — 竞品 / 战略

13. **你心里的对标产品是谁？Coze / Dify / 扣子 / 千问 / 豆包？灵境 vs 它们的差异是什么？**
14. **OpenClaw / Hermes 上游关系长期怎么走？你会持续跟随上游升级，还是某天会 fork 永久锁定？**
15. **macOS 是计划重新激活还是放弃？**（仓库里有 mac build 配置但 v1.5 主要在 Win 推进）

### 🎯 P2 — 运营约束（坦诚一些会让我帮得更准）

16. **个人开发还是团队？团队规模？**
17. **多少时间预算 / 资金预算？必须在何时前看到收入？**
18. **目前是个 side project 还是 your full-time bet？**

---

## 6. 我建议的下一步顺序

读完这份文档，回来：
1. 标出哪里我**理解错了**（我极有可能弄错某些细节）
2. 标出哪些**疑问你愿意/不愿意回答**（有些可能涉及隐私）
3. 选你愿意先回答的 3 个 P0 / P1 问题，我用 superpowers:brainstorming 引导你逐一展开
4. Phase B 完成后，我们一起出 `docs/PRODUCT-VISION.md`
5. 然后再回头看 `docs/superpowers/plans/2026-05-10-preflight-timing-fix.md`，决定它的优先级

---

## Appendix: 三份原始 explore 报告

本文档由 3 个并行 explore agent 报告综合：
- 代码架构全景（agent #1）
- git 演进考古（agent #2）
- 产品意图汇总（agent #3）

完整原始报告保留在 task transcript（不入仓）。如果对任何 section 有疑问，告诉我我会回到原报告挖细节。
