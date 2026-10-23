import test from 'node:test'
import assert from 'node:assert/strict'
import { matchAny, matchGlob } from '../src/glob.ts'

test('* stays inside one path segment', () => {
  assert.equal(matchGlob('src/*.js', 'src/app.js'), true)
  assert.equal(matchGlob('src/*.js', 'src/lib/app.js'), false)
})

test('** crosses path segments', () => {
  assert.equal(matchGlob('src/**', 'src/lib/app.js'), true)
  assert.equal(matchGlob('src/**', 'src/app.js'), true)
  assert.equal(matchGlob('src/**', 'test/app.js'), false)
})

test('**/ also matches files at the root', () => {
  assert.equal(matchGlob('**/*.lock', 'package.lock'), true)
  assert.equal(matchGlob('**/*.lock', 'a/b/package.lock'), true)
  assert.equal(matchGlob('**/*.lock', 'package.json'), false)
})

test('? matches exactly one character', () => {
  assert.equal(matchGlob('a?.txt', 'ab.txt'), true)
  assert.equal(matchGlob('a?.txt', 'abc.txt'), false)
})

test('windows separators are normalised', () => {
  assert.equal(matchAny(['src/**'], 'src\\lib\\app.js'), true)
})

test('matchAny accepts a whitelist', () => {
  const allow = ['src/greet.js', 'src/main.js']
  assert.equal(matchAny(allow, 'src/greet.js'), true)
  assert.equal(matchAny(allow, 'src/other.js'), false)
})
