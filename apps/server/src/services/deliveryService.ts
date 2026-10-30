import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { asc, and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/database";
import { auditEvents, productionApprovals, productionClipVariants, productionDeliveries, productionEpisodes, productionProjectMembers, productionProjects, productionReviews, productionScenes, productionSeasons, productionShots } from "@/db/schema";
import { requireAccount } from "@/utils/accountContext";
import { requireProjectAccess } from "@/services/productionProjectService";
import u from "@/utils";
import { resolveWorkspacePath } from "@/utils/workspace/files";

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function srtTime(milliseconds: number) {
  const value = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor(value / 60_000) % 60;
  const seconds = Math.floor(value / 1_000) % 60;
  const millis = value % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

async function runConcat(cwd: string, inputPaths: string[], outputPath: string) {
  const factory = await u.ffmpeg.createWorkspaceFfmpeg(cwd);
  const command = factory(inputPaths[0]);
  for (const inputPath of inputPaths.slice(1)) command.input(inputPath);
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    const done = (error?: unknown) => {
      if (finished) return;
      finished = true;
      error ? reject(error) : resolve();
    };
    command.once("error", done);
    command.once("end", () => done());
    if (inputPaths.length === 1) command.output(outputPath).videoCodec("copy").audioCodec("copy").run();
    else command.concat(outputPath);
  });
}

export async function createProductionDelivery(input: { projectId: string; cwd: string }) {
  const account = requireAccount();
  const { project } = await requireProjectAccess(input.projectId, "export");
  const database = getDatabase();
  const rows = await database.select({ variant: productionClipVariants, shot: productionShots, scene: productionScenes, episode: productionEpisodes, season: productionSeasons }).from(productionClipVariants)
    .innerJoin(productionShots, eq(productionShots.id, productionClipVariants.shotId))
    .innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId))
    .innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId))
    .innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
    .where(and(eq(productionClipVariants.projectId, input.projectId), eq(productionClipVariants.status, "approved")))
    .orderBy(asc(productionSeasons.seasonNumber), asc(productionEpisodes.episodeNumber), asc(productionScenes.sceneNumber), asc(productionShots.shotNumber));
  const allShots = await database.select({ id: productionShots.id, status: productionShots.status }).from(productionShots)
    .innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId))
    .innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId))
    .innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
    .where(eq(productionSeasons.projectId, input.projectId));
  if (!allShots.length) invalid("项目还没有镜头", 409);
  if (allShots.some(shot => shot.status !== "approved")) invalid("仍有镜头未批准，不能导出交付包", 409);
  if (rows.length !== allShots.length) invalid("批准候选与镜头数量不一致，不能导出交付包", 409);

  const deliveryId = randomUUID();
  const outputDirectory = `deliveries/${input.projectId}/${deliveryId}`;
  const outputRoot = await resolveWorkspacePath(input.cwd, outputDirectory, true);
  await mkdir(outputRoot.path, { recursive: true });
  const mp4Path = join(outputDirectory, "episode.mp4").replace(/\\/g, "/");
  const srtPath = join(outputDirectory, "episode.srt").replace(/\\/g, "/");
  const manifestPath = join(outputDirectory, "manifest.json").replace(/\\/g, "/");
  const auditPackagePath = join(outputDirectory, "audit-package.json").replace(/\\/g, "/");
  const inputPaths: string[] = [];
  let elapsed = 0;
  const subtitles: string[] = [];
  const manifestItems: Record<string, unknown>[] = [];
  for (const row of rows) {
    const source = await resolveWorkspacePath(input.cwd, row.variant.filePath);
    const sourceInfo = await stat(source.path);
    if (!sourceInfo.isFile() || sourceInfo.size === 0) invalid(`候选片段文件不可用：${row.variant.filePath}`, 409);
    inputPaths.push(source.path);
    const duration = row.shot.durationMs;
    const text = [row.shot.dialogue, row.shot.narration].filter(Boolean).join(" ").trim();
    if (text) subtitles.push(`${subtitles.length + 1}\n${srtTime(elapsed)} --> ${srtTime(elapsed + duration)}\n${text}\n`);
    manifestItems.push({ variantId: row.variant.id, shotId: row.shot.id, attemptNumber: row.variant.attemptNumber, sourcePath: row.variant.filePath, mimeType: row.variant.mimeType, durationMs: duration, sourceSha256: sha256(await readFile(source.path)) });
    elapsed += duration;
  }

  try {
    await runConcat(input.cwd, inputPaths, mp4Path);
    const manifest = { format: "omnistudio.production.manifest.v1", projectId: input.projectId, projectTitle: project.title, deliveryId, generatedAt: new Date().toISOString(), durationMs: elapsed, items: manifestItems };
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
    const manifestFile = await resolveWorkspacePath(input.cwd, manifestPath);
    await writeFile(manifestFile.path, manifestBytes);
    const subtitleFile = await resolveWorkspacePath(input.cwd, srtPath);
    await writeFile(subtitleFile.path, subtitles.join("\n"), "utf8");
    const approvalRows = await database.select().from(productionApprovals).where(eq(productionApprovals.projectId, input.projectId));
    const reviewRows = await database.select().from(productionReviews).where(eq(productionReviews.projectId, input.projectId));
    const auditRows = (await database.select().from(auditEvents).where(eq(auditEvents.workspaceId, project.workspaceId))).filter(row => {
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
      return metadata.projectId === input.projectId;
    });
    const auditPackage = { format: "omnistudio.production.audit.v1", project, deliveryId, exportedBy: account.userId, exportedAt: new Date().toISOString(), items: manifestItems, approvals: approvalRows, reviews: reviewRows, auditEvents: auditRows };
    const auditFile = await resolveWorkspacePath(input.cwd, auditPackagePath);
    await writeFile(auditFile.path, JSON.stringify(auditPackage, null, 2), "utf8");
    const manifestHash = sha256(manifestBytes);
    const now = new Date();
    const delivery = { id: deliveryId, projectId: input.projectId, status: "completed" as const, mp4Path, srtPath, manifestPath, auditPackagePath, manifestHash, createdBy: account.userId, createdAt: now, updatedAt: now };
    await database.transaction(async tx => {
      await tx.insert(productionDeliveries).values(delivery);
      await tx.update(productionProjects).set({ status: "delivered", updatedAt: now }).where(eq(productionProjects.id, input.projectId));
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionDelivery.export", metadata: { projectId: input.projectId, deliveryId, mp4Path, srtPath, manifestPath, auditPackagePath, manifestHash }, createdAt: now, updatedAt: now });
    });
    return { delivery, manifest, auditPackagePath };
  } catch (error) {
    await database.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionDelivery.failed", metadata: { projectId: input.projectId, deliveryId, error: error instanceof Error ? error.message : String(error) }, createdAt: new Date(), updatedAt: new Date() });
    throw error;
  }
}
