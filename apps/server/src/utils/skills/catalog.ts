export const skillCatalog = [
  {
    packageId: "shuohaoDramaSkills",
    displayName: "短剧制作技能包 · shuohao-skills",
    description: "面向短剧制作的 Agent Skills，覆盖小说大纲、角色、美术、剧本、分镜和角色参考图。",
    publisher: "烁皓（eternityspring）",
    version: "2.1.0",
    license: "Apache-2.0",
    licenseUrl: "https://github.com/eternityspring/shuohao-skills/blob/v2.1.0/LICENSE",
    sourceUrl: "https://github.com/eternityspring/shuohao-skills/tree/v2.1.0",
    sourceCommit: "ef4ac0c313c7eeb1f918db5f0f0eb319745900bc",
    packageUrl: "https://codeload.github.com/eternityspring/shuohao-skills/zip/ef4ac0c313c7eeb1f918db5f0f0eb319745900bc",
    fileName: "shuohaoDramaSkills2.1.0.zip",
    sha256: "5286995bacf74dc7ea4838c28519950210e0bf2af9d458b75d36443a4e8d09c1",
    skills: [
      { name: "character-refs", displayName: "角色参考图", stage: "assetDesign", description: "拆解角色字段，先生成正面锚点，再以锚点衍生其他参考视图。" },
      { name: "novel-art", displayName: "美术设定集", stage: "assetDesign", description: "为场景与叙事道具制定一致性锚点、提示词和质量检查，不负责出图。" },
      { name: "novel-characters", displayName: "角色设定集", stage: "assetDesign", description: "从小说提取角色表、人物画像、形象与音色提示词，并生成可交互报告。" },
      { name: "novel-outline", displayName: "小说改编大纲", stage: "scriptAnalysis", description: "将小说整理为短剧改编说明、人物表、爽点表、分集梗概和资产清单。" },
      { name: "novel-script", displayName: "剧本创作", stage: "scriptAnalysis", description: "根据分集梗概产出结构化场次、节拍和对白，并检查时长等质量门。" },
      { name: "novel-storyboard", displayName: "分镜设计", stage: "storyboard", description: "把剧本拆成生成段、镜头切点和关键帧提示词，并提供投产清单。" },
    ],
    compatibility: "通用 Agent Skills 提示词包；主要面向文件式短剧项目，不映射当前生产项目数据库。",
    hostCompatibility: "使用通用 SKILL.md 格式；安装前会由当前 Agent Skills 加载器预检全部技能，无法加载时阻止安装。",
    requiredCapabilities: ["Node.js 18+", "Bash（仅上游脚本需要；平台不会执行包内脚本）"],
    examples: [
      { input: "提供小说片段，并说明题材、集数和单集时长", output: "按所选 Skill 生成故事大纲、角色/美术设定、剧本或分镜文本" },
    ],
    versions: [
      {
        version: "2.0.0",
        sourceCommit: "ca1c30be78bde70fa84d3817453c71e0ef25b751",
        packageUrl: "https://codeload.github.com/eternityspring/shuohao-skills/zip/ca1c30be78bde70fa84d3817453c71e0ef25b751",
        fileName: "shuohaoDramaSkills2.0.0.zip",
        sha256: "f2ae605f7401b308699cb1debbe41bd5b47e1027f6a9c918e4b7f212d950c54c",
        skills: ["novel-art", "novel-characters", "novel-outline", "novel-script", "novel-storyboard"],
      },
      {
        version: "2.1.0",
        sourceCommit: "ef4ac0c313c7eeb1f918db5f0f0eb319745900bc",
        packageUrl: "https://codeload.github.com/eternityspring/shuohao-skills/zip/ef4ac0c313c7eeb1f918db5f0f0eb319745900bc",
        fileName: "shuohaoDramaSkills2.1.0.zip",
        sha256: "5286995bacf74dc7ea4838c28519950210e0bf2af9d458b75d36443a4e8d09c1",
        skills: ["character-refs", "novel-art", "novel-characters", "novel-outline", "novel-script", "novel-storyboard"],
      },
    ],
    limitations: [
      "技能以 JSON/Markdown 文件作为阶段产物，与万象点点的生产项目数据未自动打通。",
      "部分技能附带 Node.js 脚本；安装不会执行脚本，Agent 也不能通过这些文件获得脚本执行权限。",
      "外部技能描述的图片和视频生产入口不等于万象点点模型或工具已配置；生成仍须使用本平台工具并遵守算力确认流程。",
    ],
  },
  {
    packageId: "zenstoryDramaSkills",
    displayName: "短剧全流程技能包 · ZenStory Drama Skills",
    description: "覆盖小说分析、系列开发、剧本、资产、分镜、提示词、审查和剪辑交付的第三方技能集合。",
    publisher: "ZenStory AI",
    version: "0.11.2",
    license: "MIT",
    licenseUrl: "https://github.com/zenstory-ai/drama-skills/blob/v0.11.2/LICENSE",
    sourceUrl: "https://github.com/zenstory-ai/drama-skills/tree/v0.11.2",
    sourceCommit: "3d813c30871b4db5f2387d83bdc3a49db8ce7b2b",
    packageUrl: "https://codeload.github.com/zenstory-ai/drama-skills/zip/3d813c30871b4db5f2387d83bdc3a49db8ce7b2b",
    fileName: "zenstoryDramaSkills0.11.2.zip",
    sha256: "d9617cb80df93a0d96fe2389e27bc6bc9d9311bd384586b9c972b048172396f7",
    skills: [
      { name: "short-drama-knowhow", displayName: "短剧经验治理（维护者专项）", stage: "reviewQa", description: "将维护者明确提供的只读资料整理为经过审查的通用知识，不面向普通项目创作或运行时取数。" },
      { name: "short-drama-assets", displayName: "短剧资产拆解", stage: "assetDesign", description: "从剧本提取人物、造型、地点、道具和状态，并整理跨场连续性视觉设定。" },
      { name: "short-drama-breakdown", displayName: "对标短剧拆解", stage: "scriptAnalysis", description: "分析已授权作品的集长、镜长、对白密度、开场、集尾与连续性，再与自有项目对照。" },
      { name: "short-drama-develop", displayName: "系列与分集开发", stage: "scriptAnalysis", description: "把小说、梗概或多集剧本整理为可追溯的系列方向、创作简报和分集地图。" },
      { name: "short-drama-edit", displayName: "剪辑与交付规划", stage: "delivery", description: "规划镜序、入出点、声音、字幕、节奏和交付规格；不会自动操作本平台剪辑或导出。" },
      { name: "short-drama-image-prompts", displayName: "短剧图片提示词", stage: "assetDesign", description: "为角色、造型、地点、道具和状态编写可复制的图片提示词，不生成媒体。" },
      { name: "short-drama-novel-analyze", displayName: "长篇小说结构分析", stage: "scriptAnalysis", description: "提取章节功能、剧情单元、人物和设定，形成可追溯的改编候选。" },
      { name: "short-drama-produce", displayName: "短剧媒体生产流程", stage: "mediaGeneration", description: "整理已确认的图片、视频、配音或音乐生产步骤；平台仍须通过本地生成接口和确认流程执行。" },
      { name: "short-drama-review", displayName: "短剧全流程审查", stage: "reviewQa", description: "审查故事、剧本、资产、分镜、提示词和已有媒体，只给问题与建议，不代替负责人修改或批准。" },
      { name: "short-drama-storyboard", displayName: "短剧连续性分镜", stage: "storyboard", description: "将剧本与视觉设定整理为镜头职责、连续性边界和关键帧提示词。" },
      { name: "short-drama-video-prompts", displayName: "短剧视频提示词", stage: "mediaGeneration", description: "把分镜和关键帧整理为动作、表演、运镜和起止状态提示词，不生成媒体。" },
      { name: "short-drama-write", displayName: "短剧剧本写作", stage: "scriptAnalysis", description: "编写或修订可拍摄的中文单集剧本，并保留作者原文边界。" },
      { name: "short-drama", displayName: "短剧项目路由与进度", stage: "workflow", description: "用文件式项目资料进行阶段路由、下一步判断和制作资料导出。" },
    ],
    compatibility: "MIT 第三方 Agent Skills；以本地 Markdown 文件和文件夹作为项目事实来源，不会自动读写万象点点生产项目数据库。",
    hostCompatibility: "v0.11.2 的 13 个 SKILL.md 已按固定 ZIP 摘要校验；安装前由本平台加载器预检。包内脚本不会执行，技能也不会获得未配置的工具。",
    requiredCapabilities: ["常规文本 Skill 可在平台 Agent 中使用", "部分上游流程依赖 Python 3.9、Shell、FFmpeg/ffprobe 或 Remotion adapter；这些能力未由本包提供"],
    examples: [
      { input: "给定一集已审核剧本和角色/场景设定，整理镜头表", output: "按连续性边界输出分镜 Markdown 与审查建议；需人工映射到生产项目后确认写入" },
    ],
    versions: [
      {
        version: "0.11.2",
        sourceCommit: "3d813c30871b4db5f2387d83bdc3a49db8ce7b2b",
        packageUrl: "https://codeload.github.com/zenstory-ai/drama-skills/zip/3d813c30871b4db5f2387d83bdc3a49db8ce7b2b",
        fileName: "zenstoryDramaSkills0.11.2.zip",
        sha256: "d9617cb80df93a0d96fe2389e27bc6bc9d9311bd384586b9c972b048172396f7",
        skills: ["short-drama-knowhow", "short-drama-assets", "short-drama-breakdown", "short-drama-develop", "short-drama-edit", "short-drama-image-prompts", "short-drama-novel-analyze", "short-drama-produce", "short-drama-review", "short-drama-storyboard", "short-drama-video-prompts", "short-drama-write", "short-drama"],
      },
    ],
    limitations: [
      "上游以 Markdown 项目文档作为工作事实来源；不能代替当前生产项目数据库、剧本版本和镜头草稿。",
      "short-drama-produce 不授予模型或媒体工具权限，平台不会执行包内 Python、Shell 或其他脚本；生产操作仍走平台报价、项目预算和授权确认。",
      "short-drama-knowhow 是维护者专项；不要把普通用户的项目资料或会话内容交给它做知识提炼。",
      "导入对标作品仅限用户拥有或获准使用的内容；输出是分析，不是复刻授权。",
    ],
  },
] as const;

export function findSkillCatalogPackage(packageId: string) {
  return skillCatalog.find(item => item.packageId === packageId);
}

export function findSkillCatalogSkill(name: string) {
  for (const item of skillCatalog) {
    const skill = (item.skills as readonly { name: string; displayName: string; stage: string; description: string }[])
      .find(value => value.name.toLowerCase() === name.toLowerCase());
    if (skill) return skill;
  }
}

export function compareSkillCatalogVersions(left: string, right: string) {
  return Bun.semver.order(left, right);
}
