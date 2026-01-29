#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { runInit } from "./init.js";
import { isInitialized, getProjectRoot } from "./config.js";
import {
  collectFiles,
  listVaultFilesRemote,
  pullFromVault,
  storeToVault,
  syncVault,
  runReinit,
  clearVault,
  purgeVault,
} from "./vault.js";

/** Project root: directory where .agvault is initialized (pull/sync copy vault/workspace here). */
const cwd = getProjectRoot();

function handleCliError(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("Invalid JSON in .agvault/config.json")) {
    console.error(chalk.red(msg));
    console.error(chalk.dim("Fix .agvault/config.json and try again. Do not run 'agvault init' or the config will be overwritten."));
  } else {
    console.error(chalk.red(msg));
  }
  process.exit(1);
}

program
  .name("agvault")
  .description("Wallet for project-related files in a private GitHub repo (agentic workflow)")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize vault in current folder. Asks for repo URL and optional include/exclude patterns.")
  .action(async () => {
    try {
      await runInit(cwd);
    } catch (e) {
      handleCliError(e);
    }
  });

program
  .command("reinit")
  .description("Repair vault state when init worked but something failed (missing remote branch, initial commit, etc.).")
  .action(async () => {
    try {
      if (!isInitialized(cwd)) {
        console.error(chalk.red("Not initialized. Run 'agvault init' first."));
        process.exit(1);
      }
      await runReinit(cwd);
      console.log(chalk.green("Vault reinitialized."));
    } catch (e) {
      handleCliError(e);
    }
  });

program
  .command("sync")
  .description("Sync with vault: pull latest into project root, merge local files, push. Vault is never stored on disk.")
  .action(async () => {
    try {
      if (!isInitialized(cwd)) {
        console.error(chalk.red("Not initialized. Run 'agvault init' first."));
        process.exit(1);
      }
      const { pulled, stored } = await syncVault(cwd);
      console.log(chalk.green(`Synced: pulled ${pulled} file(s), stored ${stored} file(s).`));
    } catch (e) {
      handleCliError(e);
    }
  });

program
  .command("pull")
  .description("Pull from vault into project root (clone to temp, copy files, delete temp). Use --file to pull specific files only.")
  .option("-f, --file <paths...>", "Pull only these files (paths relative to vault)")
  .option("--init-if-missing", "Run init interactively if not initialized", true)
  .action(async (opts: { file?: string[]; initIfMissing?: boolean }) => {
    try {
      if (!isInitialized(cwd)) {
        if (opts.initIfMissing !== false) {
          console.log(chalk.dim("Not initialized. Running init..."));
          await runInit(cwd);
          if (!isInitialized(cwd)) {
            console.error(chalk.red("Init did not complete. Run 'agvault init' then 'agvault pull'."));
            process.exit(1);
          }
        } else {
          console.error(chalk.red("Not initialized. Run 'agvault init' first."));
          process.exit(1);
        }
      }
      const n = await pullFromVault(cwd, opts.file);
      console.log(chalk.green("Pulled " + n + " file(s) from vault."));
    } catch (e) {
      handleCliError(e);
    }
  });

program
  .command("store")
  .description("Store configured files in the vault (clone to temp, copy, push, delete temp). Vault is never stored on disk.")
  .action(async () => {
    try {
      if (!isInitialized(cwd)) {
        console.error(chalk.red("Not initialized. Run 'agvault init' first."));
        process.exit(1);
      }
      const n = await storeToVault(cwd);
      console.log(chalk.green("Stored " + n + " file(s) in vault."));
    } catch (e) {
      handleCliError(e);
    }
  });

program
  .command("clean")
  .description("Remove legacy .agvault/repo if present. Use --purge to delete all projects from the vault (remote). Prompts for confirmation.")
  .option("--purge", "Delete all projects from the vault (remote); commits and pushes")
  .action(async (opts: { purge?: boolean }) => {
    try {
      if (!isInitialized(cwd)) {
        console.error(chalk.red("Not initialized. Run 'agvault init' first."));
        process.exit(1);
      }
      if (opts.purge) {
        const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: "confirm",
            name: "confirm",
            message: "This will delete ALL projects from the vault (remote). This cannot be undone. Continue?",
            default: false,
          },
        ]);
        if (!confirm) {
          console.log(chalk.dim("Cancelled."));
          return;
        }
        await purgeVault(cwd);
        console.log(chalk.green("Vault purged (all projects removed from remote)."));
        return;
      }
      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
        {
          type: "confirm",
          name: "confirm",
          message: "Remove legacy .agvault/repo if present? (Vault is normally temp-only; nothing to clear.)",
          default: false,
        },
      ]);
      if (!confirm) {
        console.log(chalk.dim("Cancelled."));
        return;
      }
      clearVault(cwd);
      console.log(chalk.green("Cleaned."));
    } catch (e) {
      handleCliError(e);
    }
  });

program
  .command("list")
  .description("List files in the vault (clone to temp, list, delete) or list files that would be collected (--local).")
  .option("-l, --local", "List files that would be collected from current project (include patterns)")
  .action(async (opts: { local?: boolean }) => {
    try {
      if (opts.local) {
        if (!isInitialized(cwd)) {
          console.error(chalk.red("Not initialized. Run 'agvault init' first."));
          process.exit(1);
        }
        const files = await collectFiles(cwd);
        if (files.length === 0) console.log(chalk.dim("No files match include patterns."));
        else files.forEach((f) => console.log(f.relativePath));
        return;
      }
      if (!isInitialized(cwd)) {
        console.error(chalk.red("Not initialized. Run 'agvault init' first."));
        process.exit(1);
      }
      const names = await listVaultFilesRemote(cwd);
      if (names.length === 0) console.log(chalk.dim("Vault is empty."));
      else names.forEach((n) => console.log(n));
    } catch (e) {
      handleCliError(e);
    }
  });

program.parse();
