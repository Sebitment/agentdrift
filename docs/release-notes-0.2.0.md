## agentdrift v0.2.0 — the VS Code panel

agentdrift treats a coding-agent run like a build artifact: hand it a task on a fixture repo, then diff
what it **spent** and what it **touched**. Blow the token budget, edit files you never mentioned, or
break a test — the run goes red before it reaches `main`.

```text
TASK          RESULT  TOKENS   COST  TIME  STRAY
────────────  ──────  ───────  ────  ────  ─────
fix-sum       pass    8,840~   -     1ms   0
rename-greet  pass    9,880~   -     2ms   0
vague-bug     pass    11,580~  -     1ms   0

3/3 passed  ·  30,300 tokens  ·  0 stray files  ·  4ms
```

### Install

**CLI** (Node 22.18+, zero runtime dependencies):

```bash
npm i -D github:Sebitment/agentdrift#v0.2.0
npx agentdrift run --adapter mock      # offline, no API key
```

Install from GitHub rather than npm: the package is not published to the registry yet, and the git
install ships the compiled `dist/` so there is no build step on your side.

**Panel** — download `agentdrift-vscode-0.2.0.vsix` below, then:

```bash
code --install-extension agentdrift-vscode-0.2.0.vsix
```

### What's new

- **VS Code panel** — failed tasks first, each with the reason it went red (stray / over budget /
  failed check), `n/m` in the status bar, and the HTML report in a webview.
- **Works in any project** — the panel finds the CLI via your setting, `node_modules/.bin`,
  this checkout, `PATH`, or `npx`. Settings: `agentdrift.adapter`, `.tasks`, `.baseline`, `.cliCommand`.
- **`--html report.html`** — one self-contained file, no CDN and no server; drop it in CI artifacts or
  a PR comment. Dark/light follows the OS.
- **Baselines** — `--save-baseline`, then `--baseline --fail-on-regression`: a task that used to pass
  and now fails, a new stray file, or tokens up more than 20% all break the build.
- **`expectStdout`** — assert behaviour, not just the exit code, so "it ran" is never mistaken for
  "it was fixed".

### Fixed

- Panel no longer gets silently disabled in Restricted Mode (`capabilities.untrustedWorkspaces`).
- The `mock` adapter no longer turns a broken `mock.json` into a fake green run.
- Running outside the repo root now explains itself instead of printing `MODULE_NOT_FOUND`.

### Verified, not just wired up

Claude Code **2.1.308**, task `fix-sum`: checks green, 0 stray files, **50,023 tokens**, **$0.08**,
4.7s. 16 CLI tests, 15 extension tests, `tsc` clean.

**Full changelog:** [CHANGELOG.md](CHANGELOG.md)

---

### 中文

**v0.2.0：带上 VS Code 面板。** 侧边栏里能看到每次运行的结果（失败在前 + 失败原因 + 状态栏 `n/m`），
点任务直接打开 HTML 报告；面板能在**任意项目**里用，自动找 `node_modules/.bin` 里的 CLI。
这版还加了基线对比（`--save-baseline` / `--baseline --fail-on-regression`）和单文件 HTML 报告。

安装：

```bash
npm i -D github:Sebitment/agentdrift#v0.2.0                      # CLI
code --install-extension agentdrift-vscode-0.2.0.vsix           # 面板
```
