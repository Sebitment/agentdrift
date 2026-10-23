import test from 'node:test'
import assert from 'node:assert/strict'
import { hello } from '../src/greet.js'
import { out } from '../src/main.js'

test('hello greets', () => {
  assert.equal(hello('world'), 'hi world')
})

test('main uses the renamed helper', () => {
  assert.equal(out, 'hi world')
})
