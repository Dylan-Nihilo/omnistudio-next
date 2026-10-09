<div align="center">

# OmniStudio

### 让灵感，落成作品。

**万象点点 · AI 漫剧与视频创作工作台**

把故事、分镜、素材和生成流程，放进同一张创作画布。

<img src="packages/assets/illustrations/heroInk.png" alt="OmniStudio 黑橙水墨创作视觉" width="640" />

[开始使用](#开始使用) · [本地开发](#本地开发) · [开发文档](#开发文档) · [问题反馈](https://github.com/Dylan-Nihilo/omnistudio-next/issues)

</div>

---

OmniStudio 面向漫剧、短片和视频创作者。你可以先写下一句构想，也可以带着已有剧本和素材开始：整理文本，搭建分镜，连接生成节点，再逐步调整画面与镜头。

当前代码库为 **OmniStudio Next**，仓库与应用包标识使用 `omnistudio-next`。

## 从构想到镜头

**构想与剧本 → 分镜与参考素材 → 图片与视频生成 → 预览、调整与复用**

- **一张画布，串起创作。** 使用文本、图片、视频、音频素材节点，组织参考内容与生成结果；通过连线表达节点之间的关系。
- **Agent 与你一起推进。** 在项目中讨论剧本与镜头，调用画布、素材和工作区工具；对话与项目文件一起保留。
- **模型由平台统一配置。** 管理员配置文本、图片与视频 API、启用模型及积分价格，创作者直接选择可用模型。
- **镜头可以反复打磨。** 预览素材与生成历史，使用 3D 导演节点探索构图、机位和运动，再继续生成与编辑。
- **个人创作，也能团队协作。** 项目与资产默认属于个人；需要协作时，主动把共享副本上传到团队空间。
- **连接你的工作流。** 通过 MCP 与 A2A 接入外部 Agent；节点、工具与技能沿用独立的扩展包接口。

## 创作属于你，协作由你选择

| 身份与空间 | 可以做什么 |
| --- | --- |
| 个人账户 | 独立保存项目、素材、对话、偏好与积分；使用平台开放的模型和工具 |
| 团队 owner | 创建团队后自动成为 owner，管理团队成员与共享资产 |
| 团队成员 | 浏览、下载和主动上传共享副本；个人原件保留，团队不自动收集生成内容 |
| root 管理员 | 平台唯一的管理角色，配置 API、模型、价格、用户、积分与全局扩展 |

积分属于个人，团队不持有公共钱包。**划转只允许在同一团队的当前成员之间进行**；生成与 Agent 调用使用调用者自己的积分。

项目内容保存在工作目录中。调用外部模型时，相应的提示词与参考素材会发送给所配置的 API 提供方。

## 开始使用

1. **建立账户。** 首次运行由维护者初始化 root；完成后，创作者可以注册自己的账户。
2. **准备创作能力。** root 在平台管理中配置 API 凭据、启用模型并发布积分价格，为用户发放积分。
3. **打开项目。** 创建或导入工作目录，整理剧本、文档与素材，在画布中添加需要的节点。
4. **逐步生成与调整。** 选择模型，提供提示词和参考素材，检查结果，再继续下一次创作。
5. **按需共享。** 创建或加入团队，把需要协作的资产上传为团队副本。

平台不提供默认管理员账号或密码。部署环境首次初始化需要数据目录中的 `rootSetupToken`；本机开发入口与桌面本机入口无需该凭据。

## 本地开发

准备 **Bun 1.3.14** 和 **MySQL 8.0+**。每个环境使用独立数据库，数据库账户需要有该库的建表、迁移与读写权限。

```sh
git clone https://github.com/Dylan-Nihilo/omnistudio-next.git
cd omnistudio-next
bun install --frozen-lockfile --ignore-scripts
cp -n .env.example .env
```

编辑 `.env`，将 `DATABASE_URL` 指向已经创建的独立 MySQL 数据库。示例文件中的密码为占位内容，需要替换；数据库密码中的 URL 特殊字符需要编码。

| 配置项 | 用途 |
| --- | --- |
| `DATABASE_URL` | MySQL 连接地址，包含账户、密码、主机、端口与数据库名 |
| `PORT` | 后端端口，默认 `3000` |
| `OMNISTUDIO_NEXT_UI_SERVER_ORIGIN` | Web 开发代理的后端地址，默认 `http://127.0.0.1:3000` |
| `OMNISTUDIO_NEXT_DATA_DIR` | 可选数据目录；未设置时使用仓库根目录 `data/` |

在开发工作区构建自有组件与内置插件，再启动 Web 和 Server。`dev:plugins` 会覆盖开发数据目录中的同名节点与工具，请把修改保存在 `packages/` 源码中：

```sh
bun run build:ui
bun run dev:plugins
bun run dev
```

打开 **http://127.0.0.1:5173**。后端会在启动时检查连接并执行数据库迁移；同一数据库只允许一个应用实例。修改后端端口时，同步修改 Web 代理地址。

已有 `.env` 和项目数据时，保留原配置，不要再次执行覆盖复制。数据库凭据、平台密钥、`data/` 与备份目录均不提交 Git。

### 构建与检查

桌面类型检查需要先准备 Electrobun SDK `.hutch/devkit`，macOS 桌面构建还需要对应架构的启动库；准备步骤见 [贡献指南](CONTRIBUTING.md)。完成环境准备后执行：

```sh
bun run build
bun run typecheck
```

`build` 构建 UI、工具、Web 和 Server。独立服务完整构建还包含内置节点：

```sh
bun run build:server
bun run start:server
```

开发 Server 与构建后的 Server 选一个运行，避免使用同一数据库启动两个实例。桌面宿主使用 Electrobun，复用相同的业务 Server。

### Docker

仓库提供应用与 MySQL 的 Compose 配置。复制并编辑 `.env`，为 `MYSQL_PASSWORD` 和 `MYSQL_ROOT_PASSWORD` 设置不同的长随机密码，再执行：

```sh
docker compose up -d --build
```

应用默认映射到 **http://127.0.0.1:3000**；MySQL 仅在 Compose 内网开放，数据库与项目数据使用持久化卷。

首次打开页面后，部署环境会生成管理员初始化凭据。维护者可在自己的终端读取：

```sh
docker compose exec omnistudio-next cat /app/data/rootSetupToken
```

该凭据只用于首次初始化，不作为日常登录密码。Compose 提供本机运行入口；公网部署需要另行适配反向代理，并验证 HTTPS、会话与请求来源校验。升级前备份数据目录和数据库。

## 项目结构

| 目录 | 职责 |
| --- | --- |
| `apps/web` | Vue 创作工作台：账户、团队、画布、文档与 Agent |
| `apps/server` | Bun / Express API、MySQL 认证与计费、文件与生成服务 |
| `apps/desktop` | Electrobun 桌面宿主、安装与更新 |
| `apps/uiPreview` | 自有 UI 组件预览 |
| `packages/ui` | 黑橙主题、自有组件与交互 |
| `packages/nodes` | 文本、素材、生成与 3D 导演节点 |
| `packages/tools`、`packages/skills` | Agent 工具与工作流技能 |
| `packages/providers` | 模型供应商适配器 |
| `packages/mcp` | MCP 服务、CLI 与集成说明 |

Web 使用 Vue 3、Vite、Pinia 与 Vue Flow；后端使用 TypeScript、Express、Drizzle ORM 与 MySQL。Web 和桌面复用同一套应用服务与组件库。

## 开发文档

- [贡献指南](CONTRIBUTING.md)：环境准备、开发与构建流程。
- [仓库规范](AGENTS.md)：命名、组件、路由与文件操作约定。
- [自有组件库](packages/ui/readme.md)：主题、控件、表单与弹层合约。
- [MCP 集成](packages/mcp/README.md)：外部 Agent 的接入方式。
- [用户与团队设计](docs/userSystemDesign.md)：个人空间、权限、资产共享与积分划转。
- [用户体系验收](docs/userSystemReport.md)：实现范围、运行证据与验证边界。

已有画布、会话、节点和工具包中的 `toonflow*` 数据格式标记继续兼容。历史研究和设计文档保留产生时的上下文，当前入口与行为以本 README 和源码为准。

## 开源与致谢

OmniStudio Next 基于 [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) 开发，保留原项目的 MIT 版权声明。许可证见 [LICENSE](LICENSE)。

欢迎通过 [Issues](https://github.com/Dylan-Nihilo/omnistudio-next/issues) 提交可复现的问题和功能建议。
