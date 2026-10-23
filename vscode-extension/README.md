# agentdrift for VS Code

A sidebar view over the last `agentdrift` run. It reads `.agentdrift/last-run.json` (written by every
CLI run) and shows the same verdict the terminal does — failed tasks first, each with the reason it
went red.

![sidebar](https://raw.githubusercontent.com/Sebitment/agentgate/main/docs/screenshot-vscode.png)

## Run it

```bash
npm install
npm run build
```

Then open this repository in VS Code and press **F5** (Run Extension). A second VS Code window opens
with the extension loaded; the agentdrift icon sits in the activity bar.

## Commands

| Command | What it does |
| --- | --- |
| `agentdrift: Run tasks` | runs `node src/cli.ts run --adapter mock` in the workspace root |
| `agentdrift: Open HTML report` | opens `.agentdrift/report.html` in a webview |
| `agentdrift: Refresh` | re-reads `last-run.json` (a file watcher also does this automatically) |

The status bar shows `n/m` passed and turns orange when anything failed.

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
npm test    # builds, then runs the model unit tests in plain Node
```
