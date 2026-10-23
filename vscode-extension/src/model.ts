/**
 * Pure view-model code: no `vscode` import, so it can be unit tested in plain Node.
 * The shapes mirror the CLI's `TaskResult` / `TaskDelta` (docs/WORKFLOW.md §2.3).
 */

export type CheckResult = { name: string; ok: boolean; detail?: string }
export type Usage = { inputTokens: number; outputTokens: number; usd?: number; estimated?: boolean }

export type TaskResult = {
  id: string
  pass: boolean
  checks: CheckResult[]
  usage: Usage
  durationMs: number
  filesTouched: string[]
  filesOutsideAllow: string[]
  budgetExceeded: boolean
  budgetTokens?: number
  error?: string
}

export type DeltaStatus = 'new' | 'broken' | 'fixed' | 'gone' | 'same'

export type TaskDelta = {
  id: string
  status: DeltaStatus
  pass: boolean
  tokenDelta: number
  tokenPct: number | null
  timeDelta: number
  strayDelta: number
}

export type LastRun = {
  adapter: string
  finishedAt: string
  deltas: TaskDelta[]
  results: TaskResult[]
}

export type Totals = {
  total: number
  passed: number
  failed: number
  tokens: number
  stray: number
  durationMs: number
}

/** Parse the JSON written by `agentdrift run` into `.agentdrift/last-run.json`. */
export function parseLastRun(text: string): LastRun {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('last-run.json is not valid JSON')
  }
  if (!raw || typeof raw !== 'object') throw new Error('last-run.json is not an object')
  const run = raw as Partial<LastRun>
  if (!Array.isArray(run.results)) throw new Error('last-run.json has no results array')
  return {
    adapter: typeof run.adapter === 'string' ? run.adapter : 'unknown',
    finishedAt: typeof run.finishedAt === 'string' ? run.finishedAt : '',
    deltas: Array.isArray(run.deltas) ? run.deltas : [],
    results: run.results,
  }
}

export function tokensOf(result: TaskResult): number {
  return (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0)
}

export function totals(run: LastRun): Totals {
  return {
    total: run.results.length,
    passed: run.results.filter((r) => r.pass).length,
    failed: run.results.filter((r) => !r.pass).length,
    tokens: run.results.reduce((sum, r) => sum + tokensOf(r), 0),
    stray: run.results.reduce((sum, r) => sum + r.filesOutsideAllow.length, 0),
    durationMs: run.results.reduce((sum, r) => sum + r.durationMs, 0),
  }
}

export function deltaFor(run: LastRun, id: string): TaskDelta | undefined {
  return run.deltas.find((d) => d.id === id)
}

export function int(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** One-line reason a task failed, shown as the tree item description. */
export function failReason(result: TaskResult): string {
  if (result.error) return result.error
  if (result.filesOutsideAllow.length > 0) return `${result.filesOutsideAllow.length} file(s) outside allow`
  if (result.budgetExceeded) return `over budget (${int(result.budgetTokens ?? 0)})`
  const failed = result.checks.find((c) => !c.ok)
  return failed ? `check failed: ${failed.name}` : 'failed'
}

export function descriptionOf(result: TaskResult): string {
  if (!result.pass) return failReason(result)
  const time = result.durationMs < 1000 ? `${Math.round(result.durationMs)}ms` : `${(result.durationMs / 1000).toFixed(1)}s`
  return `${int(tokensOf(result))} tokens · ${time}`
}

export type Group = { key: 'failed' | 'passed'; label: string; tasks: TaskResult[] }

/** Failed tasks first — the only reason to open this panel is usually a red one. */
export function groups(run: LastRun): Group[] {
  const failed = run.results.filter((r) => !r.pass)
  const passed = run.results.filter((r) => r.pass)
  const out: Group[] = []
  if (failed.length > 0) out.push({ key: 'failed', label: `Failed (${failed.length})`, tasks: failed })
  if (passed.length > 0) out.push({ key: 'passed', label: `Passed (${passed.length})`, tasks: passed })
  return out
}

export function tooltipOf(result: TaskResult): string {
  const lines = [`${result.id} — ${result.pass ? 'pass' : 'FAIL'}`]
  if (result.error) lines.push(`error: ${result.error}`)
  lines.push(`${int(tokensOf(result))} tokens${result.usage?.estimated ? ' (estimated)' : ''}`)
  lines.push(`${(result.durationMs / 1000).toFixed(1)}s`)
  for (const check of result.checks) lines.push(`${check.ok ? '✓' : '×'} ${check.name}`)
  if (result.filesOutsideAllow.length > 0) lines.push(`outside allow: ${result.filesOutsideAllow.join(', ')}`)
  return lines.join('\n')
}
