# Lingjing Desktop (灵境)

<p align="center">
  <strong>Beginner-friendly desktop client integrating OpenClaw + Hermes Agent for Chinese users</strong>
</p>

<p align="center">
  <a href="https://github.com/xiaomimi123/lingjing-desktop">GitHub</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#install">Install</a> &bull;
  <a href="#development">Development</a> &bull;
  <a href="README.md">中文</a>
</p>

***

## About

Lingjing Desktop bundles [OpenClaw Gateway](https://github.com/openclaw/openclaw) and [Hermes Agent](https://github.com/NousResearch/hermes-agent) into a single ready-to-use Windows / macOS desktop application. End users **don't need to know npm / pip / Python / Node** — just double-click the installer.

Optimized for the **Chinese market**:
- China mirror sources by default (ClawHub CN mirror, Taobao npm, Tsinghua pip)
- Embeds locked OpenClaw / Hermes / Python versions to avoid upstream incompatibilities
- Communication channels prioritize Chinese platforms (QQ, WeChat, Feishu, DingTalk, WeCom) while supporting Telegram / Discord / Slack etc.

## Features

### Dual Agent Gateway
- **OpenClaw**: full chat + multi-agent + cron tasks + skills marketplace
- **Hermes**: messaging gateway integration — users chat with the agent through Telegram / WeChat / Discord etc.

### Communication Channels (19)
**China**: QQ, Feishu, DingTalk, WeCom, WeChat
**Global**: Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Line, iMessage etc.

### Model Management
- Built-in cloud models ready to use
- Custom OpenAI / Anthropic / DeepSeek / OpenRouter compatible providers; API keys encrypted locally

### Multi-Agent
- Each new agent automatically inherits the main agent's model
- Independent workspace, sessions, and skill set per agent

### Cron Automation
- Schedule with cron expressions
- Templates: daily digest, weekly review, monthly summary

### Apple-style UI
- Light / dark themes
- 4px grid, restrained palette, Apple HIG language
- Full Chinese localization

## Install

### One-click (recommended)

Download the latest `灵境-x.y.z-x64.exe` from [Releases](https://github.com/xiaomimi123/lingjing-desktop/releases) and double-click.

Lingjing auto-configures OpenClaw + Hermes + Python — **no manual install of Node / Python / npm needed**.

### System Requirements

| Item | Requirement |
|---|---|
| OS | Windows 10/11 (x64) or macOS 12+ |
| RAM | 4GB+ |
| Disk | Installer ~350MB, runtime ~600MB |
| Network | First launch requires internet (skill marketplace etc.) |

## Development

To run from source:

| Tool | Version |
|---|---|
| Node.js | 22.x (recommended) |
| Python | 3.12 (Hermes) |
| Git | any |
| Visual Studio Build Tools | C++ desktop workload (for better-sqlite3 / node-pty) |

```bash
# 1. clone
git clone https://github.com/xiaomimi123/lingjing-desktop.git
cd lingjing-desktop

# 2. dependencies
npm install
npm run rebuild:native   # rebuild native modules for Electron

# 3. .env
cp .env.example .env

# 4. dev mode
npm run electron:dev
```

### Build Windows installer

```bash
npm run dist:win
# Output: release/灵境-x.y.z-x64.exe
```

### Build macOS installer

```bash
npm run dist:mac
# Output: release/灵境-x.y.z-{arm64,x64}.{dmg,zip}
```

### Tests

Lingjing uses Playwright for E2E. Add credentials to `.env.test`:

```
LINGJING_TEST_EMAIL=your-email
LINGJING_TEST_PASSWORD=your-password
```

Then:

```bash
npm run test:e2e
```

`scripts/` also provides 3 quick smoke scripts for Windows:

```bash
node scripts/win-smoke.mjs        # pre-launch checks (Node, CLI tools, network)
node scripts/win-endpoints.mjs    # post-launch port liveness
node scripts/win-login-flow.mjs   # real login flow test
```

## Project Layout

```
electron/main.js             # Electron main process (window, IPC, child processes)
server/                      # Lingjing backend (Express + WebSocket → OpenClaw / Hermes proxies)
src/                         # Vue 3 frontend
  ├── views/                 # routed pages (chat, agents, channels, models, ...)
  ├── components/layout/     # AppHeader, AppSidebar
  ├── stores/                # Pinia stores (auth, chat, agent, channel-management, ...)
  ├── api/                   # WebSocket / RPC / Hermes HTTP clients
  └── i18n/                  # Chinese + English
scripts/                     # Windows smoke test scripts
tests/                       # Playwright E2E specs
docs/archive/                # Historical one-off docs
```

## License

MIT

## Feedback

- Bugs / features: [GitHub Issues](https://github.com/xiaomimi123/lingjing-desktop/issues)
