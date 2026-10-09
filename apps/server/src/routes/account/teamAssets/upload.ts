import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { teamAssetNameSchema, uploadTeamAsset } from "@/services/teamAssetService";

export default Router().put("/", validateFields({ teamId: z.uuid(), name: teamAssetNameSchema, mimeType: z.string().max(150).regex(/^[\w.+-]+\/[\w.+-]+$/) }, "query"), async (request, response) => {
  if (!Buffer.isBuffer(request.body)) throw Object.assign(new Error("请上传二进制文件"), { status: 400 });
  response.status(201).json(success(await uploadTeamAsset(request.query.teamId as string, (request.query.name as string).trim(), request.query.mimeType as string, request.body), "团队资产已上传"));
});
