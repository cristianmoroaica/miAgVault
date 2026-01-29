import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, statSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, relative, dirname, basename } from "path";
import { glob } from "glob";
import { simpleGit } from "simple-git";
import type { SimpleGit } from "simple-git";
import { VAULT_DIR, loadConfig } from "./config.js";
import { createGitHubRepoAndPush, ensureGhGitAuth, isGhAvailable, parseGitHubRepoUrl } from "./gh.js";

export interface VaultFile {
  path: string;
  relativePath: string;
}

export function getVaultRoot(cwd: string): string | null {
  const config = loadConfig(cwd);
  if (!config?.repoUrl) return null;
  return join(cwd, VAULT_DIR);
}

/** Remove any persistent local vault (e.g. legacy .agvault/repo). Caller should confirm first. */
export function clearVault(cwd: string): void {
  const vaultPath = join(cwd, VAULT_DIR);
  if (!existsSync(vaultPath)) return;
  rmSync(vaultPath, { recursive: true });
}

function isRepoNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("repository not found") ||
    lower.includes("could not read from remote") ||
    lower.includes("does not appear to be a git repository") ||
    lower.includes("remote repository is empty") ||
    lower.includes("failed to connect")
  );
}

/** Create an empty vault repo in tempDir (git init, vault/.gitkeep, commit, remote). Used when remote doesn't exist yet. */
async function createTempVaultRepo(tempDir: string, repoUrl: string, branch: string): Promise<void> {
  const git = simpleGit(tempDir);
  await git.init();
  const vaultContentDir = join(tempDir, "vault");
  mkdirSync(vaultContentDir, { recursive: true });
  writeFileSync(join(vaultContentDir, ".gitkeep"), "", "utf-8");
  await git.add(".");
  await git.commit("agvault: initial vault");
  await git.addRemote("origin", repoUrl);
  await git.branch(["-M", branch]);
}

export interface WithTempVaultOptions {
  onPhase?: (msg: string) => void;
}

export interface WithTempVaultContext {
  onPhase?: (msg: string) => void;
}

/**
 * Clone vault repo into a temp directory, run the callback, then delete the temp dir.
 * No vault data is left on disk after the callback returns.
 * If remote doesn't exist, creates an empty vault structure in temp (for store/sync to push).
 */
export async function withTempVault<T>(
  cwd: string,
  fn: (vaultPath: string, git: SimpleGit, ctx: WithTempVaultContext) => Promise<T>,
  opts?: WithTempVaultOptions
): Promise<T> {
  const config = loadConfig(cwd);
  if (!config?.repoUrl) throw new Error("Not initialized. Run 'agvault init' first.");
  const branch = config.branch || "main";
  const tempDir = mkdtempSync(join(tmpdir(), "agvault-"));
  const ctx: WithTempVaultContext = { onPhase: opts?.onPhase };

  // Use gh for Git credentials when available so pull/sync don't prompt for username/password
  if (parseGitHubRepoUrl(config.repoUrl) && isGhAvailable()) {
    ensureGhGitAuth();
  }

  try {
    opts?.onPhase?.("Cloning vault…");
    try {
      const git = simpleGit(cwd);
      await git.clone(config.repoUrl, tempDir, ["--branch", branch]);
    } catch {
      // Remote empty or clone failed: create empty vault in temp
      await createTempVaultRepo(tempDir, config.repoUrl, branch);
    }

    const git = simpleGit(tempDir);
    return await fn(tempDir, git, ctx);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/** Delete all projects from the vault (empty vault content, commit, push). Caller should confirm first. */
export async function purgeVault(cwd: string, opts?: WithTempVaultOptions): Promise<void> {
  await withTempVault(cwd, async (vaultPath, git, ctx) => {
    const config = loadConfig(cwd)!;
    const vaultContent = join(vaultPath, "vault");
    if (!existsSync(vaultContent)) return;

    const entries = readdirSync(vaultContent, { withFileTypes: true });
    for (const e of entries) {
      rmSync(join(vaultContent, e.name), { recursive: true });
    }
    writeFileSync(join(vaultContent, ".gitkeep"), "", "utf-8");
    await git.add(".");
    await git.commit("agvault: purge all projects");
    ctx.onPhase?.("Pushing…");
    await git.push("origin", config.branch || "main");
  }, opts);
}

/** Workspace name for vault paths: basename of cwd (e.g. project folder name), fallback "default". */
function getWorkspaceName(cwd: string): string {
  return basename(cwd) || "default";
}

function getWorkspaceRelativePath(cwd: string, absolutePath: string): string {
  const rel = relative(cwd, absolutePath);
  return rel.replace(/\\/g, "/");
}

export async function collectFiles(cwd: string): Promise<VaultFile[]> {
  const config = loadConfig(cwd);
  if (!config) return [];

  const results: VaultFile[] = [];
  const seen = new Set<string>();

  for (const pattern of config.include) {
    const files = await glob(pattern, {
      cwd,
      nodir: true,
      ignore: config.exclude,
      dot: true,
    });
    for (const f of files) {
      const abs = join(cwd, f);
      if (seen.has(abs)) continue;
      seen.add(abs);
      try {
        if (statSync(abs).isFile()) {
          results.push({ path: abs, relativePath: getWorkspaceRelativePath(cwd, abs) });
        }
      } catch {
        // skip inaccessible
      }
    }
  }

  return results;
}

export function copyToVault(files: VaultFile[], vaultPath: string, cwd: string): void {
  const workspaceName = getWorkspaceName(cwd);
  for (const { path: src, relativePath } of files) {
    const dest = join(vaultPath, "vault", workspaceName, relativePath);
    const destDir = dirname(dest);
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    cpSync(src, dest, { force: true });
  }
}

/**
 * Remove from the vault workspace any file that is not in the allowed set
 * (e.g. newly excluded by config). Removes empty directories so git sees deletions.
 */
function removeExcludedFromVault(
  vaultPath: string,
  cwd: string,
  allowedRelativePaths: Set<string>
): void {
  const workspaceName = getWorkspaceName(cwd);
  const workspaceRoot = join(vaultPath, "vault", workspaceName);
  if (!existsSync(workspaceRoot)) return;

  const toDelete: string[] = [];
  const walk = (dir: string, prefix: string) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(full, rel);
      } else {
        if (!allowedRelativePaths.has(rel)) toDelete.push(full);
      }
    }
  };
  walk(workspaceRoot, "");
  for (const f of toDelete) rmSync(f, { force: true });

  const removeEmptyDirs = (dir: string): void => {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) removeEmptyDirs(full);
    }
    if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  };
  removeEmptyDirs(workspaceRoot);
}

export function copyFromVault(vaultPath: string, cwd: string, specificPaths?: string[]): number {
  const workspaceName = getWorkspaceName(cwd);
  const workspaceRoot = join(vaultPath, "vault", workspaceName);
  if (!existsSync(workspaceRoot)) return 0;

  let count = 0;
  const walk = (dir: string, prefix: string) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const vaultRel = `${workspaceName}/${rel}`;
      if (e.isDirectory()) {
        walk(full, rel);
      } else {
        if (specificPaths && specificPaths.length > 0) {
          const match = specificPaths.some(
            (p) => vaultRel === p || rel === p || rel.endsWith("/" + p) || p === e.name
          );
          if (!match) continue;
        }
        const dest = join(cwd, rel);
        const destDir = dirname(dest);
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        writeFileSync(dest, readFileSync(full));
        count++;
      }
    }
  };
  walk(workspaceRoot, "");
  return count;
}

export async function listVaultFiles(vaultPath: string): Promise<string[]> {
  const vaultContent = join(vaultPath, "vault");
  if (!existsSync(vaultContent)) return [];

  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full, rel);
      else out.push(rel);
    }
  };
  walk(vaultContent, "");
  return out.sort();
}

/** Pull from vault: clone to temp, copy vault/workspace files to project root, delete temp. Returns file count. */
export async function pullFromVault(
  cwd: string,
  specificPaths?: string[],
  opts?: WithTempVaultOptions
): Promise<number> {
  return withTempVault(cwd, async (vaultPath, _git, ctx) => {
    ctx.onPhase?.("Copying files…");
    return copyFromVault(vaultPath, cwd, specificPaths);
  }, opts);
}

/** Store to vault: clone to temp, copy project files into vault/workspace, commit, push, delete temp. */
export async function storeToVault(cwd: string, opts?: WithTempVaultOptions): Promise<number> {
  const files = await collectFiles(cwd);
  return withTempVault(cwd, async (vaultPath, git, ctx) => {
    const config = loadConfig(cwd)!;
    ctx.onPhase?.("Copying files…");
    copyToVault(files, vaultPath, cwd);
    const allowed = new Set(files.map((f) => f.relativePath));
    removeExcludedFromVault(vaultPath, cwd, allowed);
    const status = await git.status();
    const hasChanges =
      status.files.length > 0 || status.not_added.length > 0 || status.deleted.length > 0;
    if (!hasChanges) return files.length;

    await git.add(".");
    await git.commit("agvault: store");
    ctx.onPhase?.("Pushing…");

    try {
      await git.push("origin", config.branch || "main");
    } catch (err) {
      if (!isRepoNotFoundError(err)) throw err;
      if (isGhAvailable() && createGitHubRepoAndPush(config.repoUrl, vaultPath)) {
        return files.length;
      }
      const repo = parseGitHubRepoUrl(config.repoUrl);
      const hint = repo
        ? `Create the repo at https://github.com/new?name=${repo.split("/")[1]} (private), then run agvault store again.`
        : "Create a private repo at https://github.com/new and use its URL in agvault init, then run agvault store again.";
      throw new Error(
        `Remote repository not found. ${isGhAvailable() ? "Run \`gh auth login\` and try again, or " : "Install GitHub CLI (gh) and run \`gh auth login\` to create the repo automatically, or "}${hint}`
      );
    }
    return files.length;
  }, opts);
}

/** Sync: pull (clone→copy to root→delete temp), then store (clone→merge local→push→delete temp). */
export async function syncVault(cwd: string, opts?: WithTempVaultOptions): Promise<{ pulled: number; stored: number }> {
  const pullOpts: WithTempVaultOptions = {
    onPhase: (msg) => opts?.onPhase?.(msg === "Cloning vault…" ? "Syncing: pulling…" : msg),
  };
  const pulled = await pullFromVault(cwd, undefined, pullOpts);
  const files = await collectFiles(cwd);
  const storeOpts: WithTempVaultOptions = {
    onPhase: (msg) => opts?.onPhase?.(msg === "Cloning vault…" ? "Syncing: storing…" : msg),
  };
  const stored = await withTempVault(cwd, async (vaultPath, git, ctx) => {
    const config = loadConfig(cwd)!;
    ctx.onPhase?.("Copying files…");
    copyToVault(files, vaultPath, cwd);
    const allowed = new Set(files.map((f) => f.relativePath));
    removeExcludedFromVault(vaultPath, cwd, allowed);
    const status = await git.status();
    const hasChanges =
      status.files.length > 0 || status.not_added.length > 0 || status.deleted.length > 0;
    if (!hasChanges) return 0;

    await git.add(".");
    await git.commit("agvault: sync");
    ctx.onPhase?.("Pushing…");
    try {
      await git.push("origin", config.branch || "main");
    } catch (err) {
      if (!isRepoNotFoundError(err)) throw err;
      if (isGhAvailable() && createGitHubRepoAndPush(config.repoUrl, vaultPath)) {
        return files.length;
      }
      throw err;
    }
    return files.length;
  }, storeOpts);
  return { pulled, stored };
}

/** List files in the vault (clone to temp, list, delete temp). */
export async function listVaultFilesRemote(cwd: string, opts?: WithTempVaultOptions): Promise<string[]> {
  return withTempVault(cwd, async (vaultPath, _git, _ctx) => listVaultFiles(vaultPath), opts);
}

/**
 * Reinit: verify config and remote (clone to temp, then delete). Optionally remove legacy .agvault/repo if present.
 */
export async function runReinit(cwd: string, opts?: WithTempVaultOptions): Promise<void> {
  const config = loadConfig(cwd);
  if (!config?.repoUrl) throw new Error("Not initialized. Run 'agvault init' first.");
  clearVault(cwd);
  await withTempVault(cwd, async (_vaultPath, _git, _ctx) => {
    // Just clone and delete to verify remote is reachable
  }, opts);
}
