import { spawnSync } from "child_process";

export type CreateRepoResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Create a private GitHub repo by name (e.g. "my-agvault" or "owner/repo") and return its HTTPS URL or error.
 */
export function createGitHubRepoByName(name: string): CreateRepoResult {
  if (!isGhAvailable()) return { ok: false, error: "GitHub CLI (gh) not found." };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Repo name is required." };
  try {
    const create = spawnSync("gh", ["repo", "create", trimmed, "--private", "--description", "agvault-vault"], {
      stdio: "pipe",
      shell: true,
      encoding: "utf-8",
    });
    const errOut = (create.stderr ?? "").trim() || (create.stdout ?? "").trim();
    if (create.status !== 0) {
      const alreadyExists =
        /already exists|Name already exists|name already exists/i.test(errOut);
      if (alreadyExists) {
        const view = spawnSync("gh", ["repo", "view", trimmed, "--json", "url", "-q", ".url"], {
          stdio: "pipe",
          shell: true,
          encoding: "utf-8",
        });
        if (view.status === 0) {
          const url = (view.stdout ?? "").trim();
          if (url) return { ok: true, url: url.endsWith(".git") ? url : `${url}.git` };
        }
      }
      return { ok: false, error: errOut || "gh repo create failed." };
    }
    const view = spawnSync("gh", ["repo", "view", trimmed, "--json", "url", "-q", ".url"], {
      stdio: "pipe",
      shell: true,
      encoding: "utf-8",
    });
    if (view.status !== 0) {
      return { ok: false, error: (view.stderr ?? "").trim() || "Could not get repo URL after create." };
    }
    const url = (view.stdout ?? "").trim();
    if (!url) return { ok: false, error: "Could not get repo URL." };
    return { ok: true, url: url.endsWith(".git") ? url : `${url}.git` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Parse GitHub repo URL to owner/repo (e.g. "user/agvault-repo").
 */
export function parseGitHubRepoUrl(repoUrl: string): string | null {
  const trimmed = repoUrl.trim();
  // https://github.com/owner/repo or https://github.com/owner/repo.git
  const httpsMatch = trimmed.match(/github\.com[/:](\w[\w.-]*)\/([^\s/#]+?)(?:\.git)?\/?$/i);
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2].replace(/\.git$/, "")}`;
  // git@github.com:owner/repo or git@github.com:owner/repo.git
  const sshMatch = trimmed.match(/github\.com:(\w[\w.-]*)\/([^\s/#]+?)(?:\.git)?\/?$/i);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2].replace(/\.git$/, "")}`;
  return null;
}

/**
 * Check if GitHub CLI (gh) is available.
 */
export function isGhAvailable(): boolean {
  try {
    spawnSync("gh", ["--version"], { stdio: "ignore", shell: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a private GitHub repo from a local path and push.
 * Uses `gh repo create owner/repo --private --source=path --remote=origin --push`.
 * Returns true if repo was created and pushed; false if gh not available or command failed.
 */
export function createGitHubRepoAndPush(repoUrl: string, localPath: string): boolean {
  const repo = parseGitHubRepoUrl(repoUrl);
  if (!repo) return false;
  if (!isGhAvailable()) return false;
  try {
    const r = spawnSync(
      "gh",
      ["repo", "create", repo, "--private", "--source", localPath, "--remote", "origin", "--push"],
      { stdio: "inherit", cwd: localPath, shell: true }
    );
    return r.status === 0;
  } catch {
    return false;
  }
}
