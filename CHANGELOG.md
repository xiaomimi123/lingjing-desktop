# Changelog

All notable changes to this project will be documented in this file.

> 注: v1.0.1 -> v1.5.1 之间发版节奏混乱(48 小时 12 版, 4 版失败), 当时未做 git 单版 commit. 本文件根据 release/Lingjing-Setup-*.exe 与 docs/v1.3-postmortem.md 反推. 单版源码状态已不可追溯, 仅从 v1.5.1 起每版 commit + tag.

## [1.5.1] - 2026-05-08

### Added
- 应用图标(灵境品牌)
- 模型管理页"当前生效"标记

## [1.5.0] - 2026-05-08

### Changed
- (历史细节已不可追溯, 详见 docs/v1.3-postmortem.md)

## [1.4.x] - 2026-05-07/08

### Changed
- (历史细节已不可追溯)

## [1.3.0 - 1.3.6] - 2026-05-07/08

### Added
- 启动自检页(PreflightPage), 启动顺序串行验证, 全部通过才进主页

### Fixed
- v1.3.1: gateway install step 修复(仍卡, 后续版本继续追根因)
- v1.3.3: 直接 patch openclaw.json mode 修复 daemon 启动
- v1.3.4: strip BOM, 修 v1.3.3 副作用
- v1.3.5: 删多余 spawn
- v1.3.6: gateway.cmd 注入 OPENAI_API_KEY (daemon 卡死真根因)

### Known Issues
- v1.3.1, v1.3.2 失败发版, 详见 docs/v1.3-postmortem.md
- v1.3.0 把架构重构和 bug 修复耦合发版, 难定位回归

## [1.2.0 - 1.2.3] - 2026-05-06/07

### Added
- v1.2.1: 错误日志面板(后续每次诊断的核心入口)
- v1.2.2: 首启 splash 文案 + R2 镜像分发(国内可用)
- v1.2.3: NSIS 卸载脚本 + cleanup daemon

### Changed
- v1.2.0: OpenClaw 隔离 (state dir / task name / port 三重 profile) - 失败, env 未传给 Scheduled Task

## [1.1.0 - 1.1.4] - 2026-05-05/06

### Added
- UI 极简东方重设计
- 自动更新 UI 接入 electron-updater
- 启动体验优化

### Changed
- v1.1.1: files filter 加 dev deps 黑名单, 安装包瘦身 -600MB
- v1.1.2/v1.1.4: 剔 node-pty 跨平台 prebuilds + python 不用模块, -51MB

## [1.0.1] - 2026-05-04

### Added
- server gateway 事件常驻日志
- chat watchdog 30s

### Fixed
- packaged 模式 11 类启动崩溃 + 启动诊断设施

## [1.0.0] - 2026-05-03

灵境桌面首个公开版本.

### Added
- Windows 平台首发支持
- 内嵌 OpenClaw / Hermes / Python 锁定版本
- 灵境云端模型自动接入
- 自定义 OpenAI/Anthropic/DeepSeek 等兼容服务支持
- Apple 风格 UI(浅色 / 深色双主题)
- 8 个 OpenClaw 通信渠道 + 11 个 Hermes 通信渠道
- 多智能体自动继承主 Agent 模型
- Playwright E2E 测试套件 + Win 冒烟测试三件套

### Changed
- 启用 OpenClaw 中国镜像源(cn.clawhub-mirror.com)加速技能商城
- Hermes 直接对话页改为 messaging gateway 引导(适配 Hermes 0.12 上游变更)
- 左侧栏 UI 重构,对齐 openclaw-key 设计语言
