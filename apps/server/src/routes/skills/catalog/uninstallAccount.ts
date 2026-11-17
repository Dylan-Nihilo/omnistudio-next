import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ packageId: z.string().min(1).max(100) }), async (req, res) => {
  const { packageId } = req.body as { packageId: string };
  const item = u.skillCatalog.findSkillCatalogPackage(packageId);
  if (!item) return res.status(404).json(error("技能包不在当前精选目录中", null, 404));
  const result = await u.accountSkillLifecycle.uninstallAccountSkillPackage(item);
  res.json(success(result, "个人技能包已卸载，备份可在市场中恢复"));
});
