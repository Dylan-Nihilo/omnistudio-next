---
name: audioSubtitle
description: 为已采用画面编排对白、配音、环境声、音效和字幕时间码，并输出可追溯的音频与字幕版本。
metadata:
  version: 0.1.0
  stage: audioSubtitle
  productionStages:
    - audioSubtitle
  triggers: 配音、字幕、音效、对白时间码
  inputs: adoptedTakes, dialogues, timeline
  outputs: audioCues, subtitleTrack, audioMix
---

# 音频与字幕

## 前置条件

只处理已采用的视频或图片片段和已确认对白。未通过媒体 QA 的结果不能进入正式音频时间线。

## 对齐规则

保存对白、角色、音频文件、字幕文本和时间码之间的关系。对白原文保持不变，时长冲突进入问题列表，不通过加快语速静默解决。

## 交付规则

音频、字幕和混音都生成独立版本，保留模型、参数和来源引用。修改一条对白时只重算受影响的音频和字幕片段。
