# What agentdrift works with

Short version: agentdrift is not a model and not an IDE plugin. It is a **CLI that drives another
CLI** — the coding agent — and measures the run. Anything that can run a shell command can use it;
anything that can edit files in a repo can be measured.

## Support matrix

| Piece | Status | Notes |
|---|---|---|
| **Agent: Claude Code CLI** | ✅ adapter `claude` | Verified end-to-end on 2.1.308 (Windows). Collects real tokens and `total_cost_usd`. |
| **Agent: mock** | ✅ adapter `mock` | Offline, deterministic, no API key. Used by the demo and by CI. |
| **Agent: Codex CLI** | ⛔ not yet | Same contract; one file, ~60 lines. |
| **Agent: Gemini CLI** | ⛔ not yet | Same contract. |
| **Agent: Cursor CLI / Qwen Code / Aider / OpenHands** | ⛔ not yet | Same contract, if the CLI can print usage. |
| **OS** | ✅ Windows, macOS, Linux | Windows 10/11 verified locally; POSIX covered by CI. |
| **Node** | ✅ 22.18+, 24 | Uses native TypeScript type stripping, so there is no build step when you run from source. |
| **Terminal** | ✅ any | PowerShell, cmd, bash, zsh — it is a plain command. |
| **Editor** | ✅ any editor with a terminal | VS Code, Cursor, JetBrains, Zed: run it in the integrated terminal. |
| **VS Code panel** | ✅ `releases/agentdrift-vscode-0.2.0.vsix` | Renders `last-run.json`, runs the CLI, opens the HTML report. Also works in Cursor/Windsurf (VS Code compatible). |
| **CI** | ✅ GitHub Actions | Workflow included: `save-baseline` → `--baseline --fail-on-regression`. The agent CLI must be installed and authenticated in the runner. |

## Which AI models

The adapter does not pick the model — the agent CLI does. agentdrift measures whatever that CLI runs:

| CLI | Models it can drive |
|---|---|
| `claude` | Claude Sonnet / Opus / Haiku (whatever `ANTHROPIC_MODEL` or the CLI config says) |
| `codex` | GPT-5 family |
| `gemini` | Gemini 2.x |
| `qwen` | Qwen Coder |
| local | Ollama / vLLM, if the CLI talks to them |

Token numbers come from the CLI's own usage events (`message.usage.input_tokens` etc.). When a CLI
does not report usage, agentdrift estimates from characters and marks the number with `~`, and the
report keeps measured and estimated values in separate columns. **It never invents a number.**

## What it does

| Step | What happens |
|---|---|
| Fixture | Copies `tasks/<id>/repo/` into an isolated work dir, `git init`, commits the baseline |
| Run | Asks the agent to do `task.prompt` in that copy |
| Outcome | Runs the task's `checks` (plain shell commands); compares **exit code and stdout**, never an LLM verdict |
| Cost | Sums tokens and `$` from the CLI's usage stream |
| Blast radius | `git status` after the run; files outside `allow` are strays |
| Verdict | `pass` = checks green ∧ no stray ∧ inside budget. Otherwise the failing reason is printed |
| Report | Terminal table, `--json`, self-contained `--html`, `.agentdrift/last-run.json` for the panel |
| Drift | `--save-baseline` then `--baseline`: `pass → FAIL`, new strays, tokens up more than 20% |

## What it does **not** do

- It does not judge code quality with an LLM — that is not reproducible, so it is out of scope.
- It does not write your tests; `checks` are commands you already trust.
- It does not replace unit tests. It tests the **agent**, not your app.
- It does not rank models against each other (no leaderboard, no dataset).
- It does not host anything: no server, no account, no telemetry.

## Adding an adapter

An adapter is one file implementing three members:

```ts
export interface Adapter {
  id: string
  detect(): Promise<{ ok: boolean; version?: string }>   // is the CLI installed?
  run(ctx: RunContext): Promise<RunResult>              // run once, report usage
}
```

`RunContext` gives you `{ cwd, taskDir, prompt, timeoutMs }`; `RunResult` wants
`{ exitCode, usage: { inputTokens, outputTokens, usd?, estimated? }, transcript, durationMs }`.

Reference implementation: [`src/adapters/claude.ts`](../src/adapters/claude.ts) — it shells out to
`claude --print --output-format stream-json --verbose --permission-mode acceptEdits`, feeds the
prompt on **stdin** (no shell escaping), and sums `usage` events line by line. For a CLI that only
prints a final token count, parse the last line; for one that prints nothing, set
`usage.estimated = true` and derive from `transcript.length / 4`.

Then register it in [`src/cli.ts`](../src/cli.ts) next to `mock` and `claude`, add a task fixture,
and the panel, `--json`, `--html` and baselines all work unchanged.

---

## 中文概要

- **它是什么**：一个命令行工具，不是 AI、不是编辑器插件。它去"指挥"别的 AI 编程命令行（今天支持 Claude Code 和 mock 假人），跑完后量三件事：任务做成了没有、花了多少 token、有没有改到你没允许的文件。
- **适用软件**：任何有终端的编辑器（VS Code / Cursor / JetBrains / Zed），也可以在 CI（GitHub Actions）里当门禁；另附一个 VS Code 侧边栏面板（装 `releases` 里的 vsix）。
- **适用 AI**：由被调用的 CLI 决定——Claude Code 用 Claude 系列，Codex CLI 用 GPT-5，Gemini CLI 用 Gemini。工具只负责读取 CLI 报告的用量，读不到就按字符估算并标 `~`。
- **还没支持的**：Codex / Gemini / Qwen 等 CLI 需要各写一个约 60 行的适配器，接口在本文"Adding an adapter"一节。
- **作用**：把"AI 说它做完了"变成"有证据证明它做完了、没搞坏别的、也没越来越贵"，并在 CI 里拦住退化。
- **不做的**：不评代码好坏（不调 LLM 打分）、不写测试、不做模型排行榜、不上传任何数据。
