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

/**
 * Load config from .agvault/config.json.
 * Returns null only when the file does not exist.
 * Throws when the file exists but JSON is invalid (so callers can show "fix config" instead of "not initialized").
 */
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in .agvault/config.json: ${msg}`);
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

/** Normalize path to forward slashes for consistency with vault paths. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Add a path to config.exclude (so it won't be stored). Saves config. */
export function addToExclude(cwd: string, path: string): void {
  const config = loadConfig(cwd);
  if (!config?.repoUrl) throw new Error("Not initialized. Run 'agvault init' first.");
  const normalized = normalizePath(path);
  if (config.exclude.includes(normalized)) return;
  config.exclude = [...config.exclude, normalized];
  saveConfig(cwd, config);
}

/** Ensure a path is included (add to include if not present, remove from exclude if present). Saves config. */
export function ensurePathIncluded(cwd: string, path: string): void {
  const config = loadConfig(cwd);
  if (!config?.repoUrl) throw new Error("Not initialized. Run 'agvault init' first.");
  const normalized = normalizePath(path);
  config.exclude = config.exclude.filter((p) => p !== normalized);
  if (!config.include.includes(normalized)) {
    config.include = [...config.include, normalized];
  }
  saveConfig(cwd, config);
}
