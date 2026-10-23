import assert from 'node:assert/strict'
import test from 'node:test'
import { renderHtml } from '../src/html.ts'

function result(id, pass, tokens, options = {}) {
  return {
    id,
    pass,
    checks: options.checks ?? [{ name: 'unit tests', ok: pass }],
    durationMs: options.durationMs ?? 12,
    filesTouched: [],
    filesOutsideAllow: options.stray ?? [],
    budgetExceeded: [],
    budgetTokens: options.budgetTokens,
    usage: { inputTokens: tokens, outputTokens: 0, estimated: true },
  }
}

test('renders the summary and one card per task', () => {
  const html = renderHtml({
    adapter: 'mock',
    results: [result('fix-sum', true, 100), result('vague-bug', false, 50)],
    generatedAt: new Date('2026-01-01T00:00:00Z'),
  })
  assert.match(html, /agent<span>drift<\/span>/)
  assert.match(html, /1<small>\/2<\/small>/)
  assert.match(html, /class="pill pass">pass</)
  assert.match(html, /class="pill fail">FAIL</)
})

test('escapes filenames and check output', () => {
  const html = renderHtml({
    adapter: 'mock',
    results: [
      result('evil', false, 10, {
        stray: ['<script>alert(1)</script>.txt'],
        checks: [{ name: 'x', ok: false, detail: 'a < b && c' }],
      }),
    ],
  })
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;\.txt/)
  assert.match(html, /a &lt; b &amp;&amp; c/)
})

test('usage bars are scaled against the token budget', () => {
  const html = renderHtml({
    adapter: 'mock',
    results: [result('half', true, 5000, { budgetTokens: 10000 })],
  })
  assert.match(html, /style="width:50\.0%"/)
  assert.match(html, /of 10,000/)
})

test('baseline deltas are rendered when supplied', () => {
  const html = renderHtml({
    adapter: 'mock',
    results: [result('t', false, 120)],
    baseline: { recordedAt: '2026-01-01T00:00:00.000Z', adapter: 'mock', results: [result('t', true, 100)] },
    deltas: [{ id: 't', status: 'broken', pass: false, tokenDelta: 20, tokenPct: 0.2, timeDelta: 0, strayDelta: 0 }],
  })
  assert.match(html, /pass → FAIL/)
  assert.match(html, /tokens \+20 \(\+20\.0%\)/)
})
