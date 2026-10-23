import test from 'node:test'
import assert from 'node:assert/strict'
import { inc } from '../src/calc.js'

test('inc adds one', () => {
  assert.equal(inc(1), 2)
})
