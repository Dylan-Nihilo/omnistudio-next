import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { registerPersonalProject, getPersonalProjectRoot } from "@/services/accountService";
import { requireActiveAccount } from "@/utils/accountContext";

const inputSchema = z.strictObject({});
const projectName = "未命名画布";

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (_request, response) => {
  const account = requireActiveAccount();
  const root = await getPersonalProjectRoot(account.userId);
  const directory = resolve(root, `canvas${randomUUID().replaceAll("-", "")}`);
  await mkdir(directory, { mode: 0o700 });

  try {
    await writeFile(resolve(directory, "画布1.json"), `${JSON.stringify({
      toonflowCanvas: true,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await registerPersonalProject(directory, projectName);
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(cleanupError => {
      console.error("清理未完成的画布目录失败", { code: (cleanupError as NodeJS.ErrnoException).code });
    });
    throw error;
  }
  response.set("Cache-Control", "no-store").status(201).json(success({ directory, name: projectName }, "画布已创建"));
});
