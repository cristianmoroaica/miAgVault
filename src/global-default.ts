import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const GLOBAL_DIR = ".agvault";
const GLOBAL_FILE = "default.json";

export interface GlobalDefaultConfig {
  /** Default vault repo URL used when init runs in a new project (no local config). */
  defaultRepoUrl: string;
}

function getGlobalConfigPath(): string {
  return join(homedir(), GLOBAL_DIR, GLOBAL_FILE);
}

export function loadGlobalDefault(): GlobalDefaultConfig | null {
  const path = getGlobalConfigPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<GlobalDefaultConfig>;
    if (!parsed.defaultRepoUrl?.trim()) return null;
    return { defaultRepoUrl: parsed.defaultRepoUrl.trim() };
  } catch {
    return null;
  }
}

export function saveGlobalDefault(repoUrl: string): void {
  const dir = join(homedir(), GLOBAL_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = getGlobalConfigPath();
  writeFileSync(path, JSON.stringify({ defaultRepoUrl: repoUrl.trim() }, null, 2), "utf-8");
}
