import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as path from 'node:path'

const require = createRequire(import.meta.url)
const { resolveCli, findOnPath, isAgentdriftSource } = require('../out/locate.js')

const files = new Map()
const exists = (file) => files.has(file)
const readFile = (file) => {
  if (!files.has(file)) throw new Error(`ENOENT ${file}`)
  return files.get(file)
}
const opts = (extra = {}) => ({ exists, readFile, platform: 'win32', pathEnv: '', ...extra })

test('an explicit cliCommand always wins', () => {
  files.clear()
  const location = resolveCli('D:/project', ' node "D:/tools/agentdrift/src/cli.ts" ', opts())
  assert.equal(location.command, 'node "D:/tools/agentdrift/src/cli.ts"')
  assert.equal(location.source, 'setting')
})

test('a local install is used before anything global', () => {
  files.clear()
  const shim = path.join('D:/project', 'node_modules', '.bin', 'agentdrift.cmd')
  files.set(shim, '')
  const location = resolveCli('D:/project', '', opts({ pathEnv: 'C:/bin' }))
  assert.equal(location.command, shim)
  assert.equal(location.source, 'local')
})

test('this checkout is detected through package.json name', () => {
  files.clear()
  files.set(path.join('D:/repo', 'package.json'), JSON.stringify({ name: 'agentdrift' }))
  files.set(path.join('D:/repo', 'src', 'cli.ts'), '')
  const location = resolveCli('D:/repo', '', opts())
  assert.equal(location.source, 'repo')
  assert.match(location.command, /^node /)
  assert.match(location.command, /src[\\/]cli\.ts$/)
})

test('a random repo with src/cli.ts is not mistaken for agentdrift', () => {
  files.clear()
  files.set(path.join('D:/other', 'package.json'), JSON.stringify({ name: 'some-app' }))
  files.set(path.join('D:/other', 'src', 'cli.ts'), '')
  assert.equal(isAgentdriftSource('D:/other', readFile), false)
  assert.equal(resolveCli('D:/other', '', opts()).source, 'npx')
})

test('a global install on PATH is found with the Windows shim suffix', () => {
  files.clear()
  const shim = 'C:\\Users\\x\\AppData\\Roaming\\npm\\agentdrift.cmd'
  files.set(shim, '')
  const location = resolveCli('D:/project', '', opts({ pathEnv: 'C:\\Users\\x\\AppData\\Roaming\\npm;C:\\Windows' }))
  assert.equal(location.command, shim)
  assert.equal(location.source, 'path')
})

test('posix PATH lookup uses colons and no suffixes', () => {
  files.clear()
  files.set('/usr/local/bin/agentdrift', '')
  assert.equal(findOnPath('agentdrift', '/usr/local/bin:/usr/bin', 'linux', exists), '/usr/local/bin/agentdrift')
  assert.equal(findOnPath('agentdrift', '/usr/local/bin', 'linux', (file) => file === '/usr/local/bin/agentdrift.cmd'), undefined)
})

test('falls back to npx when nothing is installed', () => {
  files.clear()
  const location = resolveCli('D:/empty', '', opts())
  assert.equal(location.command, 'npx --yes agentdrift')
  assert.equal(location.source, 'npx')
})

test('paths with spaces are quoted', () => {
  files.clear()
  const shim = path.join('D:/my project', 'node_modules', '.bin', 'agentdrift.cmd')
  files.set(shim, '')
  assert.equal(resolveCli('D:/my project', '', opts()).command, `"${shim}"`)
})
