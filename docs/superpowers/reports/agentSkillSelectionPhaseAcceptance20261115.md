# Agent Skill 选择与 AUTO 阶段验收报告

**日期：** 2026-11-15<br>
**分支：** `codex/enterprise-comic-p0`<br>
**验收范围：** 用户侧 Skill 发现与筛选、按消息选择模式、AUTO 触发词推荐、发送前推荐一致性门禁、运行选择记录与会话恢复。

## 结论

**阶段二通过。** 用户可以在不记命令的情况下按制作阶段和来源筛选 Skill，查看简介、版本和来源，并显式固定 Skill。AUTO 只使用当前输入与 Skill `metadata.triggers`，不读取生产项目阶段；发送前会确认推荐与当前输入、工作目录一致。推荐失败或无匹配时，本条请求会显式使用普通 Agent。

## 实际验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 当前分支 | 通过 | `git branch --show-current` 为 `codex/enterprise-comic-p0`；未切换或修改 `master`。 |
| 路由生成 | 通过 | 在 `apps/server` 执行 `bun run routes`，退出 0。 |
| Server 类型检查与构建 | 通过 | `bun run typecheck` 与 `bun run build` 均退出 0。 |
| Web 类型检查与构建 | 通过 | `bun run typecheck` 与 `bun run build` 均退出 0。构建仅有既存的大 chunk 体积提示。 |
| 技能目录实际加载 | 通过 | 本地工作区页面打开技能菜单，实际加载 10 项全局 Skill，显示名称、说明、阶段、来源与版本。 |
| 阶段和来源筛选 | 通过 | 选择“分镜”后仅显示 `storyboard`；选择“工作区”时正确显示无匹配；切回“全局”恢复全局 Skill 列表。 |
| 固定与清除选择 | 通过 | 选择 `storyboard` 后消息框插入 `/skill:storyboard` 并选中固定模式；切到“不使用”后命令前缀被移除，消息框保持空白。 |
| AUTO 命中 | 通过 | 输入“小说改编”后推荐“视频制作工作流”，理由为“命中触发词：小说改编”。 |
| AUTO 无匹配 | 通过 | 输入“写一首关于月亮的诗”后显示无匹配，并提示本条按普通对话处理。 |
| 隔离 Skill 解析与会话回放 | 通过 | 隔离目录演练覆盖工作区同名优先、禁用自动调用、无匹配、显式 `/skill:` 优先、固定不存在 Skill 返回 400；会话文件回放可恢复选择方式、版本和来源。 |
| 差异格式 | 通过 | `git diff --check` 无输出。 |

未提交任何 Agent 或模型请求，避免把验收提示词发送给配置的模型服务或触发计费。发送前竞态通过实际推荐 API、隔离解析演练、代码路径审查及类型检查/构建验证；没有进行真实模型端到端提交。

## 范围与后续

- 当前 AUTO 依据输入文本命中触发词，再按命中数和长度排序；项目阶段推荐等生产项目关联完成后再接入。
- 选择方式是单条消息状态。编辑时恢复原选择，重发沿用原模式，会话历史按消息 ID 恢复 Skill 来源、版本和理由。
- 该阶段不包含账户私有 Skill 安装、市场升级差异与回滚，也不包含 Skill 执行所需工具的授权。

## 变更文件

- `apps/web/src/components/agent/conversation.vue`
- `apps/web/src/components/agent/skillMenu.vue`
- `apps/web/src/components/agent/types.ts`
- `apps/server/src/agent/skills/index.ts`
- `apps/server/src/agent/runtime/index.ts`
- `apps/server/src/agent/runtime/sessions.ts`
- `apps/server/src/agent/runtime/types.ts`
- `apps/server/src/routes/agent.ts`
- `apps/server/src/routes/agent/skills/recommend.ts`
- `docs/superpowers/plans/agentSkillMarketplacePlan20261114.md`
