# agvault

A **wallet** for project-related files and folders that you don’t want in the main repo but need for agentic workflow (e.g. user-curated docs, rules, notes). Files are stored in a **private GitHub repo** and can be brought into any workspace with a single command.

- Run **in any folder** (project/workspace).
- **User-curated** include/exclude patterns (defaults: `.md`, `.mdc`, `.cursor/**`, `docs/**`, etc.).
- **GitHub** as backend: clone to a temp dir, copy only needed files to your project root, then delete the temp dir—vault data is never left on disk.

## Setup

1. **Install** agvault globally:

```bash
npm i -g agvault
```

2. **(Optional)** Create a private GitHub repo in advance, or let agvault create it (see below).

3. In any project where you want the vault:

```bash
cd /path/to/your/project
agvault init
```

Follow the prompts: enter the vault repo URL (HTTPS or SSH) and optionally add/remove include/exclude patterns.

**Global default vault:** After you set or create a vault once (with `gh` logged in), agvault stores it in `~/.agvault/default.json`. In new projects, `agvault init` will use that vault automatically and only ask about include/exclude patterns—no repo URL prompt again.

**Repo name already exists:** If you choose to create a new repo and the name (e.g. `agvault`) already exists on your account, agvault uses that existing repo as the vault destination instead of failing.

**No local vault:** The vault is never stored on disk. Each pull/store/sync clones the repo into a temp directory, copies only the needed files into your project root (or pushes from temp), then deletes the temp dir.

## Commands

| Command | Description |
|--------|-------------|
| `agvault init` | Initialize vault in the current folder. Asks for repo URL and optional extra include/exclude patterns (on top of defaults). |
| `agvault sync` | Pull latest into project root (temp clone → copy → delete), then merge local files and push (temp clone → push → delete). |
| `agvault pull` | Clone vault to temp, copy vault/workspace files into project root, delete temp. Use `--file` to pull specific files only. |
| `agvault store` | Clone vault to temp, copy project files into vault/workspace, commit & push, delete temp. |
| `agvault list` | List files in the vault (clone to temp, list, delete). Use `--local` to list files that would be collected. |

### Examples

```bash
# First time in a project
agvault init
# Enter: https://github.com/you/agvault-repo.git
# Optionally add more patterns or exclusions

# Pull vault contents into this project (clone to temp, copy to root, delete temp)
agvault pull

# Pull only specific files
agvault pull --file README.md docs/notes.md

# Store current project’s matched files into the vault
agvault store

# Two-way sync: pull, merge local files, push
agvault sync

# See what’s in the vault or what would be stored
agvault list
agvault list --local
```

## Default include / exclude

**Included** by default (glob patterns):

- `**/*.md`, `**/*.mdc`, `*.md`
- `.cursor/**`, `.cursorrules`
- `docs/**`

**Excluded** by default:

- `node_modules/**`, `.git/**`, `dist/**`, `build/**`, `.agvault/**`

You can add or remove patterns during `agvault init` or by editing `.agvault/config.json`.

## Config location

- Config file: `.agvault/config.json`
- Vault is **temp-only**: no persistent clone; each command uses a temp dir that is deleted after use.

File types are not limited to `.md`/`.mdc`; include any globs you need (e.g. `.vscode/settings.json`, `notes/**`).

## Creating the repo automatically

If the vault URL you give during `agvault init` points to a **repo that doesn’t exist yet**:

1. **Clone** will fail → agvault creates the vault **locally** with `git init`, a `vault/` folder, and the remote set to your URL.
2. On first **`agvault store`** (or **`agvault sync`**), **push** will fail → agvault can create the repo on GitHub if you have the [GitHub CLI](https://cli.github.com/) installed and logged in:
   - Run `gh auth login`, then run `agvault store` again.
   - agvault will run `gh repo create owner/repo --private --source <temp-dir> --push` for you (temp dir is deleted after push).
3. If you don’t use `gh`, create the repo manually at [github.com/new](https://github.com/new) (private), then run `agvault store` again.

So you can run `agvault init` with a URL like `https://github.com/you/my-agvault.git` even when the repo doesn’t exist yet; the first store/sync will create it (via `gh`) or prompt you to create it and retry.

## Documentation

- **[Git workflow and conventions](docs/GIT.md)** — branching, commits, daily workflow, and how agvault interacts with Git.

## Requirements

- Node.js 18+
- Git
- A private GitHub repo for the vault (create it yourself or let agvault create it via GitHub CLI)

**Developing from source:** Clone the repo, then `npm install && npm run build && npm link` to use your local build as the `agvault` command.
