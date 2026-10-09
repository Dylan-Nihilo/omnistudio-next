# @omnistudio-next/ui

omnistudio-next 自有 Vue UI 组件库。控件使用自己的 DOM、样式、状态与交互，不依赖 Element Plus、TDesign、XSender、Pinia、Axios 或业务接口。当前包含 44 个公开 Vue 组件；公共 TS 类型从包入口导出。

## 构建与引入

依赖准备与构建分别执行，不启动业务服务或同步 data/：

```sh
# 在 omnistudio-next-ui 工作树根目录，依赖已声明且锁定
bun install --frozen-lockfile --ignore-scripts
bun run --cwd packages/ui build
bun run --cwd apps/uiPreview build
bun run --cwd apps/uiPreview dev
```

`build` 输出 `dist/index.js`、`dist/index.css`、组件与公共 API 的 `.d.ts`。声明生成是构建的一部分，不新增测试或自定义检查入口。显式类型检查：在对应包执行 `./node_modules/.bin/vue-tsc --project tsconfig.json --noEmit`。

包 exports 在开发模式指向源文件，生产模式指向构建产物；类型始终指向声明文件。消费者构建前先构建 UI 包。Vue 为 peer dependency，保持同一个 Vue runtime。插件宿主后续应 externalize `@omnistudio-next/ui`，不将多个 UI runtime 打入不同插件。

```vue
<template>
  <uiThemeProvider mode="dark" accent="orange" :fontScale="100" :radius="8">
    <uiFeedbackProvider>
      <uiField label="项目名称" required>
        <template #default="{ id, required }">
          <uiInput :id="id" v-model="name" :required="required" clearable />
        </template>
      </uiField>
    </uiFeedbackProvider>
  </uiThemeProvider>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { uiThemeProvider, uiFeedbackProvider, uiField, uiInput } from "@omnistudio-next/ui";
import "@omnistudio-next/ui/styles";

const name = ref("");
</script>
```

基础样式限于 `.uiTheme`，不重置旧库、工作区或插件的全局样式。原生 modal 打开时仅额外锁定文档滚动。

## 组件分组

| 分组 | 组件 |
| --- | --- |
| 主题、操作与布局 | `uiThemeProvider`、`uiButton`、`uiIconButton`、`uiCard`、`uiEmpty` |
| 输入与选择 | `uiInput`、`uiTextarea`、`uiNumberInput`、`uiSelect`、`uiTagInput`、`uiCheckbox`、`uiCheckboxGroup`、`uiRadio`、`uiRadioGroup`、`uiSwitch`、`uiSlider`、`uiColorPicker` |
| 表单 | `uiField`、`uiForm`、`uiFormField`、`uiRuleForm` |
| 弹层 | `uiDialog`、`uiPopover`、`uiDropdown`、`uiTooltip`、`uiPopconfirm` |
| 状态与反馈 | `uiTag`、`uiBadge`、`uiAlert`、`uiProgress`、`uiSkeleton`、`uiLoading`、`uiFeedbackProvider` |
| 导航与数据 | `uiTabs`、`uiCollapse`、`uiPagination`、`uiTable`、`uiVirtualTable`、`uiTree`、`uiResizeBox` |
| 媒体与引导 | `uiImage`、`uiImageViewer`、`uiMediaPlayer`、`uiTour` |

布局类：`uiRow`、`uiStack`、`uiGrid`、`uiDivider`、`uiTextMuted`、`uiScrollArea`。普通容器、分隔、文本、链接等优先使用语义 HTML 与这些样式，不为旧库的每个标签创建无行为的包装。

## 核心合约

### 主题

`mode: dark | light | system`；`accent: orange | green`；`fontScale` 限制为 85–125，`radius` 限制为 0–16；非有限数字回退 100/8。`primaryColor` 接受六位 hex，生成 hover/pressed/soft、可读按钮文字及 focus 颜色。无效颜色回退预设。颜色、间距、密度、圆角、字体、阴影、层级和 reduced motion 由同一基础样式提供。

`createUiTheme(mode, accent, fontScale?, radius?, primaryColor?)` 返回 CSSProperties，不访问 Store 或持久化。默认黑橙、黑绿；浅色保留原中性兼容方案，不代表已完成新的浅色品牌设计。

### 基础控件

- `uiButton`：`variant` 为 primary/secondary/ghost/danger；`size` 为 small/medium/large；`htmlType` 为 button/submit/reset；`tag="a"` 时使用 `href`。loading 阻止重复操作，禁用链接移除 href。图标消费外部 Component，不绑定图标库。
- `uiIconButton`：必需 `label`，其他按钮属性通过 attrs 传入。
- `uiInput`：字符串/数字/null 输入显示；输出字符串；clear/change/focus/blur；暴露 focus/blur/select/clear/input。支持 prefix/suffix、showPassword、size。只读不等于禁用；IME 完成前不提交，完成只提交一次。
- `uiTextarea`：rows、resize、autosize（boolean 或 minRows/maxRows），同样保护 IME；暴露 focus/blur/select/textarea。支持原生 field-sizing，保留 ResizeObserver 回退。
- `uiNumberInput`：输出 number 或 undefined，不输出 NaN；min/max/step/precision/stepStrictly/controls/size；上下键与按钮步进。清空为 undefined；变化完成触发 change，blur 不重复触发已完成的 change。
- `uiSelect`：`options: UiOption[]`；值为 `UiValue | UiValue[] | null | undefined`，其中 UiValue 为 string/number/boolean。支持多选、过滤、创建、分组、清空、加载、禁用和键盘；暴露 focus/blur/open/close。清空单选为 undefined，多选为 []。父层维护选项来源和创建结果，不在库内写配置。
- `uiRadioGroup`：options、name、disabled；variant 可为 default/bordered/segmented，代替单独的 segmented 组件。布尔 false 和数字 0 都是有效值。
- `uiCheckboxGroup`：受控数组、options、max；不会原地修改传入数组。
- `uiTagInput`：受控字符串数组，Enter 添加、空输入 Backspace 移除；IME 不触发提交；去除重复值；readonly/disabled/max。
- `uiSlider` / `uiColorPicker`：原生 range/color，消费受控值。slider 支持上下界、step、marks、vertical/height 和 formatTooltip。颜色选择是 hex RGB，不承诺 alpha 编辑。
- `uiSwitch`：受控 boolean；disabled/loading 阻止重复切换。

### 表单

`uiField` 向默认 slot 提供 `id/describedBy/invalid/required`。调用方应将这些属性传入实际控件。帮助与错误通过 aria-describedby 关联；组合控件另提供 aria-label。

`uiForm` 消费 `model: Record<string, unknown>` 与 `rules: UiFormRules`，模型应为可 structuredClone、JSON 序列化的表单数据；不放入 DOM、Vue 实例或运行时引擎对象。`uiFormField` 用 prop 对应字段，消费 label/help/error/required，并提供 disabled。每个字段在一个表单中使用唯一 prop。

公共方法：`validate(): Promise<boolean>`、`validateField(fields, trigger?)`、`clearValidate(fields?)`、`resetFields()`。validate 成功为 true，失败 reject；错误保留在字段上。resetFields 恢复创建时的数据快照并修改传入 model，不保存设置。输入期间的异步旧结果不覆盖新错误；提交校验期间模型、字段或规则变更时拒绝旧结果。

校验复用已安装的 `async-validator`，保留 required/type/min/max/pattern/enum、同步/异步 validator 和 trigger 合约。不重写校验引擎。

`uiRuleForm` 消费 `rule: UiFieldRule[]`、v-model 值、可选 `v-model:api`，暴露 formData() 与上述表单方法。已支持本仓库实际字段类型：input/textarea/inputNumber/select/switch/checkbox/radio/slider/colorPicker/inputTag；input 的 type=textarea 使用自己的 textarea。control 支持显示与 required 的字符串字段引用及相等值条件。隐藏字段的值、false、0 保留，formData 返回克隆快照。

规则字段为唯一、安全的平级名称；未知类型、未知控制方法、重复或危险字段明确阻止校验，不静默丢字段。这不是 form-create 全部扩展能力的兼容层；未知插件规则在接入时继续使用隔离旧渲染器或补充适配，不因存在 uiRuleForm 就删除旧包或改 payload。

### 弹层

- `uiDialog`：原生 dialog 顶层，默认/header/footer slots（header 提供 titleId）；title、width、fullscreen、关闭选项、beforeClose(done)、destroyOnClose；opened/close/closed；暴露 close()。beforeClose 可异步，不调用 done 就保留弹窗；旧决定不关闭重新打开的实例。焦点恢复、嵌套 ESC、滚动锁和 KeepAlive 恢复由本层处理；不需要 appendToBody。不生成未请求的内部表单或说明。
- `uiPopover`：原生 popover 顶层 + Floating UI 定位；命名 v-model:visible；reference slot 提供 toggle/open/close/panelId/triggerAttrs；默认 slot 提供 close。click/hover/manual/contextmenu、placement、offset、width/matchWidth、title、disabled、HTMLElement/VirtualElement anchor；暴露 panel/reference/open/close/toggle。click/hover 使用原生 light dismiss；manual/contextmenu 由外部 pointerdown 关闭，保留锚点内部交互。标题/触发控件提供可访问名称；定位追踪滚动、尺寸和视口，滚轮/手势不泄漏到画布。
- `uiDropdown`：数据化 `UiMenuItem[]`，children 为嵌套菜单；command 发出 UiValue；支持点击/hover/manual、anchor 和键盘开闭、上下/Home/End/左右；reference slot 接收触发属性。hover 子菜单关闭后不会因焦点恢复立刻重开。
- `uiTooltip`：hover 与键盘焦点展示，自动关联实际触发控件的 aria-describedby，不覆盖已有描述。
- `uiPopconfirm`：title、按钮文案、danger、beforeConfirm；确认/取消是不同事件，关闭不冒充确认。异步决定不得确认已重新打开的实例。

需要浏览器具备 dialog、popover、inert、ResizeObserver 等现代能力。当前验证为 Chromium；不宣称已完成最低 macOS WebView 或 Windows WebView2 验收。旧库弹层混用、画布全局快捷键与嵌套插件弹层在实际接入阶段验证。

### 反馈服务

在同一应用的 uiFeedbackProvider 下使用 `useUiFeedback()`；应用工具函数可持有 `createUiFeedback()` 的实例并通过 provider 的 feedback prop 传入，不创建全局业务 Store。

```ts
const feedback = useUiFeedback();
const notice = feedback.notify({ title: "读取失败", message: "请检查工作目录", duration: 0 });
notice.update({ message: "请选择新的工作目录" });
notice.close();

try {
  await feedback.confirm("将从列表移除，不删除工作区文件。", "移除项目", {
    confirmButtonText: "移除",
    danger: true,
  });
  // The caller performs the authorized operation here.
} catch (error) {
  if (!isUiCancelledError(error)) throw error;
}
```

message/notify 返回 close/update；duration=0 保留，hover 暂停倒计时；VNode/渲染函数用于已有异步内容，字符串不作为 HTML 执行。清理计时器并且 onClose 只调用一次；高度变化由 CSS 堆叠，不需要旧 updateOffsets。

confirm/alert 返回 Promise<"confirm">；prompt 返回 `{ value, action: "confirm" }`。取消或关闭 reject UiCancelledError（reason 为 cancel/close），clear/unmount 清理未完成请求；队列顺序显示。prompt 支持 inputValue、inputPattern、异步 inputValidator、inputErrorMessage。无效输入保持弹窗并恢复焦点，旧异步结果不确认新请求。provider 将反馈定位到所属原生 modal，避免被自己的嵌套弹窗遮挡。

### 数据、内容与媒体

- `uiTabs`：options/v-model，tablist/tabpanel、左右/Home/End；默认 slot 的 value 决定业务内容，页面生命周期由调用方保持。
- `uiCollapse`：原生 details，items/v-model/accordion；slot 提供 item。
- `uiPagination`：v-model:currentPage、pageSize/total/pagerCount、disabled、hideOnSinglePage。
- `uiTable`：rows、columns、rowKey、height、loading/emptyText/label；原生表格；cell slot 或列 render 返回 VNode/文本。
- `uiVirtualTable`：相同数据模型，固定 rowHeight/headerHeight/height；TanStack 虚拟化；受限 DOM、上下/Home/End 与 scrollToIndex。滚动不改变数据/选择；动态行高不属于当前固定行实现。
- `uiResizeBox`：slot 提供 width/height，卸载断开观察器。
- `uiTree`：`UiTreeNode`（value/label/children/leaf/disabled/data），懒加载 load(node, signal)、过滤、键盘、受控 currentNodeKey 和拖拽规则。仅发出 nodeDrop，不移动文件或替用户修改树。禁止向自己或后代拖放。expand()/filter()/reload() 管理本地显示与缓存；目录切换由业务提供稳定 key/快照。defaultExpandAll 只展开已有子节点，不主动遍历所有目录。
- `uiImage` / `uiImageViewer`：alt、fit、原生 loading/error；多图切换、缩放、旋转、拖动、ESC。只展示传入资源，不获得、保存或撤销 URL。
- `uiMediaPlayer`：原生 audio/video + 自有播放、定位、音量、速度、全屏控件；播放失败抛给 error 事件；卸载停止媒体。资源与 Object URL 生命周期仍属于业务层。
- `uiTour`：target/title/description 步骤、v-model、current、完成/关闭事件；目标高亮、位置追踪。引导期间目标不可点击；不读写 localStorage 或启用原关闭入口。

多个 Vue 应用使用不同 ID 作用域，避免插件单选组和描述 ID 碰撞。SSR 如需采用本库应显式设置 app.config.idPrefix；当前交付不承诺完整 SSR 行为。

## 品牌资源与验收边界

当前新 Logo 为 `@omnistudio-next/assets/omniStudioNextLogo.svg`，来自 Downloads/omnistudio.svg，原文件字形、色值、viewBox 和 hash 保持不变。预览头部及媒体示例使用此资源；旧蓝色 PNG 仅作为历史设计资料保留。不要随强调色改变 Logo，也不修改包 identifier、scheme、原生安装图标或远端 Figma。

当前完成组件库包、类型与组件预览，不等于已替换 88 个业务 Vue 文件、149 个 Figma 业务组件族或验收 82 个应用状态。真实设置保存、文件队列、插件宿主、3D/画布/Agent 引擎和主应用仍保持原实现，后续按模块迁移。


- 表单输入、数字输入、选择器、滑杆和图片的 class/style 应用于组件根节点；原生输入所需 id、ARIA 与事件仍传到真实控件。
- `uiMediaPlayer` 透传 loadedmetadata/loadeddata，保留播放、暂停、定位、音量、速度、全屏与卸载清理。
- 反馈 message/notify 支持 grouping；相同类型、语气与消息合并为带重复次数的提示，持续时间重新计时。


- `uiNumberInput` 保留正在键入的草稿，避免上下界/精度回写打断逐字输入；模型值仍遵循数值规则，提交后格式化，父组件拒绝时恢复受控值。
- `uiCheckboxGroup` 支持 min/max 选择数量；达到边界时禁用对应增减选项，并在更新入口保护同一约束。
- UI 生产入口包含与开发样式入口相同的基础样式，打包产物具备主题字体、间距和控件尺寸变量。
