import { Router } from "express";
import { z } from "zod";
import { createTeamA2aClient } from "@omnistudio-next/teams-scaffold/a2a";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";
import { parseRemoteUrl, remoteUrlPolicyMessage, safeRemoteFetch } from "@/lib/remoteUrl";

export default Router().post("/", validateFields({
  name: z.string().regex(u.teams.teamNamePattern),
  cardUrl: z.string().max(4096).refine(value => { try { parseRemoteUrl(value); return true; } catch { return false; } }, "Agent Card 地址必须是无凭据的 HTTP(S) 地址"),
  token: z.string().max(8192).optional(),
}), async (req, res) => {
  if (req.authContext?.user.isRoot !== true) return res.status(403).json(error("请在桌面端或服务器本机连接远端团队", null, 403));
  const { name, cardUrl, token } = req.body as { name: string; cardUrl: string; token?: string };
  const signal = AbortSignal.timeout(20000);
  const client = await createTeamA2aClient({ url: cardUrl, token, fetch: (async (input, init) => {
    try { return await safeRemoteFetch(input, { ...init, signal: init?.signal ?? signal }); }
    catch (error) { throw Object.assign(error instanceof Error ? error : new Error(remoteUrlPolicyMessage()), { status: 502 }); }
  }) as typeof fetch });
  const card = await client.getAgentCard();
  await u.teams.saveRemoteTeam({ name, cardUrl, ...(token ? { token } : {}), enabled: true, card });
  res.json(success({ name }, "远端团队已连接"));
});
