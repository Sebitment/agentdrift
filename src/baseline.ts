import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { TaskResult } from './types.ts'

export const DEFAULT_BASELINE = '.agentdrift/baseline.json'

/** A previous run, saved so the next run can be compared against it. */
export type Baseline = {
  recordedAt: string
  adapter: string
  results: TaskResult[]
}

export type DeltaStatus = 'same' | 'fixed' | 'broken' | 'new' | 'gone'

export type TaskDelta = {
  id: string
  status: DeltaStatus
  /** Did the task pass in this run? */
  pass: boolean
  tokenDelta: number
  /** Relative token change, null when the baseline had no tokens. */
  tokenPct: number | null
  timeDelta: number
  strayDelta: number
}

export async function readBaseline(path: string): Promise<Baseline | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Baseline
    if (!Array.isArray(parsed.results)) return null
    return parsed
  } catch {
    return null
  }
}

export async function writeBaseline(
  path: string,
  adapter: string,
  results: TaskResult[],
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const baseline: Baseline = {
    recordedAt: new Date().toISOString(),
    adapter,
    results,
  }
  await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
}

function tokens(result: TaskResult): number {
  return result.usage.inputTokens + result.usage.outputTokens
}

/** Compare a run against a stored baseline, task by task. */
export function diffResults(previous: Baseline | null, current: TaskResult[]): TaskDelta[] {
  if (!previous) return []

  const before = new Map(previous.results.map((result) => [result.id, result]))
  const deltas: TaskDelta[] = []

  for (const result of current) {
    const old = before.get(result.id)
    if (!old) {
      deltas.push({
        id: result.id,
        status: 'new',
        pass: result.pass,
        tokenDelta: 0,
        tokenPct: null,
        timeDelta: 0,
        strayDelta: 0,
      })
      continue
    }

    const oldTokens = tokens(old)
    const newTokens = tokens(result)
    deltas.push({
      id: result.id,
      status: old.pass === result.pass ? 'same' : result.pass ? 'fixed' : 'broken',
      pass: result.pass,
      tokenDelta: newTokens - oldTokens,
      tokenPct: oldTokens > 0 ? (newTokens - oldTokens) / oldTokens : null,
      timeDelta: result.durationMs - old.durationMs,
      strayDelta: result.filesOutsideAllow.length - old.filesOutsideAllow.length,
    })
    before.delete(result.id)
  }

  for (const id of before.keys()) {
    deltas.push({ id, status: 'gone', pass: false, tokenDelta: 0, tokenPct: null, timeDelta: 0, strayDelta: 0 })
  }

  return deltas
}

/**
 * A regression is something that got worse: a task that used to pass, any new
 * stray file, or a token jump above `tokenGrowthLimit` relative change.
 */
export function regressions(deltas: TaskDelta[], tokenGrowthLimit = 0.2): TaskDelta[] {
  return deltas.filter(
    (delta) =>
      delta.status === 'broken' ||
      delta.strayDelta > 0 ||
      (delta.tokenPct !== null && delta.tokenPct > tokenGrowthLimit),
  )
}
