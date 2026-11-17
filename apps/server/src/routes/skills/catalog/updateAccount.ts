import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ packageId: z.string().min(1).max(100), version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/) }), async (req, res) => {
  const { packageId, version } = req.body as { packageId: string; version: string };
  const item = u.skillCatalog.findSkillCatalogPackage(packageId);
  if (!item) return res.status(404).json(error("技能包不在当前精选目录中", null, 404));
  const result = await u.accountSkillLifecycle.upgradeAccountSkillPackage(item, version);
  res.json(success(result, "个人技能包已升级，旧版已备份"));
});
