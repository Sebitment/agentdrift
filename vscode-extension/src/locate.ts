import * as fs from 'node:fs'
import * as path from 'node:path'

export type CliSource = 'setting' | 'local' | 'repo' | 'path' | 'npx'

export interface CliLocation {
  /** Command line prefix, already shell-quoted, e.g. `node "D:/x/src/cli.ts"`. */
  command: string
  source: CliSource
}

export interface LocateOptions {
  platform?: NodeJS.Platform
  pathEnv?: string
  exists?: (file: string) => boolean
  readFile?: (file: string) => string
}

function quote(file: string): string {
  return /\s/.test(file) ? `"${file}"` : file
}

/** PATH scanning must follow the *target* platform, not the host the extension happens to run on. */
function joinFor(platform: NodeJS.Platform, dir: string, name: string): string {
  const separator = platform === 'win32' ? '\\' : '/'
  return `${dir.replace(/[\\/]+$/, '')}${separator}${name}`
}

function delimiterFor(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : ':'
}

/** First executable named `name` on PATH, honouring Windows' PATHEXT-ish `.cmd` shims. */
export function findOnPath(name: string, pathEnv: string, platform: NodeJS.Platform, exists: (file: string) => boolean): string | undefined {
  const suffixes = platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
  for (const dir of pathEnv.split(delimiterFor(platform))) {
    if (!dir) continue
    for (const suffix of suffixes) {
      const candidate = joinFor(platform, dir, name + suffix)
      if (exists(candidate)) return candidate
    }
  }
  return undefined
}

/** True when the folder is an agentdrift checkout (so `src/cli.ts` is the CLI). */
export function isAgentdriftSource(root: string, readFile: (file: string) => string): boolean {
  try {
    const pkg = JSON.parse(readFile(path.join(root, 'package.json'))) as { name?: string }
    return pkg.name === 'agentdrift'
  } catch {
    return false
  }
}

const NPX = 'npx --yes agentdrift'

/**
 * Where to run the CLI from, in priority order:
 *  1. the `agentdrift.cliCommand` setting (anything the user typed),
 *  2. a local install: `<root>/node_modules/.bin/agentdrift`,
 *  3. this checkout: `<root>/src/cli.ts` when package.json says `agentdrift`,
 *  4. a global install found on PATH,
 *  5. `npx agentdrift` as a last resort.
 */
export function resolveCli(root: string | undefined, configured: string, options: LocateOptions = {}): CliLocation {
  const platform = options.platform ?? process.platform
  const exists = options.exists ?? ((file: string) => fs.existsSync(file))
  const readFile = options.readFile ?? ((file: string) => fs.readFileSync(file, 'utf8'))

  const custom = configured.trim()
  if (custom) return { command: custom, source: 'setting' }

  if (root) {
    const shim = path.join(root, 'node_modules', '.bin', platform === 'win32' ? 'agentdrift.cmd' : 'agentdrift')
    if (exists(shim)) return { command: quote(shim), source: 'local' }
    const entry = path.join(root, 'src', 'cli.ts')
    if (exists(entry) && isAgentdriftSource(root, readFile)) return { command: `node ${quote(entry)}`, source: 'repo' }
  }

  const onPath = findOnPath('agentdrift', options.pathEnv ?? process.env.PATH ?? '', platform, exists)
  if (onPath) return { command: quote(onPath), source: 'path' }

  return { command: NPX, source: 'npx' }
}

export function describeSource(location: CliLocation): string {
  switch (location.source) {
    case 'setting':
      return 'agentdrift.cliCommand'
    case 'local':
      return 'node_modules/.bin'
    case 'repo':
      return 'this checkout (src/cli.ts)'
    case 'path':
      return 'PATH'
    default:
      return 'npx (not installed locally)'
  }
}
