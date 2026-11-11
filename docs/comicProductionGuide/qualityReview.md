# 《雨灯》成片技术与内容质检

## 验收对象

- 成片：`deliverables/rainyLight.mp4`
- 剪辑工程：工作区 `rainyLightGuide/assets/videoEditor/timeline.json`
- 剪辑归档：`e256391b-b293-44f0-8965-15d86b40370f`
- SHA-256：`9b71dc814b01ed23a9ced733e7c68c02520fac7950611dbceb3a3e62c7290c0d`
- 文件大小：1,020,052 bytes
- 复核工具：仓库内 FFmpeg / FFprobe；全片解码、EBU R128/true peak 测量及关键帧抽查。

## 技术结果

| 项目              | 实测结果                                                            | 判定                                 |
| ----------------- | ------------------------------------------------------------------- | ------------------------------------ |
| 容器              | MP4，两个媒体流                                                     | 通过                                 |
| 画面              | H.264 High，yuv420p，608×1080，24 fps，132 帧，5.500 秒             | 可播放；并非 1080×1920               |
| 声音              | AAC-LC，48 kHz，双声道，约 141 kb/s                                 | 通过                                 |
| 全片解码          | `ffmpeg -v error -i rainyLight.mp4 -f null -` 退出码 0，无解码错误  | 通过                                 |
| EBU R128 综合响度 | -23.3 LUFS；响度范围 2.0 LU                                         | 测量完成，低于 -16 LUFS 网络视频目标 |
| True peak         | -1.2 dBFS                                                           | 符合不高于 -1 dBTP 的发布保护线      |
| 视频源            | Seedance 成片 496×864、24 fps，约 4.04 秒；剪辑工程设置 1080 高输出 | 输出上采样，细节受源分辨率限制       |

导出设置选择 9:16、24 fps、1080 高度、Standard。实现按竖屏比例计算偶数宽度，故文件实际画幅为 **608×1080**，比例约 9:16；不能描述成 1080×1920 原生画质。原始 AI 视频为 496×864，也未达到竖屏 1080p 源素材。

片段测量曾尝试以恒定增益靠近 -16 LUFS。原片测得 -30.1 LUFS、真峰值 -10.5 dBTP；在最大增益与峰值限制下界面提示预计只能到 -20.6 LUFS。实际混音导出后全片综合值为 -23.3 LUFS、true peak -1.2 dBFS。这里报告整片实测值，不把片段校准目标当作最终母带结果。最后约 1.5 秒没有环境音，画面与标题继续淡出。

## 画面与字幕

- 全片联系表：[contactSheet.jpg](deliverables/contactSheet.jpg)，含 0.5 秒采样画面及末帧。
- 交叉淡化抽帧：[transitionFrame.jpg](deliverables/transitionFrame.jpg)，3.75 秒处能同时看到动态视频与静态尾卡。
- 开场字幕抽帧：[subtitleFrame.jpg](deliverables/subtitleFrame.jpg)。
- 片尾抽帧：[finalFrame.jpg](deliverables/finalFrame.jpg)。
- 3.75 秒复核确认片尾标题“雨灯”和第二句字幕“照亮回家的路。”同时可见。工程将标题放在独立文字轨；同轨较晚开始的画面或文字片段会覆盖此前活动片段，应将重叠显示的标题、字幕放到不同轨。
- 动态片段抽样能看到机器人和小猫在雨巷中的动作变化，角色外观与场景总体连续。该约 4 秒生成镜头及 5.5 秒剪辑片不能证明“送猫回到屋檐”的故事结局已完整呈现；这是教学短样片，不是完整漫剧集。
- V2 已从当前剪辑工程重新导出侧车字幕。`rainyLight.srt` 与 `rainyLight.vtt` 中两句字幕分别为 0–2 秒、2–4 秒，标题“雨灯”为 3.5–5.5 秒，与 MP4 画面时间一致。MP4 内的文字亦已烧录；3.75 秒抽帧确认标题和第二句字幕同时可见。

## 交付判断

**技术文件：通过。教学样片：可审阅，附带限制。完整漫剧交付：未通过本次验收范围。** 文件有效、完整解码，画面字幕、片尾标题、转场和同步的 SRT/VTT 已核验；但本次不是完整剧集，源画面经上采样，综合响度低于 -16 LUFS，尾部约 1.5 秒无环境音。如目标平台要求 -16 LUFS，应在后续混音中调整后重新测量整片。

## 证据文件

- `deliverables/mediaQuality.json`：FFprobe 视频与音频流信息。
- `deliverables/audioQuality.txt`：EBU R128 综合响度、范围及 true peak 输出。
- `deliverables/contactSheet.jpg`、`transitionFrame.jpg`、`subtitleFrame.jpg`、`finalFrame.jpg`：抽帧目视证据。
- `deliverables/rainyLight.srt`、`deliverables/rainyLight.vtt`：从 v2 工程导出的字幕，标题时间码为 3.5–5.5 秒，与 MP4 同步。
