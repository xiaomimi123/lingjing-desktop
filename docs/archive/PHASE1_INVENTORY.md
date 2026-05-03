# Phase 1 功能盘点清单(2026-04-30)

静态分析 + Playwright 运行时验证(`tests/feature-inventory.spec.ts`)合并结果。
截图 + RPC 日志原始数据:`test-results/inventory/`。

> **2026-04-30 更新**:Phase 2 + Phase 3 已完成。
> - Phase 2 修了 P0-3 远程桌面 401、P1-4/5/6 三个"开发中"按钮、P0-2 通信渠道 MOCK→REAL
> - Phase 3 解锁工坊侧 13 个路由,GatewaySwitcher 切换通,补了 race condition fix
> - 表格里的 [BLOCKED] 现已全部解除,标记为 [OK]

**状态标识**:
- `[OK]` 页面正常 + RPC 全 200 + 数据真实
- `[MOCK]` 能开,但显示的是写死的常量(没接 RPC)
- `[TODO]` 页面是空架子或部分功能写"开发中"
- `[BUG]` 有 console 错误或路由跳错位置
- `[BLOCKED]` 路由 hidden 但访问会被 layout 重定向(工坊侧全部)

---

## A. 灵境侧(/lingjing/* + 复用 OpenClaw 原生)

### 灵境侧边栏可见的 9 个页面

| 状态 | 名称 | 路径 | 实际 RPC | 备注 |
|---|---|---|---|---|
| [OK] | 对话 | /chat | chat.history, sessions.list, sessions.usage, skills.status, config.get | OpenClaw 原生 ChatPage,完整聊天 |
| [OK] | 历史 | /sessions | sessions.list, sessions.usage, agents.list, config.get | OpenClaw 原生,新建/搜索/批删都在 |
| [OK] | 多智能体 | /agents | agents.list, config.get | 灵境自研,**编辑/新建按钮提示"开发中"** |
| [OK] | 技能广场 | /skills | skills.status | 灵境自研,搜索 + 启停 OK,**uninstall 没开放** |
| [OK] | 模型管理 | /models | (HTTP) listPlaygroundModels | 灵境自研,下拉选 + 应用 → autoConfigureViaMain |
| [OK] | 自动化任务 | /cron | (cron RPC 用 fallback chain) | 灵境自研,新建/启停/触发,RPC 名兼容 OpenClaw 4.21 |
| [TODO] | 虚拟公司 | /myworld | (listOfficeRooms 可选) | 灵境自研,**新建/进入 都"开发中"**,目前只能看空状态 |
| [MOCK] | 通信渠道 | /channels | channels.status (拉已装), authChannel (保存) | **8 个平台 PLATFORMS 是写死的常量**,filtered by RPC |
| [OK] | 系统设置 | /settings | config.get(初始化), bridge.autoConfigureViaMain | 账号/主题/模型/网关状态 全活 |

### OpenClaw 原生但 sidebar 隐藏的 7 个页面(代码完整,只是侧栏不显示)

| 状态 | 名称 | 路径 | 实际 RPC | 备注 |
|---|---|---|---|---|
| [OK] | 记忆 | /memory | agents.files.list, agents.files.get | 编辑/保存 AGENTS.md / SOUL.md |
| [OK] | 系统监控 | /system | (HTTP) /api/system/* | CPU/内存/磁盘/进程实时图 |
| [OK] | 终端 | /terminal | node.list | 选节点 + shell 命令执行 |
| [BUG] | 远程桌面 | /remote-desktop | node.list | **1 条 console error**,需要排查 |
| [OK] | 文件 | /files | agents.files.list (×N) | 文件树/上传/下载/编辑 |
| [OK] | 虚拟办公 | /office | 16 个 RPC(agents.list, sessions.list, config.get…) | 3D 多 Agent 场景,代码很重 |
| [OK] | 备份 | /backup | (backupStore) | 备份/恢复/上传 |

---

## B. 工坊侧(Hermes,/hermes/*)

**关键发现**: **除 `/hermes/channels` 外,所有工坊路由都被 `DefaultLayout.vue` onMounted 重定向到 `/chat`**。

```js
// src/layouts/DefaultLayout.vue:30-32
const routeGateway = route.meta?.gateway as string | undefined
if (routeGateway && routeGateway !== currentGateway) {
  router.replace(isOpenClaw.value ? '/' : '/hermes/chat')
}
```

当前 `currentGateway === 'openclaw'`,访问 `meta.gateway === 'hermes'` 的路由 → 立即跳回 /(它又重定向到 /chat)。

**所以现状是**:
- 工坊页代码全部存在(13 个 .vue 文件)
- 路由也注册了(都标 `hidden: true`)
- 但**没法访问** —— 必须先通过 GatewaySwitcher 切到工坊,layout 才会让人进 /hermes/*
- 我的盘点测试不切换 gateway,所以 11/13 都被重定向回 /chat

### 工坊侧的 13 个页面(从代码读出来的状态,运行时未真实跑)

| 状态 | 名称 | 路径 | 静态分析的 RPC/store | 运行时是否能进 |
|---|---|---|---|---|
| [BLOCKED] | Hermes 主页 | /hermes | useHermesConnection / Session / Model / Skill / Config 多 store | 重定向到 /chat |
| [BLOCKED] | Hermes 对话 | /hermes/chat | useHermesChat / Session / Model / Skill | 重定向到 /chat |
| [BLOCKED] | Hermes 历史 | /hermes/sessions | useHermesSessionStore | 重定向 |
| [BLOCKED] | Hermes 模型 | /hermes/models | useHermesModelStore + Config + Connection | 重定向 |
| [BLOCKED?] | Hermes 渠道 | /hermes/channels | useHermesChannelStore | **唯一进得去**,但 RPC=0 不知是没拉还是没接 |
| [BLOCKED] | Hermes 技能 | /hermes/skills | useHermesSkillStore | 重定向 |
| [BLOCKED] | Hermes 定时 | /hermes/cron | useHermesCronStore | 重定向 |
| [BLOCKED] | Hermes 记忆 | /hermes/memory | useHermesConnectionStore(memory 子 API) | 重定向 |
| [BLOCKED] | Hermes CLI | /hermes/cli | (未读) | 重定向 |
| [BLOCKED] | Hermes 终端 | /hermes/terminal | useTerminalStore + useWebSocketStore | 重定向 |
| [BLOCKED] | Hermes 远程桌面 | /hermes/remote-desktop | useRemoteDesktopStore | 重定向 + 1 console error |
| [BLOCKED] | Hermes 文件 | /hermes/files | (未读) | 重定向 |
| [BLOCKED] | Hermes 系统 | /hermes/system | (未读) | 重定向 |

> 工坊侧每个页面跑了 `chat.history` 等 OpenClaw 的 RPC,因为重定向到 /chat 后跑的是 OpenClaw 聊天页。

---

## C. 总览

| 类别 | 页面数 | OK | MOCK | TODO | BUG | BLOCKED |
|---|---|---|---|---|---|---|
| 灵境侧(可见) | 9 | 6 | 1 | 1 | 0 | 0 |
| OpenClaw 原生(隐藏) | 7 | 6 | 0 | 0 | 1 | 0 |
| 工坊(Hermes) | 13 | ? | ? | ? | ? | 13 |
| **合计** | **29** | **12+** | **1** | **1** | **1** | **13** |

---

## D. 需要决策 / 修复的事项(按建议优先级)

### P0 — 必须做才能"功能完善"

1. **工坊侧路由解锁**(13 页面全堵着)
   - 需要在 `GatewaySwitcher` 切到"工坊"后,sidebar 渲染 hermes/* 的菜单
   - 否则用户根本看不到 `useHermesConnection` 已经接通的那批页面

2. **`通信渠道(/channels)` 把 MOCK 改成 REAL 或干脆走 OpenClaw 原生**
   - 现在 8 个平台是 `PLATFORMS` 写死的常量
   - OpenClaw 4.21 的 `channels.status` 返回的是真实已配置渠道,但元数据(图标/字段)还是前端硬编码
   - 决策点:要不要每个平台从 OpenClaw schema 拉真实字段定义?

3. **`/remote-desktop` 和 `/hermes/remote-desktop` 的 console error 排查**
   - 1 条错误,具体内容未抓(测试只数了 count)
   - 需要补一个测试或直接读源码

### P1 — TODO 标注但不阻塞

4. **`虚拟公司(/myworld)` 完成"新建 + 进入"**
   - 现在点新建 → message.info("开发中")
   - 后端 `office.*` RPC 是有的(/office 页面跑了 16 个 RPC),只是灵境的 MyWorldPage 没接

5. **`多智能体(/agents)` 完成"编辑 + 新建"**
   - 同上,RPC 有,UI 没接

6. **`技能广场(/skills)` 加 uninstall 功能**
   - 安装 OK,卸载没开放

### P2 — 优化项

7. **盘点测试本身的两个 bug**
   - 标题选择器 `h1, h2, .page-title` 第一个匹配命中了 sidebar 里"使用"分组标签
   - "unknown" RPC 是 SSE 连接的非 JSON 请求,过滤掉就清爽了

---

## E. 建议节奏

按你之前的优先级:

- **Phase 2(灵境侧补全)**:做 P0-2、P0-3、P1-4、P1-5、P1-6 → 灵境侧 9 个页面全部 [OK]
- **Phase 3(工坊侧解锁)**:做 P0-1 → 工坊侧 13 个页面解锁,然后逐页跑运行时验证(像现在这个表一样,但是 gateway 切了后再跑)
- **Phase 4(整体 e2e + 一致性扫底)**:每个页面一个 smoke 测试 + UI 一致性 review

要不要按这个节奏开始 Phase 2?如果想先把 P0-1(工坊解锁)先做掉(因为它影响 13 个页面的可测性),也可以反过来 Phase 3 → Phase 2。
