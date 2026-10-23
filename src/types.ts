/** A shell command that must succeed for the task to count as solved. */
export type Check = {
  /** Human readable name, defaults to the command itself. */
  name?: string
  run: string
  /** Expected exit code, defaults to 0. */
  expectExit?: number
  /** When set, trimmed stdout must equal this string exactly. */
  expectStdout?: string
  timeoutMs?: number
}

export type Budget = {
  /** Total input + output tokens allowed for one run. */
  maxTokens?: number
  maxMinutes?: number
}

export type Task = {
  id: string
  prompt: string
  /** Glob whitelist of files the agent may touch. Defaults to everything. */
  allow?: string[]
  checks?: Check[]
  budget?: Budget
}

export type LoadedTask = {
  task: Task
  /** Directory holding task.mjs, mock.json and the repo/ fixture. */
  dir: string
}

export type Usage = {
  inputTokens: number
  outputTokens: number
  usd?: number
  /** True when the numbers were estimated rather than reported by the CLI. */
  estimated?: boolean
}

export type RunContext = {
  cwd: string
  taskDir: string
  prompt: string
  timeoutMs: number
}

export type RunResult = {
  exitCode: number
  usage: Usage
  transcript: string
  durationMs: number
  error?: string
}

export type Adapter = {
  id: string
  detect(): Promise<{ ok: boolean; version?: string }>
  run(ctx: RunContext): Promise<RunResult>
}

export type CheckResult = {
  name: string
  ok: boolean
  detail?: string
}

export type TaskResult = {
  id: string
  pass: boolean
  checks: CheckResult[]
  usage: Usage
  durationMs: number
  filesTouched: string[]
  filesOutsideAllow: string[]
  budgetExceeded: string[]
  error?: string
}
