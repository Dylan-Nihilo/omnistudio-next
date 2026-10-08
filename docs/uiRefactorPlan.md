# Toonflow 全盘自有 UI 重构规划

本规划将项目所有可控的可见 UI 迁移到自有 Vue 组件、Token 和基础样式体系。不是给 Element Plus 换颜色，也不是给旧组件套一层薄包装；原业务规则、后端服务、存储格式、工作区文件和关键生命周期保持不变。

当前基础 UI 包已完成封装：独立工作树 `toonflowUi`（`uiRefactor` 分支）中，`packages/ui` 提供 44 个公开组件、主题、反馈与表单 API、CSS 与类型声明；`apps/uiPreview` 提供五类完整预览。入口/首页及首批设置内容已开始实际迁移；当前进展见 [UI 迁移断点](uiMigration/progress.md)。原生平台及旧插件兼容继续在接入阶段验证。主工作区的未提交 `AGENTS.md`、设计资料、应用源码和运行数据保持原样。

## 盘点依据

- 当前代码基线：`ec8f54597bf6e6114ed56b832f9052cd6f735311`，2026-10-05 重新检查。
- 实际源码文件、导入关系、模板控件、关键调用链是工程范围的依据。
- [文件盘点](uiRefactorInventory.json) 记录全部 UI 源文件、行数、依赖、风险标记、保护边界与拟迁移阶段。静态正则标记只用于发现线索，不等于运行行为验证。
- [原界面盘点](uiInventory20260930/inventory.json) 的 82 项状态作为初始功能验收清单，不能替代新增启动错误页、插件兼容及真实尺寸检查。
- Figma 文件 `zJMnhlJ5Kvs4SIM6uG13d1`、[设计覆盖索引](figmaStyleV3/componentCoverage.json) 与 [设计终验](figmaStyleV3/completionAudit.json) 是视觉参考。149 个设计组件族不等于要新增 149 个 Vue 基础组件。

## 重构目标和范围

### 最终形态

1. 自有 UI 负责控件 DOM、布局、皮肤、状态与交互行为，颜色不是唯一改动。
2. 自有组件统一小驼峰名称，例如 `uiButton.vue`、`uiDialog.vue`、`uiFormField.vue`；模板使用 `<uiButton />`，保持仓库规范。
3. 基础库只依赖 Vue 和必要的平台能力，不依赖 Pinia、Axios、后端、工作区目录或项目 Store。
4. 业务页面继续调用原方法和 Store，使用新的视图结构与自有组件。只在实际复用或可读性收益明确时抽取业务组件，不搭建额外 controller/service 层。
5. Element Plus、TDesign Chat 和 XSender 不再承担已迁移的自有业务界面渲染。旧库可以为尚未迁移模块或外部插件提供暂时兼容，但不是完成目标的替代品。
6. Vue Flow、Tiptap、Three.js、虚拟化、流解析、Markdown 解析等功能引擎保留。自有 UI 不等于重造画布、文本编辑器、3D 或消息引擎。

### 明确不改

- Server 路由、方法、参数、响应结构、认证与权限规则。
- `toonflowCanvas`、`toonflowAgent`、节点 ID、端口、会话与项目数据格式。
- 工作目录快照、文件读写封装、保存队列、错误传播、取消和回滚。
- MCP 工具名、参数、界面控制注册及流式事件协议。
- 关闭的 Agent/A2A 入口、付费模型调用、真实支付与插件安装授权。
- 应用 identifier、`toonflow://` scheme、数据目录、安装与更新协议。
- 第三方托管登录和 OS 文件/权限对话框的实现；只改我们的宿主与确认 UI。

## 实际代码规模

当前存在 3 个页面路由 `/hello`、`/home`、`/workspace`；`/` 和 `/canvas` 为重定向。设置、节点编辑器、Agent 和文档切换并不是独立路由，不能按路由数量估算工作量。

| 模块 | Vue 文件数 | 主要职责 |
| --- | ---: | --- |
| 全局与共享组件 | 3 | App、模型选择、更新说明 |
| 入口和首页 | 5 | 引导、项目网格/列表、工作目录选择、背景 |
| 设置与业务弹窗 | 29 | 10 类设置、供应商/模型、插件、开发工具、账户 |
| 工作区外壳 | 3 | 面板切换、项目菜单、浮动/停靠 Agent |
| 画布界面 | 12 | Vue Flow 宿主、菜单、搜索、分组、选择、素材库 |
| 文档界面 | 2 | Tiptap 编辑器、文件树 |
| Agent 界面 | 10 | 消息、输入、引用、附件、历史、工具 UI |
| Markdown 内容组件 | 2 | 流式 Markdown、工作区图片 |
| 节点公共 UI | 7 | 节点外壳、提示词、引用、播放器、历史、错误 |
| 有源码的节点 | 13 | 7 类内置节点；其中 3D 导演台包含多个界面文件 |
| 工具卡片 UI | 2 | 提问表单、节点聚焦卡片 |
| **合计** | **88** | 不包括额外的 TS 业务/宿主、样式和原生边界文件 |

另外盘点了 2 个独立 CSS/SCSS 源文件和 53 个直接影响 UI 或应保护的业务/平台边界文件。Vue 中的样式与逻辑同时存在，不因它属于 UI 文件就整体重写脚本。

静态发现 57 种 `el-*` 模板标签，79 个 UI 源文件使用 Element Plus 的导入或标签；这不是全仓库依赖引用总数。TDesign 的直接 UI 使用涉及 4 个文件，XSender 涉及 2 个文件，规则表单的可见使用涉及 5 个文件。

### 主要代码入口

| 范围 | 核心路径 |
| --- | --- |
| 启动与主题 | `apps/web/src/main.ts`、`App.vue`、`assets/main.scss`、`stores/settings.ts` |
| 引导与项目 | `apps/web/src/pages/hello/`、`pages/home/` |
| 全设置 | `apps/web/src/components/settings/` |
| 工作区 | `apps/web/src/pages/workspace/index.vue`、`components/` |
| 画布 | `apps/web/src/pages/workspace/panels/canvas/` |
| 文档 | `apps/web/src/pages/workspace/panels/document/` |
| Agent | `apps/web/src/components/agent/`、`modelPopover.vue`、Markdown 组件 |
| 节点公共层 | `packages/nodeScaffold/src/` |
| 节点内容 | `packages/nodes/*/src/` |
| 工具客户端 | `packages/tools/askUser/src/questionCard.vue`、`packages/tools/canvas/src/nodeFocusCard.vue` |
| 插件 UI 宿主 | `packages/nodeScaffold/index.ts`、`packages/toolScaffold/index.ts`、`packages/toolScaffold/src/client.ts` |
| 原生和安装边界 | `apps/desktop/`、`packages/startup/`、`electrobun.config.ts` |

高耦合大文件包括 `agent/conversation.vue`（1169 行）、`pluginMarket/index.vue`（1153 行）、`canvas/index.vue`（965 行）、`document/index.vue`（867 行）、`sceneEditor.vue`（833 行）、`nodeSkeleton.vue`（692 行）。不以拆文件为完成标准，按可见子界面和原调用链逐块迁移。

## 隔离工作区和包结构

已采用同仓库 Git worktree，而不是复制一个失去历史的项目：

```text
projects/
  Toonflow-app/             当前主工作区
  toonflowUi/               已创建的独立工作树，uiRefactor 分支
    packages/ui/            @toonflow/ui
      src/
        components/         自有基础交互组件
        styles/             Token、基础与布局样式
        theme.ts            主题配置的公共入口
        index.ts            仅导出真正使用的组件/API
    apps/uiPreview/          基于已有 Vite/Vue 的组件预览
    apps/web/                逐模块接入新 UI 的同一应用
```

- 工作树基于当前 HEAD；主目录未提交设计文件不会自动出现。只拷贝已审核设计资料、品牌资产和当前 `AGENTS.md`，不批量复制仓库运行数据。
- 不把主目录 `data/`、`node_modules/`、`build/`、环境文件或凭据链接到新树。依赖准备单独执行，不能隐式绑定到检查或开发命令。
- UI 预览先不连接业务后端，不加载真实设置，不伪造模型回复。展示控件和已有任务的界面状态，事件由预览自身消费。
- 应用接入验证使用新树的独立端口及临时配置/工作区。不得把浏览器页面指向主服务或复用主数据目录来省事。
- 独立工作树和两个新包已创建；依赖已在新树独立准备。当前只运行 UI 预览，不启动业务 Server、插件构建或桌面端。

## 自有 UI 库的边界

### Token 和基础样式

维护一份语义 Token 来源，覆盖 background、surface、text、border、action、state、媒体类型、间距、圆角、控件尺寸、阴影、层级和动效时间。颜色采用黑橙默认、绿色备选；颜色选择与深浅模式分开，蓝色品牌图像不随强调色漂移。

控件采用 32/36/40px 的密度层级，正文/标签/标题建立统一尺度。字体方案需明确本地 fallback 和可分发许可，不从 Figma 或系统目录擅自复制字体。延续项目 `fontScale`（85–125%）和圆角偏好，不以固定 px 的新样式破坏现有设置。

`uiThemeProvider` 或同等最小入口接收受控配置，不直接读写用户设置。实际保存仍由原 App/Store 完成。旧 `--el-*` 与 `--td-*` 只在未迁移模块或兼容岛桥接；终态自有界面使用自己的语义变量。

基础样式管理排版、布局、焦点、滚动条和 reduced motion。迁移期限定样式作用域，避免新全局选择器污染旧组件和插件。

### 组件分组

| 组 | 必要自有实现 |
| --- | --- |
| 操作与状态 | button、iconButton、badge、tag、alert、progress、skeleton |
| 输入与选择 | input、textarea、numberInput、select、checkbox、radio、switch、slider、colorPicker、tagInput |
| 表单 | formField、form，校验状态和现有规则合约适配 |
| 弹层 | dialog、popover、dropdown、tooltip、popconfirm、tour |
| 数据与导航 | tabs、segmented、tree、table/virtualTable、pagination、collapse |
| 内容与媒体 | image/imageViewer、视频/音频 UI；资源取得和释放仍由原业务封装负责 |
| 命令式 UI | message、notification、confirm、prompt；Promise 和取消语义与原调用方一致 |

这是能力分组，不承诺一个旧标签对应一个新 Vue 文件。`el-text`、`el-space`、容器等能用语义 HTML 和样式表达的部分，不新增无价值包装组件。

自有组件使用 Vue 与标准 HTML/DOM 实现，不以 Element Plus 重着色充当交付。优先平台 `<dialog>`/popover 能力，但必须实际解决焦点恢复、嵌套弹层、ESC、点击外部、滚动锁、IME 和门户位置。不要假定平台能力天然覆盖现有嵌套工作流，也不自行新增未经请求的组件库依赖。

### API 和行为合约

- 对现有控件逐项登记 `props / slots / emits / v-model / exposed methods`，再替换模板。
- 保留 loading/disabled/readonly 的区别；暂停期间不允许重复提交、重命名或移除。
- numberInput 保留整数、精度、上下界和空值规则；select 保留实际用到的 filterable、allowCreate、clearable、分组能力。
- 消息与通知支持异步内容、关闭清理、偏移更新及现有生命周期。
- confirm/prompt 取消不得被当成成功；保存失败仍允许用户保留输入并重试。
- 表单字段不硬编码模型能力，视频音频可选性及 durationResolutionMap 联动沿用原逻辑。

## 两个不能绕过的兼容迁移

### 规则表单

`components/settings/formCreate.ts` 注册了 Element Plus 的 Form/FormItem/Input/Select 等组件；供应商、插件配置和 `askUser/questionCard.vue` 通过其 Api 调用 `validate()`、`formData()`、规则复制、required 与条件控制。

先登记内置字段类型（input、textarea、inputNumber、select、switch、checkbox 等）与条件/校验合约，构建自有控件适配入口。禁止更改已安装插件的 `configRules` 格式、Agent 问题 schema 或保存 payload 来迁就新 UI。

外部规则可能超出内置样例。迁移验证通过前保留隔离旧渲染器；无法支持的规则必须明确显示与处理，不能悄悄丢字段。最后再决定 form-create 驱动如何退出或保留其纯规则引擎，不先卸依赖。

### 动态节点和工具插件

节点构建将 `element-plus` 外部化为 `toonflowNodeHost.elementPlus`；工具客户端使用 `toonflowToolHost.elementPlus` 和 `toonflowToolHost.formCreate`。它们是已编译插件的运行合约，不是可随意删除的组件 import。

新 UI 建立宿主导出 `ui`，并在构建器声明新的 UI runtime 外部引用。先迁移本仓库可构建的节点与工具，再核验已有插件的全局导出、缓存、版本、CSS 注入和工具 renderer 注册。不能把自有 UI 打包进每个插件，产生多份弹层服务、样式与状态单例。

核心业务可完全不用旧 UI；旧插件的兼容宿主是否长期保留由实际插件和可获得源码决定。兼容岛不是自己的 UI 实现，也不能据此宣称外部插件内部布局已经改写。

## 全盘迁移阶段

所有实施先在独立树进行。每阶段只接入对应范围，必要验证通过后继续下一阶段，不做一次性替换所有标签或全局依赖卸载。

| 阶段 | 工作 | 关键验收 |
| --- | --- | --- |
| 0 隔离基线 | 工作树、资料、独立端口/临时数据、控件行为登记 | 主工作区未提交内容和实际数据未改变 |
| 1 基础 UI | Token、base、自有控件、弹层、通知、表单能力、组件预览 | 自有 DOM/交互，状态一致；键盘、IME、长文本和嵌套弹层可用 |
| 2 入口和首页 | 引导、背景、品牌、目录选择、项目网格/列表、启动失败页 | 项目新增/打开/移除语义不变，长路径省略，初始窗口适配 |
| 3 设置和规则表单 | 十类面板及供应商、模型、插件、账户、记忆、开发工具 | 字段/校验/条件显示/payload/保存队列不变；关闭入口不开放 |
| 4 工作区外壳 | 顶栏、面板切换、浮动/停靠 Agent、菜单 | 切面板和离开项目仍先保存；失败不丢数据；MCP 正常注册 |
| 5 画布可视层 | 搜索、素材库、工具栏、分组、选择、节点菜单、连线反馈 | 拖拽、缩放、复制/粘贴、撤销、端口与输入事件互不干扰 |
| 6 公共节点和内容 | nodeSkeleton、引用、输入、播放器、历史、错误及七类源码节点 | UMD 与 UI host 正确；生成取消/回滚/文件释放不改变；3D 操作不被输入控件吞掉 |
| 7 文档编辑 | 自有文件树、工具栏、格式菜单、图片/表格弹层 | Tiptap 命令、Markdown 文件格式、保存和切换工作区仍可靠 |
| 8 Agent 和工具 UI | 自有消息/推理/输入、附件、引用、模型/技能菜单、工具卡片 | 流式与停止/重发不变；虚拟化锚点与草稿不丢；工具问题表单正确提交 |
| 9 兼容和全盘验收 | 旧插件、原生边界、旧依赖清理、全 UI 对照 | 82 状态及启动扩展清单通过；未解决例外不得标全盘完成 |

文档与部分业务弹窗可在依赖条件明确后并行准备，但实际界面迁移按调用链验收，不把并行改动混成难以判断的数据回归。

## 各模块必须保护的链路

- **首页**：空目录要求、独占创建画布文件、目录规范化、项目列表持久化、移除列表不删除文件、提示词交接到 Agent。
- **设置**：用户已有 theme/primaryColor/fontScale/radius、自动保存队列、供应商版本与文件 revision、必填校验、保存失败保留输入。
- **工作区**：`provide("canvas")`、引用来源、面板激活、`flushSave()`、`onBeforeRouteLeave`、切目录后的 AbortController 取消。
- **画布**：Vue Flow 实例与 viewport、node ID/type、数据端口、nodrag/nopan/nowheel、键盘捕获/冒泡次序、历史事务、工具注册。
- **节点**：公共 exports、远程节点 UMD 加载、按需预览、生成与取消、历史选择、临时资源清理和字幕/视频原生媒体行为。
- **文档**：画布文本节点与文档的 read/save bridge、handleId、保存/取消、KeepAlive 与目录 key，编辑器数据不得因样式切换重置。
- **Agent**：消息 ID、streaming/reasoning 内容、动态测高、保留编辑/工具表单行、切面板滚动恢复、附件与引用编码、请求停止和重发。
- **工具 UI**：renderer URL 与内容版本、工具名、callId、answer/values/skipped 请求结构和 pending 状态。
- **系统边界**：页面 mounted/failed 与 desktopReady，安装确认，原生另存为，更新 source/check/download/apply 和退出交接。

## 设计到工程的差异处理

1. **真实窗口**：桌面初始最多 1280×960，屏幕较小时更小。1280×960 为主验收，1600 宽为宽屏参考，1024×768 为窄窗口回退；不照搬 Figma 绝对坐标，也不把移动端产品新增到本次范围。
2. **长数据**：项目名、目录、模型 ID、供应商名、引用路径采用明确截断/换行/完整查看规则。Figma 短示例不能充当长内容通过证据。
3. **视觉状态与业务状态**：基础控件七类状态只是外观；打开中项目操作禁用、模型音频 optional、时长/分辨率依赖等由原控制逻辑决定。
4. **基础库不绑定业务**：目录读取、模型选择、付款订单与文件 URL 都留在原业务层，库只消费 props 和发出交互事件。
5. **主题和身份**：新默认视觉与已保存用户配置分别处理。显示 Logo/名称可迁移，不顺便更改包标识、scheme 或数据目录。
6. **外部界面**：TF-Router iframe 和系统面板保持真实边界；不为了“全部自有”伪造认证或支付，或改写系统交互。

## 源码缺口和需要裁定的终态

### 成片合成节点

仓库存在 `build/nodes/assemblyNode.umd.js`，但没有 `packages/nodes/assemblyNode/` 的对应源码。这一点阻止该节点内部 UI 的源码级重构，不阻止基础库建设。

需要获得源码，或明确它属于暂时保留的外部插件。没有源码时只可按合约支持其宿主与 Token，不反编译修改产物来冒充完成。也不能未经授权重写其合成业务逻辑。

### 外部旧插件

“自有代码全部改为自己的 UI”和“删除整个宿主的 Element Plus”不是同一件事。后者可能破坏仍在使用旧合约的插件。全部删除旧宿主前必须有迁移/兼容证据；如需替换或停用用户已有插件，另行明确动作与影响。

### 规则覆盖

内置表单类型可由源码盘点，但未知插件字段不能仅靠内置示例断言兼容。阶段 3 先建立能力清单；不支持项保留明确兼容岛，终验时单列，不遮掩为已完成。

## 验证和切换

- 不新增任何测试文件、测试框架或临时测试封装，不新增自定义自动检查入口。
- 手动执行项目已有的 TypeScript/Vite 检查与构建；新增包使用已有工具显式检查自己的项目配置。依赖准备、运行与检查分开。
- 先验证组件预览中的键盘/焦点/IME/状态，再验证接入模块的真实流程；不以库构建成功代替业务功能验收。
- 实际文件和配置验证使用隔离临时目录，检查保存、失败、切换、取消和重新加载。不得覆盖主 `data/settings.json` 或用户工作区。
- 不默认发起付费模型生成、真实支付、插件安装、A2A 调用或生产发布；这些验证需要覆盖实际动作和影响的授权。
- `dev:plugins`、桌面 dev 与插件 watch 会同步 `data/`；只在隔离树指定临时数据后执行。根 `build:nodes` 会清空生成目录，必须先核实并保护无源码的外部产物，不把生成目录当源码改。
- 使用原 82 项状态，加启动失败/WebView2、窄窗口、字体 125%、长名称、保存失败、老插件和动态表单作为全盘验收清单。
- 主工作区替换只带入已验证的本地代码变更；不同步运行数据、凭据、缓存或生成产物。阶段失败回退代码，不回滚用户业务数据。

## 当前实施进展

接续 Pi 线程 `01a10a96-6593-75fe-baa6-8da8cbca3c11`。该线程后续已明确授权在独立树重建自有 UI；Figma 终验中的 `implementationAuthorized: false` 仅记录此前设计阶段的边界，不是后续实施授权的状态。

阶段 0 的独立工作树与组件预览已建立。本节首批记录保留为历史断点；当前 44 组件完整包、API 合约与验收证据以 [组件库说明](../packages/ui/readme.md) 和 [覆盖清单](uiLibraryCoverage.json) 为准。基础库封装不等于全盘业务 UI 重构完成。

### 首批组件与合约

| 入口 | 已实现能力 |
| --- | --- |
| `uiThemeProvider` / `createUiTheme` | 黑橙默认、黑绿备选、既有浅色兼容、跟随系统；字体 85–125%、圆角 0–16px；非有限数字回退默认值，不读写 Store 或用户设置 |
| `uiButton` | 原生按钮、链接、四类视觉、三种尺寸、禁用、loading、图标；禁用链接不保留 href |
| `uiInput` | 受控值、前后插槽、清空、只读/禁用/错误；`focus/blur/select/clear`；IME 未完成不提交、完成只提交一次，清空同步触发 change |
| `uiTextarea` | 原生文本域、行数/resize、只读/禁用/错误；`focus/blur/select`；同样保护 IME |
| `uiCheckbox` / `uiSwitch` | 原生 checkbox 键盘行为；受控值回读；半选状态、禁用样式与可见焦点 |
| `uiField` | label 与控件 ID 关联，帮助/错误描述关联；向 slot 提供 `id/describedBy/invalid/required`，调用方传入实际控件 |
| `uiDialog` | 原生 modal 顶层、标题与 footer slot、宽度与内部滚动；ESC/遮罩关闭控制、beforeClose、destroyOnClose、opened/close/closed；嵌套焦点恢复、页面滚动锁；旧异步关闭决定不影响后续重新打开的弹窗 |

Token 与 base 不依赖 Element Plus。浅色使用原有设计的中性强调色，不把它宣称为已完成的浅色橙绿设计；浅色次要文字为可读性调整至 `#70695f`。用户已保存的任意自定义 primaryColor 桥接尚未接入。

组件预览中弹窗仅提供外壳与关闭操作，没有伪造项目创建、模型回复、保存结果或后端请求。预览字段仅为已有组件展示，不读取真实 API Key。

### 实际验证

在独立树显式执行，未新增任何测试文件、测试框架或自动检查入口：

```sh
cd packages/ui
./node_modules/.bin/vue-tsc --project tsconfig.json --noEmit
bun run build
cd ../../apps/uiPreview
./node_modules/.bin/vue-tsc --project tsconfig.json --noEmit
bun run build
```

- 两个包的类型检查和 Vite 构建均通过。原断点的根目录 `bunx --no-install vue-tsc` 找不到 workspace 局部 binary；改用各包已安装的 binary。样式公共入口补充了独立类型声明，解决 TS2882。
- Chromium 浏览器验证通过：空格切换、焦点、必填语义、清空/禁用/loading、中文 composition 事件、只读保护、受控半选/开关和禁用链接。
- 主题验证使用控件实际渲染颜色，不只检查 CSS 变量；系统深浅切换、reduced motion、1280×960 与 1024×768/125% 字体通过，后者无横向溢出。
- 弹窗验证通过：ESC 与遮罩、嵌套焦点与仅关闭顶层、内部向外拖动不误关、禁止关闭、异步 beforeClose、销毁与解锁、长标题/长内容滚动、重新打开后不被旧确认误关。
- 深色次要文字/输入背景对比度 5.18；橙/绿主按钮文字对比度 6.50/14.08；浅色次要文字对比度 4.72。禁用控件不计入普通文字对比度判定。
- 已导出并查看 [组件预览](uiRefactorPreviews/baseControls.png)、[绿色](uiRefactorPreviews/greenControls.png)、[浅色兼容](uiRefactorPreviews/lightControls.png)、[窄窗口与大字体](uiRefactorPreviews/narrowFont125.png)、[弹窗外壳](uiRefactorPreviews/dialogShell.png) 和 [长弹窗](uiRefactorPreviews/longDialogFont125.png)。截图等待主题实际完成切换，避免把过渡中间色当成最终状态。
- 浏览器检查未产生页面异常或业务 `/api/` 请求。Figma 在线截图回读返回 `fetch failed`；本轮使用已导出的本地设计参考，没有修改远端设计。

预览启动：在独立树执行 `bun run --cwd apps/uiPreview dev`，使用独立端口 `127.0.0.1:5175`。不隐式安装依赖或启动业务后端。

### 下一断点与真实缺口

基础库已封装，入口/首页已经迁移并按高窗口反馈重新分配留白；首批设置面板迁移中，下一断点见 `docs/uiMigration/progress.md`。规则表单、插件宿主、已有自定义主题兼容仍按前述计划推进；本轮没有删除旧 UI 依赖或批量改写 88 个 Vue 文件。

当前验证限于基础组件与 Chromium；没有运行 macOS 桌面 WebView、Windows WebView2、真实业务保存流程或完整 82 状态验收。原生 dialog 与旧库弹层混用还需在接入模块时验证。组件库包已完成必要的 Chromium 与构建验证；不得据此宣称应用迁移或全平台上线验收完成。

主工作区未提交内容与应用源码保持原样；新树已有 `AGENTS.md` 和 `packages/mcp/src/stdio.ts` mode 改动保留。新树 bun.lock 仅增加 UI 功能引擎与预览所需 workspace 依赖，冻结锁定安装已通过；不修改凭据、Pi Fast 配置或用户数据。

### 本轮完整组件库与新 Logo

- 44 个组件通过包名导入；生产入口为 JS/CSS/d.ts，开发使用源码条件导出。不封装或继续依赖旧 UI 的 DOM。
- 5 类预览：基础控件、选择与表单、弹层与反馈、数据与导航、媒体与引导。已验证键盘/IME、异步校验、条件字段、取消、虚拟化、树加载、图片与音频等；完整证据与未验证项见覆盖清单。
- 已修复多 Vue 应用的单选组 ID 碰撞、子菜单焦点与关闭后立即重开、旧异步校验/关闭决定、消息计时器清理等实际问题。
- 新 Logo 从 `Downloads/omnistudio.svg` 原样保存到 `packages/assets/omniStudioLogo.svg`，SHA-256 为 `27d488f65cde06f7e7fbad5ba56671b8c632bae7f6962b73d9b1d49441988bf6`。预览头部与媒体示例均已切换，448×160 viewBox 保持；头部显示为 168×60。绿色/浅色模式不改变 SVG 色值，浅色用暗底保证原字标可读。
- 新字标为「万象点点 · OmniStudio」；预览标题采用中性的“组件库”，没有顺带改应用 identifier、scheme、原生图标或业务显示名称。旧蓝色 PNG 与设计终验属于历史资料，保留但不再作为当前预览 Logo。
- 本轮没有修改远端 Figma、真实设置、工作区文件或主应用页面。未知插件规则明确阻止提交，完整旧插件适配、原生平台与真实业务流程仍需下一阶段验证。
