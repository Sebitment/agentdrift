import assert from 'node:assert/strict'
import test from 'node:test'
import { slug } from '../src/slug.js'

test('replaces spaces with dashes', () => {
  assert.equal(slug('Hello World'), 'hello-world')
})

test('collapses runs of separators', () => {
  assert.equal(slug('a  --  b'), 'a-b')
})

test('trims leading and trailing separators', () => {
  assert.equal(slug('  Hello World!  '), 'hello-world')
})
