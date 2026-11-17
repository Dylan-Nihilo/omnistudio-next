import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().get("/", validateFields({ scope: z.enum(["global", "account"]).optional() }, "query"), async (req, res) => {
  const scope = req.query.scope === "account" ? "account" : "global";
  const accountDirectory = u.accountSkills.existingDirectory(req.authContext!.user.id);
  const accountNames = new Set(accountDirectory ? u.skillLoader.loadSkillDirectory(accountDirectory).skills.map(skill => skill.name.toLowerCase()) : []);
  const autoPausedNames = new Set(u.accountSkills.autoPausedNames(req.authContext!.user.id));
  const globalNames = new Set(u.skillLoader.loadSkillDirectory(u.skillFile.directory()).skills.map(skill => skill.name.toLowerCase()));
  const packages = await Promise.all(u.skillCatalog.skillCatalog.map(async item => {
    const accountInstalledCount = item.skills.filter(skill => accountNames.has(skill.name.toLowerCase())).length;
    const globalInstalledCount = item.skills.filter(skill => globalNames.has(skill.name.toLowerCase())).length;
    const installedCount = scope === "account" ? accountInstalledCount : globalInstalledCount;
    const conflicts = scope === "account" ? item.skills.filter(skill => globalNames.has(skill.name.toLowerCase())).map(skill => skill.name) : [];
    const personalSkills = item.skills.map(skill => ({
      ...skill,
      installed: accountNames.has(skill.name.toLowerCase()),
      autoPaused: autoPausedNames.has(skill.name),
    }));
    const packageRecord = u.accountSkills.getPackageRecord(req.authContext!.user.id, item.packageId);
    const diskBackups = scope === "account" ? await u.accountSkills.listBackupRecords(req.authContext!.user.id, item.packageId) : [];
    const backups = [...new Map([...(packageRecord?.backups ?? []), ...diskBackups].map(backup => [backup.id, backup])).values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(-10);
    const inferredVersion = item.versions.find(version => version.skills.length === accountInstalledCount
      && version.skills.every(name => accountNames.has(name.toLowerCase())));
    const recordVersion = item.versions.find(version => version.version === packageRecord?.version);
    const installedVersion = scope === "account" && packageRecord?.installed !== false
      ? inferredVersion?.version ?? (recordVersion && recordVersion.skills.length === accountInstalledCount ? recordVersion.version : undefined)
      : undefined;
    const packageInstalled = scope === "account" ? Boolean(installedVersion) : installedCount === item.skills.length;
    return {
      ...item,
      skills: scope === "account" ? personalSkills : item.skills,
      installedCount,
      installed: packageInstalled,
      accountInstalledCount,
      globalInstalledCount,
      conflicts,
      installedVersion,
      updateAvailable: Boolean(installedVersion && u.skillCatalog.compareSkillCatalogVersions(item.version, installedVersion) > 0),
      backups,
    };
  }));
  res.set("Cache-Control", "no-store").json(success({ scope, packages }));
});
