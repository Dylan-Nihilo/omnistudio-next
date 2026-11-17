import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ packageId: z.string().min(1).max(100) }), async (req, res) => {
  const { packageId } = req.body as { packageId: string };
  const item = u.skillCatalog.findSkillCatalogPackage(packageId);
  if (!item) return res.status(404).json(error("技能包不在当前精选目录中", null, 404));
  const release = await u.accountSkills.lockPackageLifecycle(req.authContext!.user.id, packageId);
  try {
    const globalNames = new Set(u.skillLoader.loadSkillDirectory(u.skillFile.directory()).skills.map(skill => skill.name.toLowerCase()));
    const accountDirectory = u.accountSkills.existingDirectory(req.authContext!.user.id);
    const accountNames = new Set(accountDirectory ? u.skillLoader.loadSkillDirectory(accountDirectory).skills.map(skill => skill.name.toLowerCase()) : []);
    const globalConflicts = item.skills.filter(skill => globalNames.has(skill.name.toLowerCase())).map(skill => skill.name);
    if (globalConflicts.length) return res.status(409).json(error(`以下 Skill 已由管理员安装到全局目录，不能重复安装：${globalConflicts.join("、")}`, { conflicts: globalConflicts }, 409));
    const accountConflicts = item.skills.filter(skill => accountNames.has(skill.name.toLowerCase())).map(skill => skill.name);
    if (accountConflicts.length === item.skills.length) return res.status(409).json(error("此技能包已安装到当前个人账户，不会覆盖现有内容", { conflicts: accountConflicts }, 409));
    if (accountConflicts.length) return res.status(409).json(error(`当前个人账户已有部分同名技能：${accountConflicts.join("、")}。为避免整包覆盖，请先卸载冲突技能`, { conflicts: accountConflicts }, 409));
    const result = await u.pluginInstall.installCatalogSkillPackage(item, "account");
    res.json(success({ packageId, version: item.version, scope: "account", ...result }, "技能包已安装到个人账户"));
  } finally { release(); }
});
