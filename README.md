# 灵境 (Lingjing Desktop)

<p align="center">
  <strong>面向中国小白用户的 OpenClaw + Hermes Agent 一体化桌面客户端</strong>
</p>

<p align="center">
  <a href="https://github.com/xiaomimi123/lingjing-desktop">GitHub</a> &bull;
  <a href="#特性">特性</a> &bull;
  <a href="#安装">安装</a> &bull;
  <a href="#开发">开发</a> &bull;
  <a href="README.en.md">English</a>
</p>

***

## 关于灵境

灵境是一个 Windows / macOS 桌面应用,把 [OpenClaw Gateway](https://github.com/openclaw/openclaw) 和 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 这两个 AI Agent 框架打包成「装上就能用」的产品 —— 用户**不需要懂 npm / pip / Python / Node**,双击安装包即可使用。

主要面向**中国市场**:
- 默认接入国内镜像源(ClawHub 中国镜像、淘宝 npm、清华 pip)
- 内嵌 OpenClaw / Hermes / Python 锁定版本,避免上游版本不兼容
- 通信渠道侧重国内平台(QQ、微信、飞书、钉钉、企业微信),同时支持 Telegram / Discord / Slack 等海外渠道

## 特性

### 双 Agent 网关
- **OpenClaw**:完整聊天 + 多智能体 + 自动化任务 + 技能商城
- **Hermes**:通过 messaging gateway 接入 IM 平台(用户在 Telegram / 微信 / Discord 等平台直接 @ Agent 对话)

### 通信渠道(19 个)
**国内**:QQ、飞书、钉钉、企业微信、个人微信
**海外**:Telegram、Discord、Slack、WhatsApp、Signal、Matrix、Line、iMessage 等

### 模型管理
- 内置灵境云端模型直接可用
- 自定义任意 OpenAI / Anthropic / DeepSeek / OpenRouter 等兼容服务,API Key 加密存本地

### 多智能体
- 创建独立 Agent,自动继承主 Agent 的模型配置
- 每个 Agent 独立 workspace、独立 session、独立技能集

### 自动化任务
- Cron 表达式调度
- 模板一键创建(每日早报、每周巡检、每月小结等)

### Apple 风格 UI
- 浅色 / 深色双主题
- 4px 网格、克制配色、Apple HIG 设计语言
- 完整中文本地化

## 安装

### 一键安装(推荐)

从 [Releases](https://github.com/xiaomimi123/lingjing-desktop/releases) 下载最新版 `灵境-x.y.z-x64.exe`,双击安装。

灵境会自动配置好 OpenClaw + Hermes + Python 等所有依赖,**无需手动安装 Node、Python、npm 等任何工具**。

### 系统要求

| 项 | 要求 |
|---|---|
| OS | Windows 10/11 (x64) 或 macOS 12+ |
| 内存 | 4GB 以上 |
| 磁盘 | 安装包 ~350MB,运行时 ~600MB |
| 网络 | 首次启动需联网(下载技能商城等内容) |

## 开发

如果你想从源码运行或贡献代码,需要:

| 工具 | 版本 |
|---|---|
| Node.js | 22.x(推荐) |
| Python | 3.12(Hermes 用) |
| Git | 任意版本 |
| Visual Studio Build Tools | C++ 桌面开发负载(构建 better-sqlite3 / node-pty 用) |

```bash
# 1. clone
git clone https://github.com/xiaomimi123/lingjing-desktop.git
cd lingjing-desktop

# 2. 安装依赖
npm install
npm run rebuild:native   # 给 Electron 重编原生模块

# 3. 拷贝 .env
cp .env.example .env

# 4. 起开发模式
npm run electron:dev
```

### 打 Windows 安装包

```bash
npm run dist:win
# 产物在 release/灵境-x.y.z-x64.exe
```

### 打 macOS 安装包

```bash
npm run dist:mac
# 产物在 release/灵境-x.y.z-{arm64,x64}.{dmg,zip}
```

### 测试

灵境用 Playwright 做 E2E 测试。先把测试账号填入 `.env.test`:

```
LINGJING_TEST_EMAIL=你的灵镜邮箱
LINGJING_TEST_PASSWORD=你的密码
```

然后:

```bash
npm run test:e2e
```

另外 `scripts/` 提供 3 个 Win 快速冒烟脚本:

```bash
node scripts/win-smoke.mjs        # 启动前预检(Node、CLI、网络)
node scripts/win-endpoints.mjs    # 启动后端口活性
node scripts/win-login-flow.mjs   # 真实登录闭环测试
```

## 项目结构

```
electron/main.js             # Electron 主进程(窗口、IPC、子进程拉起)
server/                      # 灵境后端(Express + WebSocket → OpenClaw / Hermes 代理)
src/                         # Vue 3 前端
  ├── views/                 # 路由页面(chat、agents、channels、models 等)
  ├── components/layout/     # AppHeader、AppSidebar
  ├── stores/                # Pinia 状态(auth、chat、agent、channel-management 等)
  ├── api/                   # WebSocket / RPC / Hermes HTTP 客户端
  └── i18n/                  # 中英双语
scripts/                     # Win 冒烟测试脚本
tests/                       # Playwright E2E
docs/archive/                # 历史一次性文档
```

## License

MIT

## 反馈

- Bug / 功能请求:[GitHub Issues](https://github.com/xiaomimi123/lingjing-desktop/issues)
