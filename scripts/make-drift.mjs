import { cp, readFile, writeFile } from 'node:fs/promises'

// Rebuild .agentgate/tmp-drift: same tasks as `tasks/`, but fix-sum burns more
// tokens and vague-bug solves nothing. Used to demo `--baseline`.
await cp('tasks', '.agentgate/tmp-drift', { recursive: true, force: true })

const sumPath = '.agentgate/tmp-drift/fix-sum/mock.json'
const sum = JSON.parse(await readFile(sumPath, 'utf8'))
sum.usage = { inputTokens: 12600, outputTokens: 1400 }
await writeFile(sumPath, `${JSON.stringify(sum, null, 2)}\n`, 'utf8')

await writeFile(
  '.agentgate/tmp-drift/vague-bug/mock.json',
  `${JSON.stringify({ edits: [], usage: { inputTokens: 120, outputTokens: 15 } }, null, 2)}\n`,
  'utf8',
)
console.log('drift workspace ready')
