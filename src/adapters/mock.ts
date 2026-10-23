import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Adapter, RunResult } from '../types.ts'

type MockSpec = {
  edits?: { file: string; content: string }[]
  delete?: string[]
  usage?: { inputTokens?: number; outputTokens?: number; usd?: number }
  sleepMs?: number
}

/**
 * Offline adapter. Replays the canned edits in `<task>/mock.json` so the
 * whole pipeline (workspace, checks, blast radius, budgets) can be tested
 * in CI without an API key. Numbers are always marked estimated.
 */
export function mockAdapter(): Adapter {
  return {
    id: 'mock',
    async detect() {
      return { ok: true, version: 'builtin' }
    },
    async run({ cwd, taskDir }): Promise<RunResult> {
      const started = Date.now()
      let spec: MockSpec = {}
      try {
        spec = JSON.parse(await readFile(join(taskDir, 'mock.json'), 'utf8')) as MockSpec
      } catch {
        spec = {}
      }

      for (const edit of spec.edits ?? []) {
        const target = join(cwd, edit.file)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, edit.content, 'utf8')
      }
      for (const file of spec.delete ?? []) {
        await rm(join(cwd, file), { force: true })
      }
      if (spec.sleepMs) {
        await new Promise((resolve) => setTimeout(resolve, spec.sleepMs))
      }

      return {
        exitCode: 0,
        usage: {
          inputTokens: spec.usage?.inputTokens ?? 0,
          outputTokens: spec.usage?.outputTokens ?? 0,
          usd: spec.usage?.usd,
          estimated: true,
        },
        transcript: `mock: applied ${(spec.edits ?? []).length} edit(s)`,
        durationMs: Date.now() - started,
      }
    },
  }
}
