import { Router } from "express";
import { z } from "zod";
import type { CanvasInfo } from "@omnistudio-next/tools-scaffold/runtime";
import type { AgentEvent } from "@/agent/runtime/types";
import { validateFields } from "@/lib/middleware";
import u from "@/utils";
import { requireAuth, requireCsrf } from "@/middleware/authContext";

const inputSchema = z.object({
  prompt: z.string().trim(), directory: z.string().min(1),
  attachments: u.agent.agentAttachmentsSchema.optional(),
  mentions: u.agent.agentMentionsSchema.optional(),
  providerId: z.string().min(1), modelId: z.string().min(1),
  thinkingLevel: z.enum(["off", "low", "medium", "high"]).optional(),
  sessionFile: z.string().regex(/^[\w-]+\.jsonl$/).optional(),
  resendFrom: z.string().min(1).max(128).optional(),
  canvas: z.strictObject({
    id: z.string().min(1).max(256),
    tools: z.array(z.strictObject({
      nodeId: z.string().min(1).max(256),
      name: z.string().max(101).regex(/^node:[a-z][a-zA-Z0-9]*$/),
      nodeLabel: z.string().max(200).optional(),
      description: z.string().max(4000),
      parameters: z.record(z.string(), z.json()).refine(value => value.type === "object", "函数参数必须是 object JSON Schema"),
    })).max(1000),
  }).optional(),
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema.shape), async (req, res) => {
  const { directory, canvas, ...options } = req.body as z.infer<typeof inputSchema>;
  const idempotencyKey = req.header("idempotency-key")?.trim();
  if (!idempotencyKey) throw Object.assign(new Error("缺少 Idempotency-Key"), { status: 422 });
  const cwd = await u.workspace.resolveWorkspace(req, directory);
  res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const send = (event: AgentEvent) => {
    if (event.type === "session") options.sessionFile = event.file;
    u.agent.trackAgentEvent(cwd, options.sessionFile, event);
    if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`);
  };
  const bridge = canvas ? u.canvas.createCanvasContext(cwd, canvas as CanvasInfo, send) : undefined;
  const controller = new AbortController();
  const questions = u.question.createQuestionContext(cwd, send, () => controller.abort());
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    bridge?.dispose();
    questions.dispose();
    controller.abort();
  };
  req.once("aborted", close);
  res.once("close", close);
  try {
    await u.agent.run({ ...options, cwd, canvas: bridge?.context, question: questions.context, signal: controller.signal, onCancel: close, billing: { userId: req.authContext!.user.id } }, send);
    send({ type: "done" });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "Agent 运行失败" });
  } finally {
    req.off("aborted", close);
    res.off("close", close);
    bridge?.dispose();
    questions.dispose();
    res.end();
  }
});
