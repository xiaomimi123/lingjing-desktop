# 灵境产品愿景 (PRODUCT-VISION)

**Date**: 2026-05-10
**Status**: v2 — 基于用户反馈修正核心商业逻辑（v1 把 bypass 当护城河误读了）
**Source**: docs/UNDERSTANDING.md 18 题 Q&A + 用户 mirror 确认 + 2026-05-10 用户对 chat 体验的纠偏反馈
**Purpose**: 所有技术决策（修什么、怎么修、什么时候修）必须能映射到本文档某条原则。

> **v2 修订背景**: v1 把 "v1.5 bypass 路径" 写成商业护城河, 是错误推断。
> 真相是: bypass 是 v1.3 OpenClaw daemon 在 packaged 环境保存 token 卡死时引入的临时绕道,
> 它把灵境退化成了 LLM wrapper, 牺牲了产品差异化。
> 用户原话: "我们的产品要具备 OpenClaw/Hermes 这两个智能体的能力, 而不是直接于我接入的大模型进行对话"。
> 真正的护城河是 OpenClaw/Hermes Agent 能力, aitoken.homes 是计费渠道, 二者不冲突。

---

## 0. 使命（一句话）

> **让中国用户零环境配置就能用上 OpenClaw + Hermes 这两个海外热门 AI Agent 框架，通过卖 token 把海外热度变现为国内现金流。**

---

## 1. 商业模式（已经在赚钱）

| 维度 | 现状 |
|---|---|
| **核心产品** | 灵境桌面 (Win, Electron) |
| **核心价值** | **让用户用上 OpenClaw + Hermes 的智能体能力**(多智能体/自动化/技能/跨平台 IM) |
| **变现方式** | 卖 token / quota — 用户用 Agent 能力时, LLM 调用经过 `api.aitoken.homes` 计费 |
| **当前状态** | **已激活、已有真实收入** |
| **未来增量** | 独特 skills 商城（v2.x，第一阶段免费保体验） |
| **分销机制** | aitoken.homes 后端已实现（不在桌面端代码里），创客编号 + aff_code 已就位 |
| **护城河** | **OpenClaw + Hermes 智能体能力** (产品差异化) |
| **计费渠道** | aitoken.homes (LLM Provider 端点, 不是产品定位) |

### 战略闭环（一图）

```
OpenClaw / Hermes 海外热度 (流量源)
        ↓
    中国用户搜索 / 推广
        ↓
  灵境桌面 (零配置入口)
        ↓
  用户登录 → 灵境 token 注入 OpenClaw daemon
        ↓
  用户用 OpenClaw / Hermes Agent 能力 (多智能体/技能/自动化/IM 渠道)
        ↓
  daemon 内部 LLM 调用 → aitoken.homes (作为 OpenAI 兼容 Provider)
        ↓
     扣 quota → 现金流入
```

**关键事实**:
- **如果用户没感受到 OpenClaw/Hermes 能力, 等于灵境失去差异化** (退化成 LLM wrapper)
- 计费在 daemon 内部 LLM 调用时发生 (aitoken.homes 端点), 不需要绕开 daemon
- v1.5 bypass 路径是 v1.3 OpenClaw daemon auth 卡死时的临时妥协, **应该在 v1.6 退役**

---

## 2. 目标用户

### 一类用户，多种身份

不是按"学生/小老板/白领"细分。**统一标签**：

> **想用 OpenClaw/Hermes 但被 npm/pip/Python/Node 环境挡住的人。**

可能包含：内容创作者、自媒体、小老板、轻量级开发者、AI 爱好者、Agent 早期采用者。**他们的共同特征是：愿意付费但不想/不能折腾环境。**

### 第一批 100 个付费用户来源

来自 **OpenClaw U 盘便携版启动器**（你的第一个产品）。这意味着：
- 灵境桌面**不是冷启动**，已有种子用户池
- 这 100 人**对你品牌有信任，对 AI Agent 有付费意愿**
- 灵境桌面的 KPI 之一：把这 100 人从 U 盘版迁移过来 + 留住

---

## 3. 产品矩阵（用户决策已定）

| 产品 | 状态 | 12 个月走向 |
|---|---|---|
| **OpenClaw U 盘便携版启动器** | 现存付费产品 | **逐渐废止**，存量用户迁移到灵境桌面 |
| **灵境桌面 (Windows)** | v1.5.1 | **唯一主力产品**，千场一面 |
| **灵境桌面 (macOS)** | 代码就绪 | **暂缓**，资源全部押 Win |

### 关键推论

- **没有"产品组合"复杂度**，所有精力聚焦灵境桌面 Win 版
- U 盘版用户迁移路径 = 后续要做的一个增量工作（不在 v1.5.2 范围）
- macOS 在"Win 稳定 + 用户量起来"之前不重启动

---

## 4. 当前阶段优先级（决定下一版做什么）

### 第一性原理

> **稳定性 > 一切。**
>
> 用户来灵境**不是来用「灵境特色功能」**，是来用「**零环境配置的 OpenClaw/Hermes**」。
> 灵境桌面的本质职责 = **把 OpenClaw/Hermes 端到端跑通，钱通过 chat 流向 aitoken.homes**。

### 当前痛点排序（用户确认）

| # | 痛点 | 影响 |
|---|---|---|
| 1 | **v1.5.1 在开发机和用户机都跑不起来 chat** | 现金牛漏水 |
| 2 | 用户配环境难（Node / Python / npm） | 流失第一关 |
| 3 | OpenClaw / Hermes 上游频繁更新，灵境跟不上易出兼容问题 | 长期风险 |

### 下一版（v1.5.2 / v1.6）必须修的 3 件事（用户原话改写）

1. **彻底修通 chat**（v1.5.2 当务之急）— 这是 spec 已定
2. **零环境一键使用** — 内嵌 Node / Python / npm（部分已做完）
3. **上游协同稳定性** — 见 §5 策略

### 不在 v1.5.2 范围

- 灵境特色功能（个性化 / 主题 / 高级技能商城等）
- macOS 重启动
- U 盘版用户迁移工具
- 全新设计的 UI

---

## 5. 上游协同策略（我帮你决策的部分）

> 你在 P2-14 说"不知道如何选择"。这是我的具体建议。

### 推荐：**钉版 + 跟随**双轨制

```
版本号锁定: 灵境 v1.5.x → OpenClaw v4.21.0 + Hermes v0.12.0 (内嵌)
              ↑                                  ↑
              ├─ 用户机器永远跑这个版本      ←── 钉版(防意外)
              ↓
观察上游: 每周一次 review OpenClaw / Hermes 的 changelog
              ↓
           ┌─有断 v4.21 的 bugfix? ─→ 升 v1.5.x → v4.21.x
           ├─有大版本 v5.0?       ─→ 排 v1.7.0 跟进 + 充分测试
           └─有 breaking change?  ─→ pin 在 v4.x 不动, v1.7 才考虑
```

### SOP

| 场景 | 操作 |
|---|---|
| 上游小版本 bugfix（patch） | 直接升内嵌版本 → 跑 smoke:full → 发灵境 patch 版 |
| 上游 minor 版本（新功能） | 评估 ROI → 排灵境 minor 跟进 |
| 上游 major 版本（breaking） | **不强跟**，至少观察 30 天 + 上游用户社区反馈再决定 |
| 上游消失/停更 | 启动 fork 永久锁定方案（兜底，不主动）|

### 自动化建议（v1.6 候选）

- 写一个脚本 `scripts/check-upstream.mjs`：每周 check OpenClaw / Hermes 的 GitHub releases，新版自动开 issue 提醒
- 在 CHANGELOG.md 维护一栏「上游 OpenClaw 版本」「上游 Hermes 版本」，每次发版透明标记

---

## 6. 战略红线（什么不能做）

| 红线 | 原因 |
|---|---|
| **不能让用户感受不到 OpenClaw/Hermes Agent 能力** | 这是真正的护城河;如果用户用着像普通 LLM, 灵境失去差异化 |
| **不能做让现有付费用户跑不了 chat 的改动** | 直接漏现金 |
| **不能拿用户当 CI**（v1.3 教训） | postmortem 已立明文 |
| **chat 必须经过 aitoken.homes 完成 LLM 调用** | 计费渠道不能丢, 但实现路径可以变 (daemon 内部 fetch 也算) |
| **不能在 v1.x 阶段做产品多元化** | 一个产品都没稳，不应分散注意力 |

> **v1 红线 "不能脱离 aitoken.homes 计费链路 / 不能在 chat 主路径重构" 已删**:
> 它们是基于 "bypass = 护城河" 的错误推断。真相是: 计费在哪条路径完成都行, 只要最终走 aitoken.homes。
> chat 主路径 v1.6 必须重构(切回 daemon), 否则用户体验背离产品定位。

---

## 7. 运营事实（一人全职 + 已盈利）

- **团队**：1 人（你）+ Claude Opus 4.7 协作
- **状态**：全职
- **资金**：充足
- **时间**：充足，无放弃红线
- **当前收益**：已有
- **健康度**：项目处于 healthy growth，不是 desperate burn

### 推论

- 我应该**追求质量而非速度**（你说"喜欢一次写对，不喜欢反复调试"）
- 修复完成后**先重新发布、稳定 1-2 周再做下一步**（不要继续 v1.3 那样高频迭代）
- **重要决策可以慢一拍**（你时间充足）

---

## 8. 短期路线图（接下来 1-3 个月）

### v1.5.2 — preflight 链路稳定化（**本周**, 已部分完成）
- ✅ Task 1-3: vitest 配置 + helper TDD + PreflightPage 第 4 步检查 `cfg.bypass`
- ✅ 4 个 dev 真根因修复: paths resourcesDir / candidates 内嵌 / install --force --json / spawn shell:true / testChat 走 bypass
- 🔜 修问题 1 多个 cmd 窗口 (technical bug)
- 🔜 重发 GitHub Release v1.5.2
- ⚠️ **v1.5.2 仍走 bypass** (临时, 解决 chat 至少能跑); v1.6 真正修复架构

### v1.6.0 — chat 切回 daemon (**核心战略版本**, 接下来 2-4 周)
**目标**: 让用户在"对话"页面真正感受到 OpenClaw Agent 能力, 同时计费仍走 aitoken.homes
- chat 主路径从 bypass → OpenClaw daemon (gateway WebSocket)
- daemon 配置 aitoken.homes 作为 OpenAI 兼容 Provider, 解决 v1.3 OpenClaw onboard 在 packaged 卡死的真根因
- 验证: 用户发消息 → 流式收到 → quota 真扣 → 模型自我认同灵境/OpenClaw 角色 → 可以触发 OpenClaw 的工具调用/技能
- bypass 路径降级为 fallback (daemon 不可用时才走), v1.7 完全移除
- **风险高, 必须先 brainstorm spec → 完整 plan → TDD 实施**, 不能直接动主路径代码

### v1.7.0 — 稳定性 + bypass 退役 + 周边 (**1-3 个月内**)
- 移除 bypass 代码 (v1.6 验证稳定后)
- Bug 修复堆积清理 (UNDERSTANDING.md 5 个隐忧: chat 历史泄漏 / SSE 流控 / 单测缺失等)
- 加 `scripts/check-upstream.mjs` OpenClaw/Hermes 上游监控
- U 盘版用户迁移工具
- macOS 重新激活

### v2.0.0 — 商城 + 分销（**3-6 个月内**）
- 技能商城激活变现路径（之前免费）
- 分销 UI 暴露（aff_code 入口）
- 创客等级 / 分成机制

---

## 9. 成功指标（你之后可以补充实际数字）

短期（v1.5.2 发布后 1 个月）：
- v1.5.2 装机用户的 chat 首次成功率（应 > 90%）
- 老用户留存（v1.5.0/1.5.1 → v1.5.2 升级率）

中期（v1.6/1.7 发布后 3 个月）：
- 月活付费用户数
- 用户平均 ARPU（quota 消耗）
- 上游同步周期（从 OpenClaw 新版到灵境跟进的时间，目标 < 30 天）

长期（v2.0）：
- 商城销售额占比
- 分销链贡献的新增用户数

---

## 10. 未决问题（下次会话可以接着聊）

1. U 盘版用户迁移到桌面版的具体路径（v1.7 候选）
2. 商城激活的具体定价模型（v2.0）
3. macOS 重启动的触发条件（多少用户问？多少潜在收入？）
4. 是否做"灵境社区/用户群"运营（小红书/微信群/Discord 等）
5. 是否计划发布 OpenClaw / Hermes 的中文译版作为流量入口
6. CDN / 分发：除 R2 外是否考虑国内 CDN 缓解下载速度

---

## 11. 对所有未来代码 PR 的影响（执行守则）

任何改动 PR/commit 必须能回答：

1. **它服务于哪条原则**？（§1-§5 任一条）
2. **它会不会触红线**？（§6）
3. **它的优先级**对应当前阶段（§4 + §8）的哪一步？
4. **它能不能 1 周内可见**结果？（你时间充足，但项目要保持节奏）

不能回答 = **不做**。

---

## 附录：本文档与其他 docs 的关系

| 文件 | 角色 |
|---|---|
| `docs/UNDERSTANDING.md` | 我对项目的代码/历史/产品的事实理解（基于 explore agents） |
| `docs/PRODUCT-VISION.md` (本文) | 用户验证后的"宪法" — 所有技术决策的依据 |
| `docs/superpowers/specs/*.md` | 单个 feature/fix 的设计 — 必须能映射到本文档某条原则 |
| `docs/superpowers/plans/*.md` | spec 的 TDD 实施计划 |
| `docs/v1.3-postmortem.md` | 历史教训，本文档 §6 红线的来源之一 |
