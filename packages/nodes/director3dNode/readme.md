# 3D 导演台

用文字生成场景、模型动画与运镜，再通过三维取景调整镜头，适合动作和镜头预演。人形角色使用内置低多边形关节人偶，布景与道具可使用基础几何体。

## 输入与输出

- 输入支持文本、图片和视频参考，用于描述或参考场景、动作与运镜。
- 关键帧可导出为 PNG 图片节点，选中的动画可导出为 MP4 视频节点。
- 导出前需要启用相应的图片或视频节点插件。

## 使用方法

首次打开导演台会显示操作引导，完成或关闭后不再自动显示。

1. 点击节点预览打开导演台，选择生成模型，描述场景、角色动作和镜头要求，点击“生成动画”。
2. 在动画列表中选择方案，从头预览对应动作和运镜，并查看该方案的输入提示词；通过播放按钮与进度条暂停或定位，可继续输入要求生成新方案。旧方案若未保存提示词，会明确提示缺少记录。
3. 点击三维画面进入取景，用鼠标调整朝向；WASD 移动，空格上升，Shift 下降，滚轮调焦。
4. 右键记录取景，或点击“添加关键帧”；关键帧可拖动排序、点击回看或删除，左键或 Esc 退出取景。
5. 记录关键帧后再次生成动画，可让运镜参考这些取景及其顺序。
6. 按需调整画面比例、网格、天空与光照，再导出关键帧图片或点击“导出视频节点”。

视频导出时保持当前窗口可见，完成后可在画布中新建的视频节点查看结果。

## AI 局部编辑

生成方案与普通文本节点统一调用 `ai.generate()`，通过 `tools` 传入私有 `readDocument` / `editDocument`，所选文本模型需要支持工具调用。每轮先复制选中方案作为草稿，AI 按需读取并局部修改场景、轨道和镜头，保留未修改内容；首次生成也通过同一组工具补齐草稿。工具循环与草稿均在节点侧，服务端只代理单次模型请求，不维护导演台会话。

内置 AI 的草稿工具不直接操作文件。外部 Agent 可使用下面的 MCP 入口，复用同一套草稿校验、渲染与保存逻辑。只有完整校验、预览渲染和保存均成功后才追加新方案；场景仍由所有方案共用。失败、取消或并发场景冲突时不会提交草稿。每次生成最多调用模型 40 次，模型与工具调用超过 10 分钟会取消。

## 低多边形关节人偶

在导演台“设置”中点击“添加人偶”，即可加入低多边形关节人偶并保存。人偶降低网格细分、不显示额外关节球，内部保留 16 个关节。也可直接要求 AI 使用内置人偶，无需重新拼装人体。

人偶身高约 1.8，原点在脚底，+Y 向上、+Z 朝前，左右按人偶自身，+X 是左。根物体的 position、rotation、scale 控制整体位置、朝向和大小；material.color 控制整个人偶的统一颜色，不同人物可使用不同整体颜色。

场景中的人偶只占一个 objectList 项：

```json
{
  "threeJsonId": "person1",
  "name": "人物",
  "objType": "mannequin",
  "geometry": {},
  "position": { "x": 0, "y": 0, "z": 0 },
  "material": { "type": "standard", "color": "#c8a878", "roughness": 0.7 },
  "pose": { "rightElbow": { "x": -1.2, "y": 0, "z": 0 } }
}
```

pose 可省略；默认零旋转为自然垂臂站姿。关节姿态使用相对父关节的 XYZ 欧拉角，单位为弧度。层级为 hips → spine → neck → head；spine 下有左右肩 → 肘 → 腕，hips 下有左右髋 → 膝 → 踝。肩部旋转会带动整条手臂，髋部旋转会带动整条腿。

可用关节名：hips、spine、neck、head、leftShoulder、leftElbow、leftWrist、rightShoulder、rightElbow、rightWrist、leftHip、leftKnee、leftAnkle、rightHip、rightKnee、rightAnkle。

人偶默认完整，可按要求添加 hiddenParts 数组，隐藏指定关节及其下游部位。例如 `"hiddenParts": ["leftShoulder", "rightKnee"]` 表示缺左臂和右小腿（含脚）。Shoulder 是整臂，Elbow 是前臂含手，Wrist 仅手；Hip 是整腿，Knee 是小腿含脚，Ankle 仅脚。使用对应的 left/right 关节名，左右按人偶自身。隐藏部位保留骨架名称，已有动画仍可使用。

动画的 objectId 始终指向人偶根 ID，用 joint 选择关节，帧只填写 rotation，保留固定骨长。例如弯曲右肘的轨道：

```json
{
  "objectId": "person1",
  "joint": "rightElbow",
  "frames": [
    { "time": 0, "rotation": { "x": 0, "y": 0, "z": 0 } },
    { "time": 1, "rotation": { "x": -1.2, "y": 0, "z": 0 } }
  ]
}
```

省略 joint 的轨道控制整体移动、旋转或缩放，可与关节轨道同时使用；根轨道的 position、scale 可省略，保持基础模型的变换。所有轨道仍需满足方案时长和关键帧格式。

## MCP操作

通过画布的 `getNodeTools` 查询本节点，再由 `nodeTools` 调用：

- `node:getDirectorState`：读取场景摘要、方案历史、锚点、光照和当前 `revision`。
- `node:readDirectorDocument`：读取 `scene`、`plan`、`history` 或 `schema`；支持 `objectId`、`joint` 和 `path` 定位。
- `node:editDirectorDocument`：携带最新 `revision` 批量编辑场景/方案。第一次需在同一批次提供完整场景和完整方案；实际渲染与保存成功后新增方案，旧方案保留。
- `node:setDirectorView`：携带最新 `revision` 选择方案、设置锚点、光照及网格/天空可见性。
- `node:exportDirectorImage`：按 `anchorId`、可选 `time` 和 `aspect` 导出PNG到画布，返回真实节点及文件路径。
- `node:exportDirectorVideo`：导出当前方案的本地MP4预演。要求页面可见、浏览器支持MP4；MCP导出方案不超过90秒。

先查询 `schema` 再构造编辑参数。编辑通过 `operations` 完成，整份场景或方案使用 `path: []`、`op: "replace"`，局部修改优先按稳定物体ID定位。批次必须完整合法，校验失败不会保存。旧 `revision` 会被拒绝，需重新读取当前状态。

修改共享场景会影响历史方案的基础模型；删除物体会清除其对应的历史轨道。不要将历史方案误当作独立场景快照。

取景锚点的 `camera.position` 是相机位置，`controls.target` 是视线目标；不是角色站位。角度 `fov` 为视角，关节旋转单位为弧度。

上述MCP编辑与本地导出不调用生成模型。节点界面的AI设计请求仍按应用正常计费。导出错误会返回失败，不应以请求已发出认定素材生成成功。
