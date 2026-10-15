# 龙族多集生产操作手册

## 0. 本次任务范围

- EP01：读取第一次完成报告，只补未完成节点，不重复提交已成功或运行中的任务。
- EP02、EP03：沿用已验收角色、场景、道具和关键帧，按连续剧情建立节点并验证完整流程。
- 图片固定：image2 / gpt-image-2 / 2K / 9:16。
- 视频固定：使用百炼 MiniMax H3 768P；当前适配器支持文生视频和单首帧图生视频，首次使用需用当前 API Key 做最小首帧请求验证权限。
- 多集复用素材必须进入素材库，并保留来源、版本和引用记录。

### 百炼视频通道核对

- 百炼平台整体支持图生视频，官方模型清单包含 `happyhorse-1.1-i2v`、`wan3.0-video`、`wan3.0-video-prime` 等模型；百炼 MiniMax H3 也支持首帧图生视频。
- `dashscopeVideo` 已接入 MiniMax H3 文生、首帧、尾帧、首尾帧和最多 9 张多图参考：分别发送 `first_frame`、`last_frame` 或互斥的 `image_url` 媒体项。公网 HTTP(S) 图片直接引用；工作区 Base64/二进制 PNG、JPEG、WebP、HEIC、HEIF（不超过 30 MB）会先通过百炼临时文件接口上传为 `oss://` 地址，并在视频请求中带 `X-DashScope-OssResourceResolve: enable`。
- 本仓库不再保留 MiniMax 官方直连适配器；当前只保留百炼供应商。适配器和平台目录统一使用公共百炼入口 `https://dashscope.aliyuncs.com/api/v1` 与 `DASHSCOPE_API_KEY`。
- 当前 Key 对历史专用 Workspace 视频地址返回 `Endpoint.AccessDenied`；公共百炼入口已实际返回 H3 任务并完成首帧验证，因此不再把旧 Workspace 地址作为默认配置。
- MiniMax H3 官方价格为 768P 0.07 美元/秒、2K 0.11 美元/秒；实际平台积分价格以当前价格簿和供应商账单为准，不能把其他百炼 I2V 模型的价格档直接套用。

百炼模型能力总览：[视频生成与编辑](https://help.aliyun.com/zh/model-studio/video-generate-edit-model/)；[MiniMax 视频生成 API](https://help.aliyun.com/en/model-studio/minimax-video-generation-api-reference)；[上传本地文件获取临时 URL](https://help.aliyun.com/en/model-studio/get-temporary-file-url)。

## 1. 每集开始前

1. 读取上一集报告和当前画布节点。
2. 标记节点为 succeeded、running、failed、missing；只处理 missing/failed 或报告明确要求补做的项。
3. 保存开始截图，至少包含：工作区、模型设置、余额或积分、素材库共享资产、成本台账初始行。
4. 记录开始时间、报告版本、脚本/镜头版本、当前余额。

截图命名建议：`ep01Start_YYYYMMDD-HHmm.png`、`ep02Start_YYYYMMDD-HHmm.png`、`ep03Start_YYYYMMDD-HHmm.png`。

## 2. 图片→视频端到端测试

1. 选一个镜头，确认参考图来自素材库中的已验收版本。
2. 用 image2 2K 生成关键帧，记录实际节点名、请求时间、状态和输出路径。
3. 将关键帧加入素材库并回读文件。
4. 用 minimax 768p 生成视频，记录时长、音频开关、参考顺序和供应商回执。
5. 回读视频并记录最终状态；只有有输出文件且参数核对通过才记为 succeeded。
6. 保存测试完成截图。

## 3. 多集素材库规则

共享角色、场景、道具、武器和音效都记录：assetId、名称、类型、版本、来源集/镜头、文件路径、模型参数、提示词版本、验收状态、可复用集数、依赖镜头、创建时间和验收人。

复用素材只记录引用事件，生成成本记 0；需要改动时建立新版本并保留旧版本。

## 4. 成本台账（每次调用一行）

| recordId | episodeId | stage | assetOrShotId | nodeName | requestTime | provider/model | mediaSpec | quantity | operationType | status | requestId | outputPath | balanceBefore/After | chargedAmount | errorMessage | evidence | notes |
|---|---|---|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|---|
| 待填写 | EP01/EP02/EP03 | 资产/图片/视频/测试 | 待填写 | 待填写 | 待填写 | image2 或 minimax | 2K 或 768p，9:16，时长/音频 | 待填写 | new/reuse/revise/retry | submitted/running/succeeded/failed | 待填写 | 待填写 | 待核实 | 待核实 | 失败时填原文 | 截图或回执 | 待填写 |
| i2v-20261015-01 | 验证 | 视频 | H3-wikimedia | dashscopeVideo | 2026-10-15 08:46（Asia/Shanghai） | 百炼 MiniMax/MiniMax-H3 | 768P，4 秒，首帧公网 URL | 1 | retry | failed | 2fe0add1-e963-996c-bf31-05921f2ddd61 | 无 | 待核实（预计 0） | 待核实 | `media url unreachable` | 百炼错误回执 | 改用百炼临时文件上传 |
| i2v-20261015-02 | 验证 | 视频 | H3-local-png | dashscopeVideo | 2026-10-15 08:48（Asia/Shanghai） | 百炼 MiniMax/MiniMax-H3 | 768P，4 秒，首帧 OSS 临时 URL | 1 | new | succeeded | 66dffedc-95be-9360-a012-d7621dee57c2 | 百炼返回 `output_aigc.mp4`（临时 URL） | 待核实 | 0.28 美元官方标价估算 | 任务 `ad8c62f3-54fd-43c9-bb5e-c0b86751ac35` | 本地 PNG 经临时文件接口上传 |
| i2v-20261015-03 | 验证 | 视频 | H3-last-frame | dashscopeVideo | 2026-10-15 09:15（Asia/Shanghai） | 百炼 MiniMax/MiniMax-H3 | 768P，4 秒，尾帧 OSS 临时 URL | 1 | new | succeeded | 0860a180-d47d-9be7-840f-daf54b733728 | 临时视频 URL（任务 `4ea65d56-538b-4760-a69a-c31a2e0131e2`） | 待核实 | 0.28 美元官方标价估算 | 任务查询回执 `76c7839e-b6fa-998f-b631-a4c4ef9ba813` | 尾帧字段实测通过 |
| i2v-20261015-04 | 验证 | 视频 | H3-multi-image | dashscopeVideo | 2026-10-15 09:15（Asia/Shanghai） | 百炼 MiniMax/MiniMax-H3 | 768P，4 秒，两张 `image_url` OSS 临时参考图 | 1 | new | succeeded | 74ff1f7e-16ce-9987-92e0-f4f141c085b1 | 临时视频 URL（任务 `59faab8d-4986-47f1-ae8f-c7c41db1cce4`） | 待核实 | 0.28 美元官方标价估算 | 任务查询回执 `0bc9b3d0-5a2b-93a2-96c1-5aae23b17fd5` | 多图字段实测通过 |
| i2v-20261015-05 | 验证 | 视频 | H3-first-last | dashscopeVideo | 2026-10-15 09:20（Asia/Shanghai） | 百炼 MiniMax/MiniMax-H3 | 768P，4 秒，首帧+尾帧 OSS 临时 URL | 1 | new | succeeded | 76ef122f-b48c-9815-99e4-384be3da02f4 | 临时视频 URL（任务 `313a28d3-a34f-4a2d-905c-e1eef4005433`） | 待核实 | 0.28 美元官方标价估算 | 任务查询回执 `2a9044e8-49ac-93e8-b446-6f70afdddf8` | 首尾帧字段实测通过 |

未知价格、余额或扣费统一写“待核实”，不估算成已发生费用。

### 已发生的线上探索请求（原工作区）

此前工作区盘点已记录 2 次 `openheapImage / gpt-image-2 / 2K / 9:16` 请求（1 次失败、1 次成功）和 1 次 `dashscopeVideo / minimax-h3 / 768P / 9:16 / 8 秒` 文本视频请求（成功）；工作区工具没有返回 requestId、余额前后或扣费回执，因此三笔费用均保留为“待核实”。

本轮百炼 Key 的最小首帧验证：Wikimedia 图片直传提交 `requestId=2fe0add1-e963-996c-bf31-05921f2ddd61`，任务 `f42c36e8-ed0b-45d1-a100-dd2bbaf63594` 因百炼侧无法访问该图片而失败，原始错误为 `content[1].image_url: media url unreachable`；随后将本地 PNG 上传为百炼临时 `oss://` 文件并提交，`requestId=66dffedc-95be-9360-a012-d7621dee57c2`，任务 `ad8c62f3-54fd-43c9-bb5e-c0b86751ac35` 最终 `SUCCEEDED`，返回 `output_aigc.mp4` 视频地址。成功任务按官方 768P 价格估算为 `4 秒 × 0.07 美元/秒 = 0.28 美元`，百炼接口未返回实际扣费或余额，实际金额待账单核实；失败请求预计未扣费，仍以账单为准。

## 5. 完成报告模板

### EP01

- 遗留节点：待填写
- 已成功输出：待填写
- 阻塞项：待填写
- 成本：待填写

### EP02

- 开始截图：待填写
- 端到端测试：待填写
- 节点和输出：待填写
- 复用素材：待填写
- 成本：待填写

### EP03

- 开始截图：待填写
- 端到端测试：待填写
- 节点和输出：待填写
- 复用素材：待填写
- 成本：待填写

### 百炼模型验证记录

- 当前线上模型目录：`dashscopeVideo / minimax-h3`，旧部署仍显示 `text`；本地适配器已增加 `singleImage`。
- MiniMax H3 图生视频：已用当前 `DASHSCOPE_API_KEY` 完成首帧、尾帧、首尾帧和两张多图参考的 768P、4 秒端到端验证。请求 ID、任务 ID 和失败重试已登记，实际余额/扣费仍待百炼账单核实。
- 百炼其他 I2V 模型：当前 Key 的模型目录查询未发现可用的 video/i2v/wan/happyhorse 模型，暂不新增模型。

## 6. 验收门槛

- 模型规格与台账一致。
- 输出文件可读取，状态与实际结果一致。
- 参考顺序正确，跨集素材可追溯。
- 成本台账与账户扣费或供应商回执一致；差额标记为待核实。
- 未把“已提交”写成“已完成”。

## 7. 本次任务截图索引

- EP01 续作开始：待生成
- EP01 续作完成：待生成
- EP02 开始：待生成
- EP02 端到端测试：待生成
- EP03 开始：待生成
- EP03 端到端测试：待生成
- 最终素材库与成本台账：待生成
