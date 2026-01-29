import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";

export const CONFIG_DIR = ".agvault";
export const CONFIG_FILE = "config.json";
/** Local vault git repo lives inside .agvault (e.g. .agvault/repo/vault/<workspace>). */
export const VAULT_DIR = ".agvault/repo";

/** Default include patterns: common agentic/docs files and folders */
export const DEFAULT_INCLUDE: string[] = [
  "**/*.md",
  "**/*.mdc",
  ".cursor/**",
  ".cursorrules",
  "docs/**",
  "*.md",
];

/** Default exclude patterns */
export const DEFAULT_EXCLUDE: string[] = [
  "node_modules/**",
  ".git/**",
  "dist/**",
  "build/**",
  ".agvault/**",
];

export interface AgVaultConfig {
  /** GitHub repo URL (HTTPS or SSH) for the private vault */
  repoUrl: string;
  /** Glob patterns for files/folders to include */
  include: string[];
  /** Glob patterns to exclude */
  exclude: string[];
  /** Optional: branch to use (default: main) */
  branch?: string;
}

export const DEFAULT_CONFIG: Partial<AgVaultConfig> = {
  include: [...DEFAULT_INCLUDE],
  exclude: [...DEFAULT_EXCLUDE],
  branch: "main",
};

export function getConfigPath(cwd: string): string {
  return join(cwd, CONFIG_DIR, CONFIG_FILE);
}

/**
 * Resolve the project root (directory where agvault is initialized).
 * Walks up from startDir (default process.cwd()) until .agvault/config.json is found.
 * Returns that directory so pull/sync copy vault/workspace into project root.
 * If not found, returns startDir (so init can run in current dir).
 */
export function getProjectRoot(startDir?: string): string {
  let dir = resolve(startDir ?? process.cwd());
  for (;;) {
    if (existsSync(getConfigPath(dir))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir ?? process.cwd());
}

export function loadConfig(cwd: string): AgVaultConfig | null {
  const path = getConfigPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AgVaultConfig>;
    return {
      repoUrl: parsed.repoUrl ?? "",
      include: parsed.include ?? [...DEFAULT_INCLUDE],
      exclude: parsed.exclude ?? [...DEFAULT_EXCLUDE],
      branch: parsed.branch ?? "main",
    };
  } catch {
    return null;
  }
}

export function saveConfig(cwd: string, config: AgVaultConfig): void {
  const dir = join(cwd, CONFIG_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = getConfigPath(cwd);
  writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
}

export function isInitialized(cwd: string): boolean {
  const config = loadConfig(cwd);
  return config !== null && Boolean(config.repoUrl);
}
