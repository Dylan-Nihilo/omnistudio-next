import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { getAccountDirectory } from "@/utils/conf";

export async function getAssetsDirectory() {
  const directory = join(getAccountDirectory(), "assets");
  await mkdir(directory, { recursive: true });
  return realpath(directory);
}
