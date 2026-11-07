# 生产项目题材库：来源、提示词与配图核查

核查日期：2026-11-05。适用范围：生产项目与首页共用的题材选择器。

本文区分三类证据：会话前序的实际界面观察、本轮直接 HTTP 读取的公开资料、我方原创扩展。产品功能说明不等于效果实测；搜索命中不等于适合商业使用；图片许可不等于人物肖像或品牌背书授权。

## 题材分类的出处

### RunningHub：13 项界面观察

- 页面：[RunningHub TV 创作入口](https://rhtv.runninghub.cn/projects)。
- 证据：前序会话实际点击“题材设定”，观察到“主题材 / 融合题材”两个入口与 13 个选项。本轮沿用此前记录，不将本轮 HTTP 读取当作重新实操。
- 名称：默认题材、仙侠修真、玄幻高武、都市爽文逆袭、都市情感豪门、青春校园、古言婚恋、宫斗宅斗权谋、悬疑刑侦推理、灵异民俗怪谈、末世灾变生存、科幻赛博未来、无限系统副本。
- 我方用途：分类名称和主/融合题材交互参考，对应代码来源标记 `runninghubObserved`。
- 边界：没有验证这些选项的市场热度、转化率或生成效果，没有获取其内部 Agent 提示词。默认题材属于自由创作入口，严格说不是一个叙事题材。

### 我方原创扩展：12 项

武侠江湖、历史架空、女性成长、家庭治愈、都市职场、喜剧日常、热血竞技、萌宠奇遇、星际机甲、奇幻冒险、年代创业、穿越重生。

这些是面向我方创作场景整理的常见叙事方向，对应 `originalCuration`，不冒称来自某家产品的实际分类，也不表示具有已验证的市场排名。

## 多产品公开资料：本轮实际 HTTP 读取

### Toonflow

- 准确标题：**Toonflow｜开源 AI 短剧、漫剧与视频创作平台**。
- [GitHub 项目页](https://github.com/HBAI-Ltd/Toonflow-app)；[本轮读取的 README 原文](https://raw.githubusercontent.com/HBAI-Ltd/Toonflow-app/master/README.md)。
- 实际读取到的说明：“通过无限画布编写剧本与分镜、管理角色和场景素材、生成图片与视频”；“开放提示词、工具和 A2A，支持自定义 Agent 行为及外部协作”。
- 与本次的关系：提示词内容应该能延伸到剧本、角色/场景资产和镜头生成，而不是只作为题材标签；题材与视觉风格应分别表达叙事约束和画面约束。
- 证据边界：本轮 README 没有提供一份与我方 25 项一一对应的题材分类。本次未读取或复用其实际 Agent 系统提示词，未把其仓库示例图片作为我方素材下载。

### Vidu

- HTTP 页面标题：**Vidu AI - Vidu AI - 全球领先的AI内容生产平台**。
- [官方公开首页](https://www.vidu.cn/)。
- 实际读取到：参考生视频、图生视频、文生视频、参考生图、文生图片与 Vidu Agent 等入口。公开首页示例用一名橄榄球员演示主体一致性、10 秒时长、16:9、0–3 / 3–7 / 7–10 秒镜头安排、声音，以及不新增队员/字幕的约束。
- 与本次的关系：我方画面提示词可借鉴“主体身份约束 → 场景/行动 → 构图/镜头 → 光线/情绪 → 排除项”的结构；后续视频阶段另加时间分段和声音。
- 证据边界：这是公开展示的示例文本，不是 Vidu 内部隐藏提示词，不证明该示例在我方模型上有相同效果。首页没有提供可供核实的漫剧题材分类表，本次不从用户评价或宣传语推断题材能力排名。

### 即梦 AI

- HTTP 页面标题：**即梦AI - 即刻造梦**。
- [官方公开首页](https://jimeng.jianying.com/)。
- 实际读取到：文生图、视频生成、短剧工作室、智能画布；公开说明包含文/图生视频、运镜与速度控制等。
- 与本次的关系：题材、视觉风格、素材参考与视频表现应是不同维度；可以借鉴其创作入口清楚分工的方式。
- 证据边界：本轮没有登录进入短剧工作室，没有核实其内部题材菜单、阶段流转或内部提示词；首页文本也没有出现可核实的完整题材分类表。

## 提示词归属和使用边界

本库的 `storyPrompt`、`imagePrompt`、`negativePrompt` 均为我方根据题材特点原创编写，**不是上述产品的官方或隐藏提示词**。

- `storyPrompt`：限定开场事件、人物目标、阻碍、因果推进、题材规则、分集钩子与输出结构；模板变量为 `{{story}}` 和 `{{episodeCount}}`。
- `imagePrompt`：描述题材代表性场景、人物关系、动作和构图；视觉风格由独立的风格选择决定，不以题材强制覆盖风格。
- `negativePrompt`：提醒规避题材中的逻辑缺陷、无铺垫反转、规则漂移及不合适的表现。这些文字约束是否生效仍取决于实际模型和调用方式。
- 融合题材是附加创作约束，不代表能无条件将两段完整提示词拼接并得到一致结果。

最终题材卡片图已在后续阶段通过 Open302 生成，状态和费用记录见文末“当前配图状态”。本节的开放许可图仅用于候选图源研究，不作为最终题材卡片，也不应与原创生成素材混淆。

题材模板展示、保存到草稿以及真正参与 Agent/出图请求是不同能力。实现/验收应分别记录，不因页面能看到提示词就宣称创作和生成链路已经全部接通。

## 图片调研方法与限制

实际读取过 Wikimedia Commons 的公开 `imageinfo` / `extmetadata` API，以及 Cleveland Museum of Art 官方开放数据 API，用于候选许可研究；这些候选不作为最终产品素材。题材卡片现已使用对应题材的原创生成图。

- [Cleveland Museum of Art Open Access](https://www.clevelandart.org/open-access)：本轮通过 `https://openaccess-api.clevelandart.org/api/artworks/` 读取作品数据，以下 Cleveland 候选均返回 `share_license_status: CC0`。
- [Wikimedia Commons 复用说明](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)：以每张图片的源页和许可元数据为准，不能将整个站点视为同一种许可。
- [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)；[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。使用 CC BY 4.0 时应保留作者、作品链接、许可证并注明改动。

Commons 连续查询曾返回非 JSON 响应；本轮改为间隔查询，没有绕过登录或安全校验。Unsplash 直接 API 请求遇到 401/浏览器校验，本轮没有绕过，也未采用无法核验的直接结果。Commons 上的早期 Unsplash/Pixabay 作品单独按其历史许可元数据核查，不能推导现在两个平台的所有图片仍是 CC0。

## 25 个题材的候选图源

以下列表仅作为开放许可图片研究候选，不再用作生产项目题材卡片素材。用户明确要求改为原创生成图后，已从代码和静态资源中移除此前下载的候选。历史画、静物和普通场景即使许可允许，也不等于适合漫剧商业展示。

1. **默认题材**：《Laptop picture with notepad》，Eric Bailey，CC0。[作品页](https://commons.wikimedia.org/wiki/File:Laptop_picture_with_notepad.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/0/06/Laptop_picture_with_notepad.jpg/500px-Laptop_picture_with_notepad.jpg)。桌面写作氛围。
2. **仙侠修真**：《Landscape after Guo Zhongshu》，八大山人，CC0。[作品页](https://clevelandart.org/art/1955.36)；[候选图](https://openaccess-cdn.clevelandart.org/1955.36/1955.36_web.jpg)。传统山水，没有仙侠角色。
3. **玄幻高武**：《Dragon》，牧溪，CC0。[作品页](https://clevelandart.org/art/1958.427.1)；[候选图](https://openaccess-cdn.clevelandart.org/1958.427.1/1958.427.1_web.jpg)。龙形象象征，非现代高武战斗图。
4. **都市爽文逆袭**：《London - Flickr - Pierre Blaché (1)》，Pierre Blaché，CC0。[作品页](https://commons.wikimedia.org/wiki/File:London_-_Flickr_-_Pierre_Blach%C3%A9_(1).jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/London_-_Flickr_-_Pierre_Blach%C3%A9_%281%29.jpg/500px-London_-_Flickr_-_Pierre_Blach%C3%A9_%281%29.jpg)。城市日出，没有逆袭人物情节。
5. **都市情感豪门**：《Two golden wedding rings》，Rgaudin，CC0。[作品页](https://commons.wikimedia.org/wiki/File:Two_golden_wedding_rings.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/Two_golden_wedding_rings.jpg/500px-Two_golden_wedding_rings.jpg)。仅婚恋象征。
6. **青春校园**：《South China University of Technology Building No 12》，LPS.1，CC0。[作品页](https://commons.wikimedia.org/wiki/File:South_China_University_of_Technology_Building_No_12.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9d/South_China_University_of_Technology_Building_No_12.jpg/500px-South_China_University_of_Technology_Building_No_12.jpg)。校园建筑。
7. **古言婚恋**：《Seguici d'un casament xinès》，佚名，Public Domain。[作品页](https://commons.wikimedia.org/wiki/File:BMVB_-_an%C3%B2nim_-_Seguici_d%27un_casament_xin%C3%A8s_-_9417.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e4/BMVB_-_an%C3%B2nim_-_Seguici_d%27un_casament_xin%C3%A8s_-_9417.jpg/500px-BMVB_-_an%C3%B2nim_-_Seguici_d%27un_casament_xin%C3%A8s_-_9417.jpg)。中国传统婚礼行列画。
8. **宫斗宅斗权谋**：《In the Palace》，周文矩，CC0。[作品页](https://clevelandart.org/art/1976.1)；[候选图](https://openaccess-cdn.clevelandart.org/1976.1/1976.1_web.jpg)。宫廷生活人物画，不可把原画解释为已描绘宫斗剧情。
9. **悬疑刑侦推理**：《Magnifying Glass MET 255262》，Louis Comfort Tiffany / Tiffany Studios，CC0。[作品页](https://commons.wikimedia.org/wiki/File:Magnifying_Glass_MET_255262.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Magnifying_Glass_MET_255262.jpg/500px-Magnifying_Glass_MET_255262.jpg)。放大镜物件，仅象征推理。
10. **灵异民俗怪谈**：《Zhong Kui Supported by Ghosts》，罗聘，CC0。[作品页](https://clevelandart.org/art/1959.185)；[候选图](https://openaccess-cdn.clevelandart.org/1959.185/1959.185_web.jpg)。传统钟馗志怪画。
11. **末世灾变生存**：《Chernobyl nuclear disaster aftermath abandoned town of Pripyat 02》，Hnapel，CC0。[作品页](https://commons.wikimedia.org/wiki/File:Chernobyl_nuclear_disaster_aftermath_abandoned_town_of_Pripyat_02.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Chernobyl_nuclear_disaster_aftermath_abandoned_town_of_Pripyat_02.jpg/500px-Chernobyl_nuclear_disaster_aftermath_abandoned_town_of_Pripyat_02.jpg)。真实灾难后的废城，不得标称为我方生成成片。
12. **科幻赛博未来**：《HEXAGONIA》，Mike Winkelmann，CC BY 4.0。[作品页](https://commons.wikimedia.org/wiki/File:HEXAGONIA.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/HEXAGONIA.jpg/500px-HEXAGONIA.jpg)。源说明提到人物衣服有无政府主义符号，必须视觉审查后决定是否采用。
13. **无限系统副本**：《Stone Labyrinth at Nose Hill Park》，Bawolff，CC BY 4.0。[作品页](https://commons.wikimedia.org/wiki/File:Stone_Labyrinth_at_Nose_Hill_Park.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fc/Stone_Labyrinth_at_Nose_Hill_Park.jpg/500px-Stone_Labyrinth_at_Nose_Hill_Park.jpg)。石头迷宫只提供象征，不是系统副本插画。
14. **武侠江湖**：没有直接推荐的现代武侠成品图。安全备选《The Sword Spring, Tiger Hill》，沈周，CC0。[作品页](https://clevelandart.org/art/1964.371.6)；[候选图](https://openaccess-cdn.clevelandart.org/1964.371.6/1964.371.6_web.jpg)。实际是剑泉山水，未描绘剑客。另有 Commons《Painting Chinese swordsmanship》标 CC0，但作者和原始创作背景不足，不推荐直接采用。
15. **历史架空**：《Palace Ladies》，仇英，CC0。[作品页](https://clevelandart.org/art/1954.369)；[候选图](https://openaccess-cdn.clevelandart.org/1954.369/1954.369_web.jpg)。古装群像氛围。
16. **女性成长**：没有同时确认题材语义、人物商业展示权和许可完整性的直接成品图。Commons《Woman walks through wood doors (Unsplash)》Dan Gold 标 CC0，但模特授权及可识别性未核实，不推荐据此承诺可商用。[研究源页](https://commons.wikimedia.org/wiki/File:Woman_walks_through_wood_doors_(Unsplash).jpg)。优先原创生图。
17. **家庭治愈**：《Dinner home cooked meal》，Kurt Kaiser，CC0。[作品页](https://commons.wikimedia.org/wiki/File:Dinner_home_cooked_meal.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3f/Dinner_home_cooked_meal.jpg/500px-Dinner_home_cooked_meal.jpg)。家常饭菜静物，仅提供家庭氛围。
18. **都市职场**：《Office interior 2022 queue》，Rakoon，CC0。[作品页](https://commons.wikimedia.org/wiki/File:Office_interior_2022_queue.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/9/95/Office_interior_2022_queue.jpg/500px-Office_interior_2022_queue.jpg)。办公空间，需审查商标和屏幕信息。
19. **喜剧日常**：《Children at Play》，夏葵，CC0。[作品页](https://clevelandart.org/art/1915.110)；[候选图](https://openaccess-cdn.clevelandart.org/1915.110/1915.110_web.jpg)。传统儿童游戏画，只代表轻松日常氛围。
20. **热血竞技**：《Peak to Peak Charter School soccer field and running track, Lafayette, Colorado, USA - 2025》，Mikepascoe，CC0。[作品页](https://commons.wikimedia.org/wiki/File:Peak_to_Peak_Charter_School_soccer_field_and_running_track,_Lafayette,_Colorado,_USA_-_2025.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d1/Peak_to_Peak_Charter_School_soccer_field_and_running_track%2C_Lafayette%2C_Colorado%2C_USA_-_2025.jpg/500px-Peak_to_Peak_Charter_School_soccer_field_and_running_track%2C_Lafayette%2C_Colorado%2C_USA_-_2025.jpg)。体育场景。
21. **萌宠奇遇**：《A curious kitten (Pixabay)》，Dimitri Houtteman，CC0。[作品页](https://commons.wikimedia.org/wiki/File:A_curious_kitten_(Pixabay).jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/A_curious_kitten_%28Pixabay%29.jpg/500px-A_curious_kitten_%28Pixabay%29.jpg)。叼树叶的小猫。
22. **星际机甲**：《STS-134 International Space Station after undocking》，NASA，Public Domain。[作品页](https://commons.wikimedia.org/wiki/File:STS-134_International_Space_Station_after_undocking.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c9/STS-134_International_Space_Station_after_undocking.jpg/500px-STS-134_International_Space_Station_after_undocking.jpg)。空间站，没有机甲，不表示 NASA 背书。
23. **奇幻冒险**：《A floral fantasy of animals and birds (Waq-waq)》，作者未知，CC0。[作品页](https://clevelandart.org/art/2013.319)；[候选图](https://openaccess-cdn.clevelandart.org/2013.319/2013.319_web.jpg)。波斯神话幻想植物与动物画，不能代表所有奇幻画风。
24. **年代创业**：《1930 Shanghai》，US Signal Corps，Public Domain。[作品页](https://commons.wikimedia.org/wiki/File:1930_Shanghai.jpg)；[候选图](https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/1930_Shanghai.jpg/500px-1930_Shanghai.jpg)。1930 年代城市氛围，不涵盖其他年代和乡村创业。
25. **穿越重生**：《Clock》，Henrik Wigström / House of Fabergé，CC0。[作品页](https://clevelandart.org/art/1966.475)；[候选图](https://openaccess-cdn.clevelandart.org/1966.475/1966.475_web.jpg)。时钟物件，仅作时间象征。

## 当前配图状态

25 项题材均已使用 Open302 `gpt-image-2` 按各自 `imagePrompt` 生成原创横版卡片图，文件为 `apps/web/public/genrePresets/{id}.png`，尺寸 1280 × 720。生成时使用中等质量，并加入统一的 16:9、卡片可读、无文字/水印/Logo 约束；未下载或复用互联网图片。

此前 Open302 控制台记录这 25 次题材配图生成均成功，每次 12 积分 / ¥0.12，合计 300 积分 / ¥3.00。记录还显示当天另外有 3 次冒烟测试，共 18 积分 / ¥0.18；当天总请求 28 次、累计消费 ¥3.18、余额 ¥917.37。本轮只核实了本地文件及静态 HTTP 响应，没有重新登录控制台核对账单。

题材卡片直接引用对应题材 ID 的本地图。此次生图只用于题材选择器的题材配图；`storyPrompt` 与 `negativePrompt` 仍未接入生产剧本 Agent 或后续主体资产/分镜生成链路，不能据此声称这些文本已影响漫剧生产结果。25 个图片 URL 均已通过本地开发服务器返回 HTTP 200 `image/png`；本地应用页面显示 `Network Error`，因此本轮未能通过应用交互点击验证选择器。
