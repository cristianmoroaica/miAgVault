# Git documentation for agvault

This document describes how to use Git with the **agvault** project: workflow, conventions, and how Git interacts with the vault.

---

## Table of contents

1. [Repository overview](#repository-overview)
2. [Getting started](#getting-started)
3. [Branching strategy](#branching-strategy)
4. [Commit conventions](#commit-conventions)
5. [What to commit and ignore](#what-to-commit-and-ignore)
6. [Daily workflow](#daily-workflow)
7. [agvault and Git](#agvault-and-git)
8. [Common Git tasks](#common-git-tasks)
9. [Contributing changes](#contributing-changes)
10. [Troubleshooting](#troubleshooting)

---

## Repository overview

- **Main branch:** `main` (default). Stable, releasable code.
- **Remotes:** `origin` points to the canonical GitHub repository.
- **Build output:** TypeScript compiles to `dist/`. Commit source (`src/`), not `dist/`; it is ignored and built via `npm run build`.

---

## Getting started

### Clone the repository

```bash
git clone https://github.com/<owner>/agentic_wallet.git
cd agentic_wallet
```

Or with SSH:

```bash
git clone git@github.com:<owner>/agentic_wallet.git
cd agentic_wallet
```

### Install dependencies and build

```bash
npm install
npm run build
```

### Verify Git is configured

```bash
git config user.name   # Your name
git config user.email  # Your email (used in commits)
```

Set globally if needed:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

---

## Branching strategy

| Branch type   | Naming              | Purpose                          |
|---------------|---------------------|----------------------------------|
| Main          | `main`              | Stable, production-ready code    |
| Feature       | `feature/<name>`    | New features (e.g. `feature/add-store-dry-run`) |
| Bugfix        | `fix/<name>`        | Bug fixes (e.g. `fix/pull-empty-dir`) |
| Docs / chores | `docs/<name>` or `chore/<name>` | Documentation, tooling, config |

- Create a branch from an up-to-date `main` for each logical change.
- Keep branches short-lived and focused; merge via pull request when ready.

### Creating a branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

---

## Commit conventions

### Message format

Use clear, imperative messages. Optionally prefix with a type:

```
<type>: <short description>

[optional body]
```

**Types (optional):** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`.

**Examples:**

- `feat: add --dry-run to store command`
- `fix: handle missing vault repo on first store`
- `docs: add Git workflow section to GIT.md`
- `chore: bump simple-git to 3.27.0`

### Good practices

- **One logical change per commit** – easier to review and revert.
- **Describe what and why** – not only “fix” or “update.”
- **Keep first line under ~72 characters** – add detail in the body if needed.

---

## What to commit and ignore

### Committed

- Source code: `src/**/*.ts`
- Config: `package.json`, `tsconfig.json`, `README.md`, `docs/**`
- Project config: `.agvault/config.json` (if you want vault settings in the repo; often project-specific)

### Ignored (see `.gitignore`)

| Path / pattern           | Reason |
|--------------------------|--------|
| `node_modules/`          | Dependencies; install with `npm install` |
| `dist/`                  | Build output; produced by `npm run build` |
| `*.log`                  | Log files |
| `.env`, `.env.local`     | Secrets and local env |
| `.agvault.local.json`    | Local overrides; may contain sensitive data |

Do **not** commit:

- API tokens, passwords, or keys
- Machine-specific paths or local-only config
- Build artifacts or dependencies

---

## Daily workflow

### 1. Start from a clean state

```bash
git status          # see modified/untracked files
git checkout main
git pull origin main
```

### 2. Work on a branch

```bash
git checkout -b feature/my-change
# edit files, run tests, build
npm run build
```

### 3. Stage and commit

```bash
git add src/cli.ts docs/GIT.md   # or git add -A for all
git status                       # confirm what will be committed
git commit -m "feat: add --dry-run to store"
```

### 4. Push and open a pull request

```bash
git push -u origin feature/my-change
```

Then open a Pull Request on GitHub from `feature/my-change` into `main`.

### 5. After merge

```bash
git checkout main
git pull origin main
git branch -d feature/my-change  # delete local branch
```

---

## agvault and Git

### How agvault uses Git

- agvault uses Git only in **temporary directories**: clone → copy or push → delete. No long-lived clone of the vault is kept on disk.
- The **project repo** (agentic_wallet) is a normal Git repo; you use Git as described in this document for the project itself.

### Vault vs project repo

| Repo              | Purpose                          | Where it lives        |
|-------------------|-----------------------------------|------------------------|
| **Project repo**  | agvault source code               | Your workspace, normal Git clone |
| **Vault repo**    | User-curated files (docs, rules)  | GitHub only; temp clone per command |

### .agvault and version control

- **`.agvault/config.json`** – vault URL and include/exclude patterns. Committing it is optional; if you do, others get the same vault config.
- **`.agvault/`** is **excluded from the vault** by default (see README), so vault sync does not push project `.agvault` into the vault repo.
- **`.agvault.local.json`** is in `.gitignore`; never commit it (local overrides, possibly sensitive).

### Safe to run in a Git repo

All agvault commands are safe to run inside the agentic_wallet Git repo:

- `agvault init` – writes only `.agvault/config.json`.
- `agvault pull` / `store` / `sync` – operate on vault content and temp clones, not on your project’s `.git` history.

---

## Common Git tasks

### Undo last commit (keep changes)

```bash
git reset --soft HEAD~1
```

### Discard local changes in a file

```bash
git checkout -- path/to/file
# or
git restore path/to/file
```

### Stash work temporarily

```bash
git stash push -m "WIP: store dry-run"
# later
git stash list
git stash pop
```

### Update branch with latest main

```bash
git fetch origin
git rebase origin/main
# or merge: git merge origin/main
```

### View history

```bash
git log --oneline -10
git log -p path/to/file
```

### See what would be committed

```bash
git status
git diff
git diff --staged
```

---

## Contributing changes

1. **Fork** the repository (if you don’t have write access).
2. **Clone** your fork and add upstream:
   ```bash
   git remote add upstream https://github.com/<owner>/agentic_wallet.git
   ```
3. **Branch** from `main`, make changes, commit with clear messages.
4. **Push** to your fork and open a **Pull Request** to `main`.
5. **Sync** with upstream before updating your PR:
   ```bash
   git fetch upstream
   git rebase upstream/main
   git push --force-with-lease
   ```

---

## Troubleshooting

### “Your branch is behind ‘origin/main’”

```bash
git pull origin main
# if you have local commits: git pull --rebase origin main
```

### Merge conflicts

1. Open conflicted files and resolve `<<<<<<<`, `=======`, `>>>>>>>` markers.
2. Stage and continue:
   ```bash
   git add path/to/file
   git rebase --continue   # or git merge --continue
   ```

### Accidentally committed secrets

- **Do not** push. Remove the secret from the last commit:
  ```bash
  git reset --soft HEAD~1
  # remove secret from file, then re-commit
  ```
- If already pushed, rotate the secret immediately and consider using `git filter-repo` or BFG to remove it from history (advanced).

### Wrong branch

```bash
# committed on main by mistake
git branch feature/my-change   # create branch with current commit
git reset --hard origin/main   # reset main to match remote
git checkout feature/my-change
```

### Clean untracked and ignored files

```bash
git clean -fd -n   # dry run
git clean -fd     # remove untracked files and directories
```

---

## Quick reference

| Task              | Command |
|-------------------|--------|
| Clone             | `git clone <url>` |
| Create branch     | `git checkout -b feature/name` |
| Stage all         | `git add -A` |
| Commit            | `git commit -m "message"` |
| Push branch       | `git push -u origin feature/name` |
| Pull latest main  | `git pull origin main` |
| Rebase on main    | `git fetch origin && git rebase origin/main` |
| Stash             | `git stash` / `git stash pop` |
| View status       | `git status` |
| View diff         | `git diff` / `git diff --staged` |

For more details, see [Pro Git](https://git-scm.com/book/en/v2) or `git --help`.
