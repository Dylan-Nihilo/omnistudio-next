import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ packageId: z.string().min(1).max(100) }), async (req, res) => {
  const { packageId } = req.body as { packageId: string };
  const item = u.skillCatalog.findSkillCatalogPackage(packageId);
  if (!item) return res.status(404).json(error("技能包不在当前精选目录中", null, 404));
  const result = await u.pluginInstall.installCatalogSkillPackage(item, "global");
  res.json(success({ packageId, version: item.version, ...result }, "技能包已安装"));
});
