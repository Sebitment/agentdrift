import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { LoadedTask, Task } from './types.ts'

/**
 * A task is a directory: task.mjs (what to ask, how to verify),
 * mock.json (canned agent behaviour for the offline adapter) and
 * repo/ (the starting point the agent gets to edit).
 */
export async function loadTasks(tasksDir: string): Promise<LoadedTask[]> {
  let entries
  try {
    entries = await readdir(tasksDir, { withFileTypes: true })
  } catch {
    throw new Error(
      `no tasks directory at "${tasksDir}". Run agentdrift from the repo root, or pass --tasks <dir>`,
    )
  }
  const loaded: LoadedTask[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(tasksDir, entry.name)
    const modulePath = join(dir, 'task.mjs')

    let mod: { default?: Task }
    try {
      // Cache-bust so editing a task does not require a restart.
      mod = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`)
    } catch {
      continue
    }

    const task = mod.default
    if (!task || typeof task.id !== 'string' || typeof task.prompt !== 'string') {
      throw new Error(`${modulePath} must default-export { id, prompt }`)
    }
    loaded.push({ task, dir })
  }

  return loaded.sort((a, b) => a.task.id.localeCompare(b.task.id))
}
