#!/usr/bin/env node
import { program } from "commander";
import inquirer from "inquirer";
import { runInit } from "./init.js";
import { isInitialized, getProjectRoot, addToExclude, ensurePathIncluded } from "./config.js";
import {
  collectFiles,
  listVaultFilesForProjectRemote,
  pullFromVault,
  storeToVault,
  syncVault,
  runReinit,
  clearVault,
  purgeVault,
  removeFromVault,
} from "./vault.js";
import * as out from "./output.js";

/** Project root: directory where .agvault is initialized (pull/sync copy vault/workspace here). */
const cwd = getProjectRoot();

function handleCliError(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("Invalid JSON in .agvault/config.json")) {
    out.error(msg);
    out.dim("Fix .agvault/config.json and try again. Do not run 'agvault init' or the config will be overwritten.");
  } else {
    out.error(msg);
  }
  process.exit(1);
}

program
  .name("agvault")
  .description("Wallet for project-related files in a private GitHub repo (agentic workflow)")
  .version("0.1.0")
  .option("-q, --quiet", "Suppress success and info messages (errors only)")
  .addHelpText(
    "after",
    `
Examples:
  agvault init
  agvault sync
  agvault pull --file README.md
  agvault list
  agvault list --local
  agvault add README.md
  agvault add
  agvault remove docs/notes.md
  agvault remove
`
  );

program.hook("preAction", () => {
  out.setQuiet(program.opts().quiet ?? false);
});

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
        out.error("Not initialized. Run 'agvault init' first.");
        process.exit(1);
      }
      const spinner = out.createSpinner();
      spinner.start("Verifying vault…");
      try {
        await runReinit(cwd, { onPhase: (msg) => spinner.updateText(msg) });
        spinner.succeed("Vault reinitialized.");
      } catch (e) {
        spinner.fail();
        throw e;
      }
    } catch (e) {
      handleCliError(e);
    }
  });

program
  .command("sync")
  .description("Sync with vault: pull latest into project root, merge local files, push. Vault is never stored on disk.")
  .option("--json", "Output result as JSON { pulled, stored }")
  .action(async (opts: { json?: boolean }) => {
    try {
      if (!isInitialized(cwd)) {
        out.error("Not initialized. Run 'agvault init' first.");
        process.exit(1);
      }
      const spinner = out.createSpinner();
      spinner.start("Syncing…");
      let result: { pulled: number; stored: number };
      try {
        result = await syncVault(cwd, { onPhase: (msg) => spinner.updateText(msg) });
        if (opts.json) {
          spinner.stop();
          console.log(JSON.stringify(result));
        } else {
          spinner.succeed(`Synced: pulled ${result.pulled} file(s), stored ${result.stored} file(s).`);
        }
      } catch (e) {
        spinner.fail();
        throw e;
      }
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
          out.dim("Not initialized. Running init...");
          await runInit(cwd);
          if (!isInitialized(cwd)) {
            out.error("Init did not complete. Run 'agvault init' then 'agvault pull'.");
            process.exit(1);
          }
        } else {
          out.error("Not initialized. Run 'agvault init' first.");
          process.exit(1);
        }
      }
      const spinner = out.createSpinner();
      spinner.start("Cloning vault…");
      let n: number;
      try {
        n = await pullFromVault(cwd, opts.file, { onPhase: (msg) => spinner.updateText(msg) });
        spinner.succeed("Pulled " + n + " file(s) from vault.");
      } catch (e) {
        spinner.fail();
        throw e;
      }
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
        out.error("Not initialized. Run 'agvault init' first.");
        process.exit(1);
      }
      const spinner = out.createSpinner();
      spinner.start("Cloning vault…");
      let n: number;
      try {
        n = await storeToVault(cwd, { onPhase: (msg) => spinner.updateText(msg) });
        spinner.succeed("Stored " + n + " file(s) in vault.");
      } catch (e) {
        spinner.fail();
        throw e;
      }
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
        out.error("Not initialized. Run 'agvault init' first.");
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
          out.dim("Cancelled.");
          return;
        }
        const spinner = out.createSpinner();
        spinner.start("Cloning vault…");
        try {
          await purgeVault(cwd, { onPhase: (msg) => spinner.updateText(msg) });
          spinner.succeed("Vault purged (all projects removed from remote).");
        } catch (e) {
          spinner.fail();
          throw e;
        }
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
        out.dim("Cancelled.");
        return;
      }
      clearVault(cwd);
      out.success("Cleaned.");
    } catch (e) {
      handleCliError(e);
    }
  });

program
  .command("list")
  .description("List files stored in the vault for this project only, or list files that would be collected (--local).")
  .option("-l, --local", "List files that would be collected from current project (include patterns)")
  .option("--json", "Output as JSON (array of paths)")
  .action(async (opts: { local?: boolean; json?: boolean }) => {
    try {
      if (opts.local) {
        if (!isInitialized(cwd)) {
          out.error("Not initialized. Run 'agvault init' first.");
          process.exit(1);
        }
        const files = await collectFiles(cwd);
        const paths = files.map((f) => f.relativePath);
        if (opts.json) {
          console.log(JSON.stringify(paths));
          return;
        }
        if (paths.length === 0) out.dim("No files match include patterns.");
        else out.printTable(["Path"], paths.map((p) => [p]));
        return;
      }
      if (!isInitialized(cwd)) {
        out.error("Not initialized. Run 'agvault init' first.");
        process.exit(1);
      }
      const spinner = out.createSpinner();
      spinner.start("Listing vault…");
      let names: string[];
      try {
        names = await listVaultFilesForProjectRemote(cwd, { onPhase: (msg) => spinner.updateText(msg) });
        if (opts.json) {
          spinner.stop();
          console.log(JSON.stringify(names));
          return;
        }
        spinner.succeed("Listed vault.");
      } catch (e) {
        spinner.fail();
        throw e;
      }
      if (names.length === 0) out.dim("No files in vault for this project.");
      else out.printTable(["Path"], names.map((n) => [n]));
    } catch (e) {
      handleCliError(e);
    }
  });

program
  .command("remove [path]")
  .description("Remove a file from the vault and add it to exclude. Without path, show a list to choose from.")
  .action(async (pathArg: string | undefined) => {
    try {
      if (!isInitialized(cwd)) {
        out.error("Not initialized. Run 'agvault init' first.");
        process.exit(1);
      }
      let paths: string[] = [];
      if (pathArg?.trim()) {
        paths = [pathArg.trim().replace(/\\/g, "/")];
      } else {
        const spinner = out.createSpinner();
        spinner.start("Listing vault…");
        let inVault: string[];
        try {
          inVault = await listVaultFilesForProjectRemote(cwd, { onPhase: (msg) => spinner.updateText(msg) });
          spinner.succeed("Listed vault.");
        } catch (e) {
          spinner.fail();
          throw e;
        }
        if (inVault.length === 0) {
          out.dim("No files in vault for this project to remove.");
          return;
        }
        const { selected } = await inquirer.prompt<{ selected: string }>([
          {
            type: "list",
            name: "selected",
            message: "Choose a file to remove from the vault:",
            choices: inVault,
          },
        ]);
        paths = [selected];
      }
      for (const p of paths) addToExclude(cwd, p);
      const spinner = out.createSpinner();
      spinner.start("Removing from vault…");
      try {
        await removeFromVault(cwd, paths, { onPhase: (msg) => spinner.updateText(msg) });
        spinner.succeed("Removed " + paths.length + " file(s) from vault and added to exclude.");
      } catch (e) {
        spinner.fail();
        throw e;
      }
    } catch (e) {
      handleCliError(e);
    }
  });

program
  .command("add [path]")
  .description("Add a file to the vault (include and store). Without path, show a list of addable files to choose from.")
  .action(async (pathArg: string | undefined) => {
    try {
      if (!isInitialized(cwd)) {
        out.error("Not initialized. Run 'agvault init' first.");
        process.exit(1);
      }
      if (pathArg?.trim()) {
        const path = pathArg.trim().replace(/\\/g, "/");
        ensurePathIncluded(cwd, path);
        const spinner = out.createSpinner();
        spinner.start("Storing in vault…");
        try {
          await storeToVault(cwd, { onPhase: (msg) => spinner.updateText(msg) });
          spinner.succeed("Added and stored " + path + " in vault.");
        } catch (e) {
          spinner.fail();
          throw e;
        }
        return;
      }
      const [collected, inVault] = await Promise.all([
        collectFiles(cwd),
        (async () => {
          const spinner = out.createSpinner();
          spinner.start("Listing vault…");
          try {
            const list = await listVaultFilesForProjectRemote(cwd, { onPhase: (msg) => spinner.updateText(msg) });
            spinner.succeed("Listed vault.");
            return list;
          } catch (e) {
            spinner.fail();
            throw e;
          }
        })(),
      ]);
      const inVaultSet = new Set(inVault);
      const candidates = collected.map((f) => f.relativePath).filter((p) => !inVaultSet.has(p));
      if (candidates.length === 0) {
        out.dim("All included files are already in the vault.");
        return;
      }
      const { selected } = await inquirer.prompt<{ selected: string }>([
        {
          type: "list",
          name: "selected",
          message: "Choose a file to add to the vault:",
          choices: candidates,
        },
      ]);
      const spinner = out.createSpinner();
      spinner.start("Storing in vault…");
      try {
        await storeToVault(cwd, { onPhase: (msg) => spinner.updateText(msg) });
        spinner.succeed("Stored selected file(s) in vault.");
      } catch (e) {
        spinner.fail();
        throw e;
      }
    } catch (e) {
      handleCliError(e);
    }
  });

program.parse();
