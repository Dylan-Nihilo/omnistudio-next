import { relative } from "node:path";
import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const router = Router();

export default router.get("/", async (_req, res) => {
  const directory = u.skillFile.directory();
  const { skills, diagnostics } = u.skillLoader.loadSkillDirectory(directory);
  const items = skills.map(skill => {
    const { frontmatter } = skill;
    const metadata = frontmatter.metadata && typeof frontmatter.metadata === "object" && !Array.isArray(frontmatter.metadata)
      ? frontmatter.metadata as Record<string, unknown> : {};
    let github = "";
    if (typeof metadata.github === "string" && URL.canParse(metadata.github)) {
      const url = new URL(metadata.github);
      if (url.origin === "https://github.com" && !url.username && !url.password) github = url.href;
    }
    return {
      name: skill.name,
      version: u.skillLoader.getSkillVersion(frontmatter),
      displayName: typeof metadata.displayName === "string" && metadata.displayName.trim() ? metadata.displayName : skill.name,
      description: skill.description,
      author: metadata.author === "Toonflow" ? "omnistudio-next" : typeof metadata.author === "string" ? metadata.author : "",
      github,
      warnings: skill.warnings,
    };
  });
  res.set("Cache-Control", "no-store");
  res.json(success({
    skills: items.sort((left, right) => left.name.localeCompare(right.name)),
    diagnostics: diagnostics.map(item => ({ type: item.type, path: item.path ? relative(directory, item.path) : "", message: item.message })),
  }));
});
