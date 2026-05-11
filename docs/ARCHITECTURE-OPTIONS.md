# 灵境架构选项调研 (v1.6 暂停后的战略决策文档)

**Date**: 2026-05-11
**Trigger**: v1.6 chat 切 daemon 实施时发现 4 层协议差异未解决（schema/event name/sessionKey 映射/BOOTSTRAP.md 身份），用户反思"为什么这么多 bug"+"框架选型是否有问题"。
**Method**: 4 个并行 explore agent 调研（OpenClaw GitHub / Hermes GitHub / canvas 实际探测 / 4 竞品架构）。
**Purpose**: 给用户 3 个具体架构选项 + 我的推荐 + 决策框架。

---

## TL;DR

> **灵境前端 70% 在重复造 Hermes UI 轮子, 5000+ 行代码可删. OpenClaw 那一半处理是对的(只走 RPC). 问题不是 Vue/Electron 框架选错, 而是把 server 当 RPC 透传层而非协议标准化网关.**

> **3 个选项: (A) 不重写代码, 修当前 v1.6 + 加协议网关; (B) Hermes 部分换 iframe 内置 dashboard, OpenClaw 部分保留 RPC; (C) 整体推翻, 灵境只做"启动器+登录+商城",直接打开 OpenClaw/Hermes 自带 UI**

---

## 1. 4 个 agent 调研的关键发现

### 1.1 OpenClaw 自带 web UI ✓ 完整
- **Control UI**: `resources/openclaw/dist/control-ui/` 完整 Vue 3 SPA, 41 文件, 含多语言(zh-CN/en-US)、3 主题(claw/knot/dash)、agents/skills/sessions 管理面板
- **Canvas**: `resources/openclaw/dist/canvas-host/a2ui/` 是 OpenClaw Canvas Skill 的 HTML 托管目录(agent 生成的可视化内容), **不是** chat UI
- **CLI 命令**: `openclaw dashboard` 显式启动 Control UI
- **当前 daemon 启动**: Control UI 应该自动伴启 (port 待确认)

### 1.2 Hermes 自带 web UI ✓ 完整
- **dashboard**: `hermes dashboard` 启动 FastAPI + React 19 + Vite, port 9119
- **10+ 页面**: ChatPage / ModelsPage / EnvPage / SkillsPage / SessionsPage / CronPage 等
- **当前灵境**: server/hermes-proxy.js 已经在代理转发 9119, 同时 src/views/hermes/ 又**复刻**了 13 个 Vue 组件

### 1.3 灵境复刻情况对比
| 上游引擎 | 灵境处理方式 | 重复造轮子? |
|---|---|---|
| **OpenClaw** | 只走 WebSocket RPC 不复刻 UI | ✓ 没复刻 (正确做法) |
| **Hermes** | 复刻 13 个 Vue 组件 = 70% 灵境前端代码 | ✗ 大量重复 |

### 1.4 竞品架构 (Cursor / Cherry Studio / Open WebUI / AnythingLLM)
**共同模式**: 都不让前端见到 daemon 原始协议, 必有"协议标准化网关"。
- Cherry Studio (国产 Electron+Vue) ≈ 灵境最相似定位
- AnythingLLM: Electron + Node Express 中间层屏蔽 LLM 差异
- 关键启示: **灵境的 server/index.js 应该是协议网关而非 RPC 透传**

---

## 2. 三个具体选项

### 选项 A: 保留现架构 + 加协议网关 (最小重写)

**做什么**:
- 不动前端代码 (Vue/Electron + 70% Hermes 复刻保留)
- 在 server/index.js 加**协议标准化层**:
  - 定义灵境统一 API: `POST /api/chat/send { sessionKey, message, agent: 'openclaw'|'hermes'|'bypass' }`
  - server 内部处理协议差异: openclaw 协议 / hermes 协议 / bypass 协议都被网关吸收
  - 前端只见统一 API, 不见 daemon 协议
- v1.6 sessionKey/runId 映射在 server 内部维护映射表
- BOOTSTRAP.md 在 configureOpenClawWindows 时由 main 覆写注入灵境身份

**改动量**: ~500-1000 行 (主要在 server)
**时间**: 1-2 周
**风险**: 中 (协议网关本身复杂, 维护成本高; v1.6 sessionKey/runId 映射可能还有第 4-5 层 bug)
**收益**: chat 真走 OpenClaw + Hermes, 拿到 Agent 能力; 前端不动

**适合**: 你认为前端代码量不是问题, 只想解决 chat 走 daemon。

---

### 选项 B: Hermes 换 iframe + OpenClaw 保留 RPC (中等重构, **我推荐**)

**做什么**:
- **OpenClaw 部分**: 保留现在的 RPC 模式 (chat 走 bypass, agents/skills 走 daemon)
- **Hermes 部分**:
  - 删除 `src/views/hermes/` 13 个 Vue 组件 (5000 行)
  - 删除 `src/views/lingjing/Hermes*Page.vue` 7 个 (估 2000 行)
  - Vue 路由 `/hermes/*` 改成 iframe `<iframe src="http://127.0.0.1:9119/...">`
  - server/hermes-proxy.js 处理身份注入 (token 通过 URL query 或 cookie)
- **灵境特色页** (chat / settings / 系统设置 / 登录) 保留
- v1.6 chat 切 daemon **取消**, 永久走 v1.5.2 bypass (OpenClaw daemon 仍跑提供 skills/agents 接口给前端)

**改动量**: 删 7000 行, 加 200 行 iframe + 身份注入逻辑
**时间**: 3-5 天
**风险**: 低 (iframe 久经考验, Hermes 自己的 UI 比我们复刻的更新更稳)
**收益**:
  - 灵境代码量减半
  - Hermes 升级自动同步 UI
  - 用户能感受到 "OpenClaw + Hermes 真实能力" (Hermes 那侧立刻拿到所有 ChatPage/Skills/Cron)
  - chat 仍走 bypass 计费可控
  - PRODUCT-VISION §1 "Agent 能力是护城河" 通过 Hermes iframe 立刻满足

**代价**: 失去 Hermes UI 的灵境品牌外壳 (用户在 Hermes 模式下看到原版 React UI 而不是东方美学)

**适合**: 你认可 "把上游能力直接给用户 > 自己复刻保品牌一致" 这个取舍。

---

### 选项 C: 灵境降级为"启动器" (大重构)

**做什么**:
- 灵境只保留:
  - 一键安装 / 内嵌 OpenClaw + Hermes + Python + Node (已做)
  - 登录页 + 创客编号 + 充值入口 + 余额显示
  - 启动控制台 (启动/停止 daemon + 日志查看 + 自检)
  - 技能商城 (灵境特色)
- chat / agents / skills / sessions 全部**直接打开** OpenClaw Control UI (18789) 或 Hermes Dashboard (9119)
- 灵境 Vue 前端**只剩 5-6 页**
- 用户体验类似"灵境是 OpenClaw 的中国发行版 + 增值服务"

**改动量**: 删 80% 前端代码
**时间**: 2-3 周 + 用户体验重设计
**风险**: 高 (产品定位重塑)
**收益**:
  - 极简代码库 (维护成本 = 之前 1/5)
  - 上游升级自动同步
  - 灵境聚焦"商业层" (登录/付费/商城/分销)
  - 跟随 OpenClaw/Hermes 海外热度更直接
**代价**:
  - 失去东方美学品牌外壳
  - 用户感觉灵境"只是个外壳" (虽然这正是 PRODUCT-VISION 写的真相)

**适合**: 你重新审视产品定位, 接受"灵境的价值在 商业层 + 中国本地化, 不在 UI 设计"。

---

## 3. 我的推荐: 选项 B

**理由**:
1. **PRODUCT-VISION §6 红线**: "不能让用户感受不到 OpenClaw/Hermes Agent 能力" — 选项 B 在 Hermes 那半立刻满足
2. **代码量减半** = 长期维护成本一半, 单个开发者可持续
3. **iframe 工程难度低** (跨域 + token 注入是标准问题, 不像 daemon 协议适配那么深)
4. **不丢现金流**: chat 仍走 v1.5.2 bypass, aitoken.homes 计费可控
5. **3-5 天可交付**: 比选项 A 快, 比选项 C 不那么激进
6. **保留灵境特色**: 登录/商城/系统设置/chat 仍是 Vue 东方美学

**风险点**:
- iframe 跨域 + token 注入需要试一下 (Hermes 是 localhost FastAPI, 应该可控)
- 用户切到 "Hermes 通信渠道" 页时看到原版 React UI 风格突变 — 这是 UX 妥协

**B 的具体路径**:
1. **v1.5.3** (本周): 不动代码, 只先打开 Hermes Dashboard 调研 → 你看一眼 9119 端口 UI 是否能接受
2. **v1.6.0** (1-2 周): Hermes 路由改 iframe + 删冗余 Vue 组件
3. **v1.7.0** (1 个月): OpenClaw 那侧仍 RPC, 但 server 加协议网关层 (从 daemon 协议吸收差异, 前端只见统一 API)
4. **永久放弃 v1.6 chat 切 daemon 计划** (因为 chat 走 bypass 已经是 OK 的, 不会让用户感受不到 Agent 能力 — 因为 Agent 能力在 Hermes iframe 提供)

---

## 4. 决策框架

回答下面 4 个问题, 哪个选项最匹配:

| 问题 | 选 A | 选 B | 选 C |
|---|---|---|---|
| 你看重前端品牌一致性吗? | 是 | 部分 | 不 |
| 你愿意删 5000-7000 行 Vue 代码吗? | 不 | 是 | 是 |
| Hermes 原版 React UI 风格突变能接受吗? | — | 能 | 能 |
| 你期望 1 周内可见结果还是 1 个月? | 1 月 | 1 周 | 1 月+ |

---

## 5. Out of scope (不在本决策范围)

- 换 Tauri / Python GUI / 其它桌面框架: 调研发现问题不在 Electron, 在 server 不是协议网关; 换框架不解决问题, 重写量更大
- 完全自建 LLM 接入 (不用 OpenClaw/Hermes): 这就不是灵境了, PRODUCT-VISION §1 明确"OpenClaw/Hermes 是护城河 (海外热度)"
- iOS/Android 移动版: v2.0+

---

## 6. 我建议的下一步

1. **不要立刻选** A/B/C — 你先去**实际打开 Hermes 9119 端口**看一下 UI 是否能接受 (选项 B 的关键依赖)
2. 我可以帮你启动 Electron 后 portforward 9119 让你浏览器看 Hermes 原版 dashboard
3. 看完后用 AskUserQuestion 选 A/B/C
4. 选定后, 进 `superpowers:brainstorming` 出对应 spec → plan → 实施

**v1.5.2 在生产中不受影响**: 选 A/B/C 都不影响现有付费用户 (我们已 CHAT_DAEMON_ENABLED=0 默认关)。
