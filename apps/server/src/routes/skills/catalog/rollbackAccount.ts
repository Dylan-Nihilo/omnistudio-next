import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ packageId: z.string().min(1).max(100), backupId: z.string().uuid() }), async (req, res) => {
  const { packageId, backupId } = req.body as { packageId: string; backupId: string };
  const item = u.skillCatalog.findSkillCatalogPackage(packageId);
  if (!item) return res.status(404).json(error("技能包不在当前精选目录中", null, 404));
  const result = await u.accountSkillLifecycle.rollbackAccountSkillPackage(item, backupId);
  res.json(success(result, "个人技能包已恢复"));
});
