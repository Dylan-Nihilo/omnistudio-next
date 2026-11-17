---
name: delivery
description: 将已审核的画面、音频和字幕编排为可预览时间线，并生成带血缘记录的交付文件。
metadata:
  version: 0.1.0
  stage: delivery
  productionStages:
    - assembly
  triggers: 时间线、成片导出、MP4、SRT、封面、交付清单
  inputs: adoptedTakes, audioMix, subtitleTrack, deliverySpec
  outputs: timelineVersion, deliveryManifest
---

# 时间线与交付

## 前置条件

只接受已通过 QA 且已采用的媒体、音频和字幕版本。缺少依赖时返回明确的阻塞项，不生成不完整成片。

## 时间线

按镜头顺序保存画面轨、对白轨、环境声轨、音效轨和字幕轨。每个片段都记录来源任务、资产版本和采用版本。

## 输出

通过现有 FFmpeg 能力生成 MP4、SRT、封面和按平台规格裁切的版本。每次导出创建新的 deliveryManifest，不覆盖历史交付文件。
