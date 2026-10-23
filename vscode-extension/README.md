# agentdrift for VS Code

A sidebar view over the last `agentdrift` run. It reads `.agentdrift/last-run.json` (written by every
CLI run) and shows the same verdict the terminal does — failed tasks first, each with the reason it
went red.

![sidebar](https://raw.githubusercontent.com/Sebitment/agentgate/main/docs/screenshot-vscode.png)

## Install

```bash
code --install-extension releases/agentdrift-vscode-0.2.0.vsix
```

Or *Extensions → `…` → Install from VSIX…*. The panel works in any folder — install the CLI in that
project (`npm i -D agentdrift`) and it is found automatically.

From source:

```bash
npm install && npm run build
```

Then open this folder in VS Code and press **F5** (Run Extension); a second window opens with the
extension loaded.

## Commands

| Command | What it does |
| --- | --- |
| `agentdrift: Run tasks` | runs the selected adapter over the task directory |
| `agentdrift: Run this task` | same, `--only <id>` (inline button on a task) |
| `agentdrift: Save baseline` | records `.agentdrift/baseline.json` (`--save-baseline`) |
| `agentdrift: Open HTML report` | opens `.agentdrift/report.html` in a webview |
| `agentdrift: Refresh` | re-reads `last-run.json` (a file watcher also does this) |

The status bar shows `n/m` passed and turns orange when anything failed.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `agentdrift.adapter` | `mock` | `mock` replays fixtures offline; `claude` runs the real Claude Code CLI |
| `agentdrift.tasks` | `tasks` | task directory, relative to the workspace root (or absolute) |
| `agentdrift.baseline` | `false` | adds `--baseline` to every run |
| `agentdrift.cliCommand` | `""` | explicit command, e.g. `node "C:/tools/agentdrift/src/cli.ts"` |

## How the CLI is found

`agentdrift.cliCommand` → `node_modules/.bin/agentdrift` → this checkout's `src/cli.ts` (only when
`package.json` says `name: "agentdrift"`) → `PATH` → `npx --yes agentdrift`. The resolution is a pure
function in `src/locate.ts` and is unit tested per platform sentinel (Windows `.cmd` shims vs POSIX).

## Why it is so small

The panel contains no testing logic. All the interesting parts — fixtures, checks, stray detection,
budgets, baselines — stay in the CLI. Keeping the panel a pure view is what makes the JSON contract
worth having: the terminal, CI and the editor read the same file and can never disagree.

## Workspace Trust

The panel declares `capabilities.untrustedWorkspaces.supported: true`, so it stays enabled in
Restricted Mode (the "受限模式" banner). Without that declaration VS Code disables any extension that
has a `main` entry point, which is the number one reason a freshly installed panel "doesn't show up".

## Test

```bash
npm test    # builds, then runs the model + locate unit tests in plain Node
```
