import assert from 'node:assert/strict'
import test from 'node:test'
import { diffResults, regressions } from '../src/baseline.ts'

function result(id, pass, tokens, stray = 0) {
  return {
    id,
    pass,
    checks: [],
    durationMs: 100,
    filesTouched: [],
    filesOutsideAllow: Array.from({ length: stray }, () => 'extra.txt'),
    usage: { inputTokens: tokens, outputTokens: 0, estimated: true },
    budgetExceeded: false,
  }
}

const previous = {
  recordedAt: '2026-01-01T00:00:00.000Z',
  adapter: 'mock',
  results: [result('alpha', true, 100), result('beta', false, 50), result('gone', true, 10)],
}

test('a task that used to pass and now does not is broken', () => {
  const [delta] = diffResults(previous, [result('alpha', false, 100)])
  assert.equal(delta.status, 'broken')
  assert.ok(regressions([delta]).length === 1)
})

test('relative token change is reported', () => {
  const delta = diffResults(previous, [result('alpha', true, 150)]).find((d) => d.id === 'alpha')
  assert.equal(delta.tokenDelta, 50)
  assert.equal(delta.tokenPct, 0.5)
})

test('small token drift is not a regression, a big jump is', () => {
  const small = diffResults(previous, [result('alpha', true, 110)]).find((d) => d.id === 'alpha')
  assert.equal(regressions([small]).length, 0)

  const big = diffResults(previous, [result('alpha', true, 130)]).find((d) => d.id === 'alpha')
  assert.equal(regressions([big]).length, 1)
})

test('new stray files count as a regression', () => {
  const delta = diffResults(previous, [result('alpha', true, 100, 1)]).find((d) => d.id === 'alpha')
  assert.equal(delta.strayDelta, 1)
  assert.equal(regressions([delta]).length, 1)
})

test('tasks that appear or disappear are marked', () => {
  const deltas = diffResults(previous, [result('alpha', true, 100), result('fresh', true, 5)])
  assert.equal(deltas.find((d) => d.id === 'fresh').status, 'new')
  assert.equal(deltas.find((d) => d.id === 'gone').status, 'gone')
  assert.ok(deltas.filter((d) => d.status === 'gone').length === 2)
})

test('a task that starts passing is fixed', () => {
  const delta = diffResults(previous, [result('beta', true, 50)]).find((d) => d.id === 'beta')
  assert.equal(delta.status, 'fixed')
  assert.equal(regressions([delta]).length, 0)
})
