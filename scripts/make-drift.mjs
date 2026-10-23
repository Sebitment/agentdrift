import { cp, readFile, writeFile } from 'node:fs/promises'

// Rebuild .agentdrift/tmp-drift: same tasks as `tasks/`, but fix-sum burns more
// tokens and vague-bug solves nothing. Used to demo `--baseline`.
await cp('tasks', '.agentdrift/tmp-drift', { recursive: true, force: true })

const sumPath = '.agentdrift/tmp-drift/fix-sum/mock.json'
const sum = JSON.parse(await readFile(sumPath, 'utf8'))
sum.usage = { inputTokens: 12600, outputTokens: 1400 }
await writeFile(sumPath, `${JSON.stringify(sum, null, 2)}\n`, 'utf8')

await writeFile(
  '.agentdrift/tmp-drift/vague-bug/mock.json',
  `${JSON.stringify({ edits: [], usage: { inputTokens: 120, outputTokens: 15 } }, null, 2)}\n`,
  'utf8',
)
console.log('drift workspace ready')
