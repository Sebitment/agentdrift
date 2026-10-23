import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import type { Adapter, Check, CheckResult, LoadedTask, RunResult, TaskResult } from './types.ts'
import { changedFiles, initRepo } from './git.ts'
import { matchAny } from './glob.ts'

function tail(text: string, max = 800): string {
  const trimmed = text.trim()
  return trimmed.length <= max ? trimmed : `…${trimmed.slice(-max)}`
}

function runShell(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; output: string; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let stdout = ''
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, output, stdout })
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(124)
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => {
      const text = String(chunk)
      output += text
      stdout += text
    })
    child.stderr?.on('data', (chunk) => (output += String(chunk)))
    child.on('error', (err) => {
      output += String(err)
      finish(1)
    })
    child.on('close', (code) => finish(code ?? 1))
  })
}

async function runChecks(checks: Check[], cwd: string): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const check of checks) {
    const name = check.name ?? check.run
    const expected = check.expectExit ?? 0
    const { code, output, stdout } = await runShell(check.run, cwd, check.timeoutMs ?? 120_000)
    const exitOk = code === expected
    const stdoutOk = check.expectStdout === undefined || stdout.trim() === check.expectStdout.trim()
    const ok = exitOk && stdoutOk
    const reason = exitOk
      ? `stdout ${JSON.stringify(tail(stdout, 200))}, expected ${JSON.stringify(check.expectStdout)}`
      : `exit ${code}, expected ${expected}`
    results.push({
      name,
      ok,
      detail: ok ? undefined : `${reason}\n${tail(output)}`,
    })
  }
  return results
}

/**
 * Copy the fixture into a scratch workspace, let the agent loose, then measure
 * what it spent, what it touched and whether the checks still pass.
 */
export async function runTask(
  loaded: LoadedTask,
  adapter: Adapter,
  workRoot: string,
): Promise<TaskResult> {
  const { task, dir } = loaded
  const cwd = join(workRoot, task.id)

  await rm(cwd, { recursive: true, force: true })
  await mkdir(cwd, { recursive: true })
  await cp(join(dir, 'repo'), cwd, { recursive: true })
  initRepo(cwd)

  const maxMinutes = task.budget?.maxMinutes ?? 5
  const timeoutMs = maxMinutes * 60_000
  const started = Date.now()

  let result: RunResult
  try {
    result = await adapter.run({ cwd, taskDir: dir, prompt: task.prompt, timeoutMs })
  } catch (err) {
    result = {
      exitCode: 1,
      usage: { inputTokens: 0, outputTokens: 0, estimated: true },
      transcript: '',
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }
  }
  const durationMs = Date.now() - started

  const filesTouched = changedFiles(cwd)
  const allow = task.allow && task.allow.length > 0 ? task.allow : ['**']
  const filesOutsideAllow = filesTouched.filter((file) => !matchAny(allow, file))

  const checks = await runChecks(task.checks ?? [], cwd)

  const budgetExceeded: string[] = []
  const tokens = result.usage.inputTokens + result.usage.outputTokens
  if (task.budget?.maxTokens && tokens > task.budget.maxTokens) {
    budgetExceeded.push(`${tokens} tokens > ${task.budget.maxTokens}`)
  }
  if (durationMs > timeoutMs) {
    budgetExceeded.push(`${Math.round(durationMs / 1000)}s > ${maxMinutes}min`)
  }

  const pass =
    !result.error &&
    checks.every((check) => check.ok) &&
    filesOutsideAllow.length === 0 &&
    budgetExceeded.length === 0

  return {
    id: task.id,
    pass,
    checks,
    usage: result.usage,
    durationMs,
    filesTouched,
    filesOutsideAllow,
    budgetExceeded,
    error: result.error,
  }
}
