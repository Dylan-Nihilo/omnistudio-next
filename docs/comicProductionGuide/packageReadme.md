# 漫剧生产项目操作指南与演示工程

## 最新生产项目手册：《最后一封信》

1. 打开 `productionProjectGuide.html`，从产品主页开始按 41 步完成生产项目创建、剧本与资产生成、分镜视频、剪辑台调音、导出和登记；每步附应用截图或媒体检查图。
2. 最终演示成片为 `deliverables/lastLetter.mp4`（V02）：6.60 秒，1920×1080、30 fps、H.264/AAC。FFprobe、全片解码、黑场、字幕抽帧和 EBU R128 检查通过；`deliverables/lastLetterMediaQuality.json` 记录 V02 指标并保留 V01 问题历史。
3. V02 已登记到项目审片，当前仍为“待审片”，尚未人工批准或正式交付。演示费用按《雨灯》76.034483 积分与《最后一封信》228.001585 积分计，合计 304.036068 积分，约人民币 30.40 元，低于已授权的 50 元上限。
4. `deliverables/lastLetterContact.jpg` 是从 V02 抽取的关键帧接触表；`deliverables/lastLetterNarrative.srt` 是与 V02 6.60 秒片尾同步的配套字幕。

以下《雨灯》内容是此前单独完成的画布生产演示，保留作历史参考；其审批与交付记录不能代表《最后一封信》的状态。

---

# 《雨灯》图文指南与演示工程

## 阅读顺序

1. 双击 `index.html` 打开逐步指南，包含 44 个实际操作步骤（步骤 02–45）及对应截图；截图可点击放大，支持关键词搜索。步骤 01 图只说明剪辑工程入口，来源为旧工程，不作为《雨灯》操作证据。
2. 打开 `features.html` 阅读 23 章功能参考与支持范围。两份 HTML 均可离线阅读，不依赖外部字体或脚本。
3. 播放 `deliverables/rainyLight.mp4`，对照 `rainyLight.srt`、`rainyLight.vtt` 与 `qualityReview.md`。
4. 查看 `productionRecord.md`、`deliverables/costRecord.json` 和 `deliverables/deliveryReceipt.json` 复核制作、费用与交付证据。

## 工程与素材

- `deliverables/rainyLightProject.json`：V2 登记时的原始剪辑工程快照，保持原始素材路径与来源字段。
- `deliverables/rainyLightManifest.json`：平台登记时生成的原始 manifest，保持文件字节不变。里面的 `status: review` 是登记时状态；当前审批/交付状态见 `deliveryReceipt.json` 与指南步骤 43。
- `deliverables/sourceAssets/`：便于迁移的文件副本，内含 `assets/videoEditor/timeline.json` 和三个媒体文件。仅把媒体引用路径改为包内可用的小驼峰文件名，剪辑参数保持与归档工程一致。原始工程快照没有被此副本替换。
- `deliverables/practice.edl`：专业修剪练习中的受限 CMX3600 交换文件，不包含主样片的文字、混音或转场。
- `deliverables/rainyLightV1Export.srt`：保留的 V1 字幕快照，片名时间为 4–6 秒；不要与最终 V2 的 SRT/VTT 混用。
- `deliverables/rainyAmbience.wav`：从本次生成视频分离的环境声，并非额外生成或系统内“一键分离音频”的产物。

本机原工作区 `rainyLightGuide` 和生产项目“雨灯 · 操作指南演示”保留，可直接在原系统继续编辑和审片。

跨机器迁移时，先完整解压；由应用正常创建/注册一个独立工作区后，在关闭该工作区编辑窗口的情况下，将 `sourceAssets` 内的 `assets` 文件夹复制到这个新工作区。不要覆盖已有生产工程。打开该工作区的默认剪辑工程后检查三项媒体是否可读取，必要时使用“重新链接”。文件副本不包含账户、生产项目审批或数据库任务记录，也不构成一键工程导入功能。此包的路径与素材哈希已核对；跨机器重开未在本轮验收。

## 实测结果与边界

本次实际走完的是：新画布 → 原创剧本/分镜 → 关键图/动态视频生成 → 剪辑 → 导出 → V1 退回 → V2 审片批准并交付 → 成片回写画布。另以独立工程演示专业修剪、恒速、轨道锁定、EDL 与恢复。

最终视频为 5.5 秒教学短样片，608×1080、24 fps、H.264/AAC；源视频为 496×864。不是完整漫剧集或原生竖屏 1080p。全片响度 -23.3 LUFS、true peak -1.2 dBTP，末尾约 1.5 秒无环境音。详细证据见 `qualityReview.md`。

平台按任务结算与流水逐项对账，35 个任务共扣除 76.034483 积分：文本 1.034483、图片 3、视频 72，两次失败视频均为 0。按本次约定的 10 积分/元折算约人民币 7.60 元，低于 50 元预算。这是本轮用户侧积分结算，不代表所有模型或未来生成的固定报价。

完整特效库、速度曲线、专业 EQ/降噪/自动闪避、整片动态响度标准化、长时高分辨率压力与跨平台部署，未在本次完成验收。支持范围以功能参考为准。
