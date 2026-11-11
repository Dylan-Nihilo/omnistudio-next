import { z } from "zod";

export const productionScriptDocumentSchema = z.strictObject({
  outline: z.string().max(20000),
  sourceText: z.string().max(120000),
  episodes: z.array(z.strictObject({
    episodeNumber: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(50000),
  })).min(1).max(12),
}).superRefine((document, context) => {
  const numbers = new Set<number>();
  document.episodes.forEach((episode, index) => {
    if (numbers.has(episode.episodeNumber)) context.addIssue({ code: "custom", path: ["episodes", index, "episodeNumber"], message: "分集编号不能重复" });
    numbers.add(episode.episodeNumber);
  });
});

export type ProductionScriptDocument = z.infer<typeof productionScriptDocumentSchema>;
export type ProductionScriptSource = "generated" | "imported" | "derived" | "edited";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function orderedItems(value: unknown, key: string) {
  return (Array.isArray(value) ? value.map(record) : []).sort((left, right) => Number(left[key]) - Number(right[key]));
}

export function buildDerivedScriptDocument(snapshot: unknown, sourceText = ""): ProductionScriptDocument {
  const value = record(snapshot);
  return {
    outline: stringValue(value.logline),
    sourceText,
    episodes: orderedItems(value.episodes, "episodeNumber").map((episode, episodeIndex) => ({
      episodeNumber: Number.isSafeInteger(episode.episodeNumber) && Number(episode.episodeNumber) > 0 ? Number(episode.episodeNumber) : episodeIndex + 1,
      title: stringValue(episode.title) || `第 ${episodeIndex + 1} 集`,
      body: orderedItems(episode.scenes, "sceneNumber").map((scene, sceneIndex) => {
        const heading = `场景 ${scene.sceneNumber || sceneIndex + 1} · ${stringValue(scene.title)}`;
        const shots = orderedItems(scene.shots, "shotNumber").map((shot, shotIndex) => {
          const description = stringValue(shot.prompt);
          const dialogue = stringValue(shot.dialogue);
          const narration = stringValue(shot.narration);
          return [`镜头 ${shot.shotNumber || shotIndex + 1}`, description ? `画面：${description}` : "", dialogue ? `对白：${dialogue}` : "", narration ? `旁白：${narration}` : ""].filter(Boolean).join("\n");
        }).join("\n\n");
        return [heading, stringValue(scene.continuityNotes), shots].filter(Boolean).join("\n\n");
      }).join("\n\n") || stringValue(episode.body),
    })),
  };
}

export function readScriptDocumentSnapshot(snapshot: unknown) {
  const value = record(snapshot);
  const parsed = productionScriptDocumentSchema.safeParse(value.scriptDocument);
  const source: ProductionScriptSource = parsed.success && ["generated", "imported", "derived", "edited"].includes(String(value.scriptSource)) ? value.scriptSource as ProductionScriptSource : "derived";
  return {
    document: parsed.success ? parsed.data : buildDerivedScriptDocument(value),
    source,
    ...(Number.isSafeInteger(value.restoredFromRevision) && Number(value.restoredFromRevision) > 0 ? { restoredFromRevision: Number(value.restoredFromRevision) } : {}),
  };
}
