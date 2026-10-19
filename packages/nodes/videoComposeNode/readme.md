# 视频拼接 (videoComposeNode)

接收多个视频输入，按顺序拼接为一个完整的 MP4 视频。

## 端口说明

- 输入端口 `videos`：接收最多 32 个上游视频输出（`dataType: "VIDEO"`）。
- 输出端口 `video`：合成后的完整视频（`dataType: "VIDEO"`），可继续连入下游节点。

## 操作说明

1. 将上游视频节点的视频输出连入本节点的 `videos` 端口。
2. 在底部卡片中可拖拽调整片段顺序。
3. 点击“合成视频”按钮（或 AI 调用 `node:composeVideos`）启动合成。
4. 第一阶段使用现有 FFmpeg 的 concat 合成，要求各输入视频的分辨率、帧率与音频轨道格式兼容。
