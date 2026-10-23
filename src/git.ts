import { spawnSync } from 'node:child_process'

/** Run git and return stdout, throwing on a non-zero exit. */
export function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`git ${args.join(' ')} failed: ${detail}`)
  }
  return result.stdout
}

/** Commit the fixture as a baseline so every edit shows up in `git status`. */
export function initRepo(cwd: string): void {
  git(cwd, ['init', '-q'])
  git(cwd, ['add', '-A'])
  git(cwd, [
    '-c', 'user.name=agentdrift',
    '-c', 'user.email=agentdrift@local',
    'commit', '-q', '-m', 'baseline',
  ])
}

/** Files added, modified, deleted or renamed by the agent. */
export function changedFiles(cwd: string): string[] {
  const out = git(cwd, ['status', '--porcelain'])
  const files: string[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const raw = line.slice(3).trim()
    const arrow = raw.lastIndexOf(' -> ')
    const path = (arrow >= 0 ? raw.slice(arrow + 4) : raw).replace(/^"|"$/g, '')
    if (path) files.push(path)
  }
  return files
}
