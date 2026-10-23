import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLastRun, totals, groups, descriptionOf, failReason, tooltipOf, tokensOf } from '../out/model.js'

const result = (over) => ({
  id: 'fix-sum',
  pass: true,
  checks: [{ name: 'unit tests', ok: true }],
  usage: { inputTokens: 900, outputTokens: 100 },
  durationMs: 1200,
  filesTouched: ['src/app.js'],
  filesOutsideAllow: [],
  budgetExceeded: false,
  budgetTokens: 20000,
  ...over,
})

const run = (results, deltas = []) => JSON.stringify({ adapter: 'mock', finishedAt: '2026-10-23T10:00:00.000Z', deltas, results })

test('parseLastRun accepts a run and keeps the fields it needs', () => {
  const parsed = parseLastRun(run([result()]))
  assert.equal(parsed.adapter, 'mock')
  assert.equal(parsed.results.length, 1)
  assert.deepEqual(parsed.deltas, [])
})

test('parseLastRun rejects garbage with a readable message', () => {
  assert.throws(() => parseLastRun('not json'), /not valid JSON/)
  assert.throws(() => parseLastRun('{"adapter":"mock"}'), /no results array/)
})

test('totals sum tokens, strays and duration across tasks', () => {
  const t = totals(parseLastRun(run([result(), result({ pass: false, filesOutsideAllow: ['package.json'], durationMs: 300 })])))
  assert.equal(t.total, 2)
  assert.equal(t.passed, 1)
  assert.equal(t.failed, 1)
  assert.equal(t.tokens, 2000)
  assert.equal(t.stray, 1)
  assert.equal(t.durationMs, 1500)
})

test('groups put failures first and skip empty groups', () => {
  const parsed = parseLastRun(run([result(), result({ id: 'vague-bug', pass: false, checks: [{ name: 'café survives', ok: false }] })]))
  const g = groups(parsed)
  assert.deepEqual(g.map((x) => x.key), ['failed', 'passed'])
  assert.deepEqual(g[0].tasks.map((r) => r.id), ['vague-bug'])
  assert.deepEqual(groups(parseLastRun(run([result()]))).map((x) => x.key), ['passed'])
})

test('failReason explains the first thing that broke', () => {
  assert.equal(failReason(result({ pass: false, filesOutsideAllow: ['a.js', 'b.js'] })), '2 file(s) outside allow')
  assert.equal(failReason(result({ pass: false, budgetExceeded: true, budgetTokens: 20000 })), 'over budget (20,000)')
  assert.equal(failReason(result({ pass: false, checks: [{ name: 'unit tests', ok: false }] })), 'check failed: unit tests')
  assert.equal(descriptionOf(result({ pass: false, checks: [{ name: 'unit tests', ok: false }] })), 'check failed: unit tests')
  assert.equal(descriptionOf(result({ pass: false })), 'failed')
  assert.equal(descriptionOf(result({ durationMs: 380 })), '1,000 tokens · 380ms')
  assert.equal(descriptionOf(result()), '1,000 tokens · 1.2s')
})

test('tooltipOf lists checks and stray files', () => {
  const text = tooltipOf(result({ filesOutsideAllow: ['package.json'] }))
  assert.match(text, /fix-sum — pass/)
  assert.match(text, /✓ unit tests/)
  assert.match(text, /outside allow: package\.json/)
})

test('tokensOf tolerates missing usage', () => {
  assert.equal(tokensOf(result({ usage: undefined })), 0)
})
