import inquirer from "inquirer";
import chalk from "chalk";
import { existsSync } from "fs";
import { loadConfig, saveConfig, getConfigPath, DEFAULT_INCLUDE, DEFAULT_EXCLUDE, type AgVaultConfig } from "./config.js";
import { loadGlobalDefault, saveGlobalDefault } from "./global-default.js";
import { createGitHubRepoByName, isGhAvailable, parseGitHubRepoUrl } from "./gh.js";

export async function runInit(cwd: string): Promise<void> {
  let existing: AgVaultConfig | null;
  try {
    existing = loadConfig(cwd);
  } catch (err) {
    const configPath = getConfigPath(cwd);
    if (!existsSync(configPath)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(msg));
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      { type: "confirm", name: "overwrite", message: "Config file is invalid (check JSON). Overwrite with new config?", default: false },
    ]);
    if (!overwrite) {
      console.log(chalk.dim("Fix .agvault/config.json and try again."));
      return;
    }
    existing = null;
  }
  const hasExisting = existing !== null && Boolean(existing.repoUrl);

  let overwrite = true;
  if (hasExisting) {
    const { overwrite: o } = await inquirer.prompt<{ overwrite: boolean }>([
      { type: "confirm", name: "overwrite", message: "Config already exists. Re-enter repo and patterns?", default: false },
    ]);
    overwrite = o;
  }

  if (hasExisting && !overwrite) {
    const { customize } = await inquirer.prompt<{ customize: boolean }>([
      { type: "confirm", name: "customize", message: "Add or exclude more files/folders?", default: false },
    ]);
    let include = existing!.include;
    let exclude = existing!.exclude;
    if (customize) {
      const { includeExtra, excludeExtra } = await inquirer.prompt<{ includeExtra: string; excludeExtra: string }>([
        { type: "input", name: "includeExtra", message: "Extra include patterns (comma-separated):", default: "" },
        { type: "input", name: "excludeExtra", message: "Extra exclude patterns (comma-separated):", default: "" },
      ]);
      const inc = includeExtra.split(",").map((s) => s.trim()).filter(Boolean);
      const exc = excludeExtra.split(",").map((s) => s.trim()).filter(Boolean);
      if (inc.length) include = [...new Set([...include, ...inc])];
      if (exc.length) exclude = [...new Set([...exclude, ...exc])];
    }
    saveConfig(cwd, { ...existing!, include, exclude });
    console.log(chalk.green("Config updated."));
    console.log(chalk.dim("Config: " + getConfigPath(cwd)));
    return;
  }

  // Use global default vault when it exists so we don't prompt for repo again in new projects (one vault for all)
  const globalDefault = loadGlobalDefault();
  const useDefaultVault = Boolean(globalDefault?.defaultRepoUrl);

  if (useDefaultVault) {
    const repoUrl = globalDefault!.defaultRepoUrl;
    const repoLabel = parseGitHubRepoUrl(repoUrl) ?? repoUrl;
    console.log(chalk.dim("Using default vault: " + repoLabel));
    const answers = await inquirer.prompt<{ customize: boolean; includeExtra: string; excludeExtra: string }>([
      { type: "confirm", name: "customize", message: "Add or exclude more files/folders besides the predefined ones?", default: false },
      { type: "input", name: "includeExtra", message: "Extra include patterns (comma-separated globs):", default: "", when: (a) => a.customize },
      { type: "input", name: "excludeExtra", message: "Extra exclude patterns (comma-separated globs):", default: "", when: (a) => a.customize },
    ]);
    let include = existing?.include ?? [...DEFAULT_INCLUDE];
    let exclude = existing?.exclude ?? [...DEFAULT_EXCLUDE];
    if (answers.customize) {
      const inc = (answers.includeExtra ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const exc = (answers.excludeExtra ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (inc.length) include = [...new Set([...include, ...inc])];
      if (exc.length) exclude = [...new Set([...exclude, ...exc])];
    }
    const config: AgVaultConfig = { repoUrl, include, exclude, branch: existing?.branch ?? "main" };
    saveConfig(cwd, config);
    saveGlobalDefault(repoUrl);
    console.log(chalk.green("Vault initialized."));
    console.log(chalk.dim("Config: " + getConfigPath(cwd)));
    return;
  }

  const answers = await inquirer.prompt<{
    repoUrl: string;
    createRepo: boolean;
    repoName: string;
    customize: boolean;
    includeExtra: string;
    excludeExtra: string;
  }>([
    {
      type: "input",
      name: "repoUrl",
      message: "GitHub vault repo URL (HTTPS or SSH). Leave empty to create a new repo:",
      default: existing?.repoUrl ?? "",
    },
    {
      type: "confirm",
      name: "createRepo",
      message: "Create a new private repo with GitHub CLI? (requires gh and gh auth login)",
      default: true,
      when: (a) => !(a.repoUrl ?? "").trim(),
    },
    {
      type: "input",
      name: "repoName",
      message: "Repo name (e.g. my-agvault, or owner/repo-name):",
      default: "agvault",
      when: (a) => !(a.repoUrl ?? "").trim() && a.createRepo,
      validate: (v: string) => (v.trim() ? true : "Repo name is required"),
    },
    {
      type: "confirm",
      name: "customize",
      message: "Add or exclude more files/folders besides the predefined ones?",
      default: false,
    },
    {
      type: "input",
      name: "includeExtra",
      message: "Extra include patterns (comma-separated globs, e.g. notes/**/*.md, .vscode/settings.json):",
      default: "",
      when: (a) => a.customize,
    },
    {
      type: "input",
      name: "excludeExtra",
      message: "Extra exclude patterns (comma-separated globs):",
      default: "",
      when: (a) => a.customize,
    },
  ]);

  let repoUrl = (answers.repoUrl ?? "").trim();
  if (!repoUrl) {
    if (answers.createRepo && answers.repoName?.trim()) {
      if (!isGhAvailable()) {
        console.log(chalk.yellow("GitHub CLI (gh) not found. Install it from https://cli.github.com/ and run gh auth login, then run agvault init again."));
        return;
      }
      const result = createGitHubRepoByName(answers.repoName.trim());
      if (result.ok) {
        repoUrl = result.url;
        console.log(chalk.green("Created private repo: " + repoUrl));
      } else {
        console.log(chalk.yellow("Could not create repo: " + result.error));
        console.log(chalk.dim("Run gh auth login and try again, or provide a repo URL next time."));
        return;
      }
    } else {
      console.log(chalk.yellow("No repo URL provided. Run agvault init again when ready, or leave URL empty to create a new repo with GitHub CLI."));
      return;
    }
  }

  let include = existing?.include ?? [...DEFAULT_INCLUDE];
  let exclude = existing?.exclude ?? [...DEFAULT_EXCLUDE];

  if (answers.customize) {
    const inc = (answers.includeExtra ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const exc = (answers.excludeExtra ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (inc.length) include = [...new Set([...include, ...inc])];
    if (exc.length) exclude = [...new Set([...exclude, ...exc])];
  }

  const config: AgVaultConfig = {
    repoUrl,
    include,
    exclude,
    branch: existing?.branch ?? "main",
  };

  saveConfig(cwd, config);
  saveGlobalDefault(repoUrl);
  console.log(chalk.green("Vault initialized."));
  console.log(chalk.dim("Config: " + getConfigPath(cwd)));
}
