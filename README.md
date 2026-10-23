# agentgate

**Regression tests for coding agents.**

You test your code. You don't test what the agent does to it.

agentgate treats an agent run like a build artifact: hand it a task on a fixture repo, then diff
what it *spent* and what it *touched*. If it blows the token budget, edits files you never
mentioned, or breaks a test, the run goes red — before it reaches `main`.

```
TASK          RESULT  TOKENS   COST  TIME  STRAY
────────────  ──────  ───────  ────  ────  ─────
fix-sum       pass    8,840~   -     1ms   0
rename-greet  pass    9,880~   -     2ms   0
vague-bug     pass    11,580~  -     1ms   0

3/3 passed  ·  30,300 tokens  ·  0 stray files  ·  4ms
```

```
TASK              RESULT  TOKENS   COST  TIME  STRAY
────────────────  ──────  ───────  ────  ────  ─────
green-but-broken  FAIL    135~     -     1ms   0

0/1 passed  ·  135 tokens  ·  0 stray files  ·  1ms

green-but-broken
  check failed: café survives
    stdout "caf-au-lait", expected "café-au-lait"
```

```
TASK         RESULT  TOKENS   COST  TIME  STRAY
───────────  ──────  ───────  ────  ────  ──────────────
scope-creep  FAIL    13,920~  -     2ms   1 package.json

0/1 passed  ·  13,920 tokens  ·  1 stray files  ·  2ms

scope-creep
  files outside allow: package.json
```

## Why another agent tool

Most agent benchmarks answer *"can the model solve this task?"*. They don't answer the two things
that actually hurt in daily use:

1. **It cost how much?** A run that passes but burns 300k tokens is a regression.
2. **It changed what?** A one-line fix that rewrites `package.json` and three unrelated files is a
   bug in the agent, and nobody notices because the tests still pass.

agentgate is a **gate**, not a leaderboard: it runs your own fixtures in CI, against the agent you
actually use.

## How it works

```
tasks/<id>/
  task.mjs   what to ask + how to verify
  mock.json  canned agent behaviour (offline adapter)
  repo/      the fixture repo the agent gets to edit
```

For every task:

1. copy `repo/` into `.agentgate/work/<id>/` and `git init` + commit a baseline
2. hand `prompt` to the adapter
3. `git status` → files touched; anything outside `allow` is a **stray**
4. run `checks` (plain shell commands) → pass/fail
5. compare token usage against `budget`

A task passes only when the checks pass, nothing strayed, and the budget held.

> The full pipeline, the pass rule, the module boundaries and the "how do I add a task / adapter /
> metric" recipes live in [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Tracking drift

A gate is only useful if it says *when* things got worse. Save a run, compare the next one against it:

```bash
node src/cli.ts run --adapter mock --save-baseline                  # record today
node src/cli.ts run --adapter claude --baseline                     # compare tomorrow
node src/cli.ts run --adapter claude --baseline --fail-on-regression  # ...and fail CI on drift
```

```
vs baseline 2026-10-23 10:05:55 (mock)
  fix-sum       pass  tokens +5,160 (+58.4%)
  rename-greet  pass  tokens 0
  vague-bug     pass -> FAIL  tokens -11,445 (-98.8%)
```

A **regression** is any of: a task that used to pass now fails, a new file outside `allow`, or token
usage up more than 20%. The baseline lives in `.agentgate/baseline.json` (gitignored); point
`--baseline-file` at a repo path when you want to commit it.

## Quickstart

Requires **Node >= 22.18** — the CLI runs TypeScript directly, there is no build step.

```bash
git clone <this repo>
cd agentgate

# no API key needed: the mock adapter replays canned edits
node src/cli.ts run --adapter mock

# see a run go red (the agent "helpfully" edits package.json)
node src/cli.ts run --adapter mock --tasks examples
```

With Claude Code installed and authenticated:

```bash
node src/cli.ts run --adapter claude --tasks tasks
```

## Task format

`tasks/fix-sum/task.mjs`:

```js
export default {
  id: 'fix-sum',
  prompt: 'The sum() function in src/app.js returns the wrong value. Fix it.',
  allow: ['src/**'],                              // glob whitelist; default: everything
  checks: [
    { name: 'unit tests', run: 'node --test' },
    // an exit code alone is not always enough — assert the behaviour itself
    { name: 'café survives', run: `node -e "..."`, expectStdout: 'café-au-lait' },
  ],
  budget: { maxTokens: 20000, maxMinutes: 2 },
}
```

`tasks/fix-sum/mock.json` — only used by `--adapter mock`:

```json
{
  "edits": [{ "file": "src/app.js", "content": "export function sum(a, b) {\n  return a + b\n}\n" }],
  "usage": { "inputTokens": 8200, "outputTokens": 640 }
}
```

## Adapters

| adapter  | status      | notes                                                        |
| -------- | ----------- | ------------------------------------------------------------ |
| `mock`   | stable      | offline, deterministic, drives CI and the demo                |
| `claude` | experimental| shells out to the `claude` CLI and parses `stream-json` usage |

Adding one is a single file: implement `{ id, detect, run({ cwd, prompt, timeoutMs }) }` in
`src/adapters/`. PRs for `gemini` and `codex` are welcome.

## Development

```bash
npm install      # only needed for typecheck; running the CLI needs no dependencies
npm test         # unit tests (node:test)
npm run typecheck
```

## Publishing

Create an **empty** repository on GitHub — no README, no .gitignore, no license — then run the
"push an existing repository from the command line" snippet that GitHub shows you on that page.
The repository is already initialised here with a single `main` commit, so nothing else is needed.

## Design rules

- **No LLM judging.** A task passes when its `checks` pass. Anything else is not reproducible.
- **Honest numbers.** Token counts come from the CLI when it reports them; estimated values are
  marked with `~` in the output, never silently mixed with measured ones.
- **Blast radius comes from `git`**, not from asking the model what it changed.

## Roadmap

- `v0.2` ✅ baseline comparison (`--baseline`); next: cost per task, single-file HTML report
- `v0.3` `gemini` / `codex` adapters
- `v0.4` VS Code panel that renders the same JSON

## 中文

**你测代码，但你没测 agent 对你的代码做了什么。**

agentgate 把一次 agent 运行当成构建产物来验证：给它一个任务和一个 fixture 仓库，跑完对比
「花了多少 token」和「改了哪些文件」。超出预算、动了白名单之外的文件、或者测试挂了，就直接变红。

不需要 API key，`node src/cli.ts run --adapter mock` 就能看到完整流程（内置离线适配器）。
接入真实 agent 目前支持 Claude Code CLI。

支持基线对比：`--save-baseline` 记录一次结果，`--baseline` 下次跑时逐任务对比，
`--fail-on-regression` 让 CI 在「曾经通过的任务挂了 / token 暴涨 20% / 多改了文件」时失败。

## License

MIT
