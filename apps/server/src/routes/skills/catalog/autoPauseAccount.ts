import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({
  packageId: z.string().min(1).max(100),
  name: z.string().min(1).max(64),
  paused: z.boolean(),
}), async (req, res) => {
  const { packageId, name, paused } = req.body as { packageId: string; name: string; paused: boolean };
  const item = u.skillCatalog.findSkillCatalogPackage(packageId);
  if (!item?.skills.some(skill => skill.name === name)) return res.status(404).json(error("技能不在当前精选目录中", null, 404));
  const accountSkill = u.agent.loadAgentSkills("", "account").skills.some(skill => skill.name === name);
  if (!accountSkill) return res.status(404).json(error("当前账户没有安装这个技能", null, 404));
  await u.accountSkills.setAutoPaused(req.authContext!.user.id, name, paused);
  res.set("Cache-Control", "no-store").json(success({ name, paused }, paused ? "已暂停自动推荐" : "已恢复自动推荐"));
});
