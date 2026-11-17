# Skill 库与精选市场阶段验收报告

**日期：** 2026-11-14<br>
**分支：** `codex/enterprise-comic-p0`<br>
**验收范围：** 全局 Skill 源码清单、用户修改保护、固定版本第三方包安装，以及管理员精选市场 MVP。此结果不代表普通用户市场、账户私有范围或社区市场已完成。

## 结论

**通过本轮 MVP 验收。** 初次独立审查发现应用启动同步可能覆盖已有 Skill 副本；已为 Skill 初始化增加保留现有目录策略，并在隔离临时目录重测。新增源码 Skill 能补装，已有用户编辑在首次安装和源码版本变化后均保留。

## 实际验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 当前分支 | 通过 | `git branch --show-current` 返回 `codex/enterprise-comic-p0`；没有切换或操作 `master`。 |
| 八个阶段 Skill 源码化 | 通过 | 逐项比较 `data/skills` 与 `packages/skills`，八份 `SKILL.md` 内容一致；Server build 的 `build/skills` 含这八项。 |
| Skill 运行时加载 | 通过 | `loadSkillDirectory("build/skills")` 返回 10 项（`canvas`、`workflow` 和八个阶段 Skill），diagnostics 为空。 |
| 安装初始化保护 | 通过 | 隔离 source/target 演练中，被编辑的 `workflow` 在初次同步和源码版本变化后均保持原文；缺少的 `storyboard`、`canvas` 被补装。临时目录已清理。 |
| 第三方来源与归档 | 通过 | 下载 `shuohao-skills` v2.1.0 固定 commit `ef4ac0c313c7eeb1f918db5f0f0eb319745900bc` 的 ZIP，HTTP 200；项目 `skillZip` 和 `parseSkillManifest` 解析出六个 Skill 及 LICENSE、NOTICE。PAX tar.gz 会被当前解析器拒绝，因此目录固定使用 ZIP。 |
| 实际安装器流程 | 通过 | 使用临时数据目录及现有 `installRemotePlugin`：未登录返回 401，非 root 返回 403，root 安装六项成功，diagnostics 为 0，LICENSE/NOTICE 保留，同版本再次安装返回 409，不覆盖已有内容。临时目录已清理。 |
| 市场 API 与管理员页面 | 通过 | root 浏览器中的 `/api/skills/catalog/get` 返回 200；管理员「平台扩展 → 技能市场」可显示来源、许可证、固定 commit、六项技能及兼容限制，技能详情可展开。 |
| 类型检查 | 通过 | `apps/server` 与 `apps/web` 分别运行 `bun run typecheck`，均退出 0。 |
| 构建 | 通过 | `apps/server` 与 `apps/web` 分别运行 `bun run build`，均退出 0。Web 构建提示若干 chunk 超过 500 kB，但不影响本次构建成功。 |
| 差异格式 | 通过 | `git diff --check` 无输出。 |

仓库禁止新增测试文件；本轮使用了真实构建、隔离临时目录安装/初始化演练和 root 浏览器页面/API 检查，没有添加测试文件。

## 范围说明

- 当前精选市场放在 root 管理的「平台扩展 → 技能」，安装到全局目录，对所有用户可用。用户私有/工作区市场安装尚未实现。
- 目录只开放固定 `packageId`，不接受客户端任意 URL；市场安装不强制覆盖。检测到已有同名技能时显示部分安装状态并阻止整包覆盖。
- 目前没有版本差异、回滚、社区投稿、AUTO 推荐和生产项目 Agent 运行记录；这些按路线图后续开发。
- shuohao 的技能按 JSON/Markdown 文件产出，部分附带 Node 脚本。万象点点不会执行包内脚本，也尚未把它们映射到生产项目数据库。
