# Changelog

All notable changes to agentdrift. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.0 — 2026-10-23

The release that turns agentdrift from "a CLI that prints a table" into something you can put in front
of a team: a saved baseline to diff against, a self-contained HTML report you can attach to a PR, and
a VS Code panel that reads the same JSON.

### Added

- **VS Code panel** (`agentdrift-vscode-0.2.0.vsix`): sidebar tree with failed tasks first, the reason
  each one went red, an `n/m` status bar item, and the HTML report in a webview.
- **Panel settings**: `agentdrift.adapter` (`mock` / `claude`), `agentdrift.tasks`,
  `agentdrift.baseline`, `agentdrift.cliCommand`.
- **CLI auto-discovery** in the panel: setting → `node_modules/.bin/agentdrift` → this checkout →
  `PATH` → `npx`. The panel now works in any project, not just this repo.
- **`Run this task` / `Save baseline`** commands, cancellable runs with a progress notification, and
  streamed output in the `agentdrift` Output panel.
- **`--baseline` / `--save-baseline` / `--baseline-file` / `--fail-on-regression`**: record a run,
  diff the next one against it, fail CI when a task breaks, a file strays, or tokens grow > 20%.
- **`--html <file>`**: one self-contained report (inline CSS + JS, no CDN, no server) with per-task
  token bars, failing check output, stray files and baseline deltas. Good as a CI artifact.
- **`expectStdout`** on checks: assert behaviour, not just exit codes.
- **`--only <glob>`**: run a subset of tasks.
- **`.agentdrift/last-run.json`**: every run writes its results, which is what the panel reads.
- `agentdrift list` and a JSON schema contract documented in `docs/WORKFLOW.md`.

### Fixed

- The panel was silently disabled in **Restricted Mode**: extensions with a `main` entry point must
  declare `capabilities.untrustedWorkspaces.supported`. It does now.
- The `mock` adapter used to swallow a missing or malformed `mock.json` and report a clean run with
  0 tokens — a fake green. It now fails loudly.
- Running outside the repo root printed a bare `MODULE_NOT_FOUND`; it now explains what to do and
  exits 2.
- CI asserted on array positions, so adding an example silently checked the wrong row. It now looks
  tasks up by id.

### Verified

- Claude Code **2.1.308**, task `fix-sum`, 2026-10-23: checks green, 0 stray files, **50,023 tokens**,
  **$0.08**, 4.7s.
- 16 CLI unit tests + 15 extension unit tests, `tsc --noEmit` clean, offline demo reproducible in CI.

## 0.1.0 — 2026-10-23

First working version.

### Added

- CLI with `run` / `list`, adapters `mock` (offline fixtures) and `claude` (Claude Code `stream-json`).
- Task format: `tasks/<id>/{task.mjs,mock.json,repo/}`, with `allow` globs, `checks`, and `budget`.
- The pass rule: checks green **and** nothing outside `allow` **and** inside budget.
- Blast radius from `git status` on a disposable copy of the fixture, never from asking the model.
- Terminal table, `--json`, exit codes `0` / `1` / `2`.
