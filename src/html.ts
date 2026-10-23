import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { TaskResult } from './types.ts'
import type { Baseline, TaskDelta } from './baseline.ts'

export type HtmlInput = {
  results: TaskResult[]
  adapter: string
  generatedAt?: Date
  baseline?: Baseline | null
  deltas?: TaskDelta[]
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char])
}

function int(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

function ms(value: number): string {
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`
}

function tokens(result: TaskResult): number {
  return result.usage.inputTokens + result.usage.outputTokens
}

function tokenCell(result: TaskResult, largest: number): string {
  const used = tokens(result)
  const budget = result.budgetTokens
  const scale = budget && budget > 0 ? budget : largest
  const width = scale > 0 ? Math.min(100, Math.max(2, (used / scale) * 100)) : 0
  const over = result.budgetExceeded.length > 0
  const sub = budget ? `of ${int(budget)}` : 'no budget'
  return `<div class="metric">
        <div class="label">tokens</div>
        <div class="value${over ? ' bad' : ''}">${int(used)}${result.usage.estimated ? '~' : ''}</div>
        <div class="bar"><i class="${over ? 'bad' : ''}" style="width:${width.toFixed(1)}%"></i></div>
        <div class="sub">${sub}</div>
      </div>`
}

function checkList(result: TaskResult): string {
  if (result.checks.length === 0) return '<div class="empty">no checks</div>'
  const items = result.checks
    .map((check) => {
      const detail = check.ok || !check.detail ? '' : `<pre>${esc(check.detail)}</pre>`
      return `<li class="${check.ok ? 'ok' : 'no'}"><span class="mark">${check.ok ? '✓' : '×'}</span><span class="name">${esc(check.name)}</span>${detail}</li>`
    })
    .join('')
  return `<ul class="checks">${items}</ul>`
}

function strayList(result: TaskResult): string {
  if (result.filesOutsideAllow.length === 0) return ''
  const chips = result.filesOutsideAllow.map((file) => `<code>${esc(file)}</code>`).join('')
  return `<div class="stray"><span class="label">outside allow</span>${chips}</div>`
}

function deltaLine(delta: TaskDelta | undefined): string {
  if (!delta) return ''
  const pct =
    delta.tokenPct === null ? '' : ` (${delta.tokenPct >= 0 ? '+' : ''}${(delta.tokenPct * 100).toFixed(1)}%)`
  const tokenText = delta.tokenDelta === 0 ? 'tokens ±0' : `tokens ${delta.tokenDelta > 0 ? '+' : '-'}${int(Math.abs(delta.tokenDelta))}${pct}`
  const tone =
    delta.status === 'broken'
      ? 'muted'
      : delta.tokenDelta === 0
        ? 'muted'
        : delta.tokenDelta > 0 && (delta.tokenPct ?? 0) > 0.2
          ? 'bad'
          : delta.tokenDelta > 0
            ? 'warn'
            : 'good'
  const parts = [`<span class="${tone}">${tokenText}</span>`]
  if (delta.strayDelta !== 0) {
    parts.push(`<span class="${delta.strayDelta > 0 ? 'bad' : 'good'}">stray ${delta.strayDelta > 0 ? '+' : ''}${delta.strayDelta}</span>`)
  }
  const status =
    delta.status === 'broken'
      ? '<span class="bad">pass → FAIL</span>'
      : delta.status === 'fixed'
        ? '<span class="good">FAIL → pass</span>'
        : delta.status === 'new'
          ? '<span class="muted">new task</span>'
          : delta.status === 'gone'
            ? '<span class="muted">removed</span>'
            : ''
  return `<div class="delta"><span class="label">baseline</span>${status}<span>${parts.join(' · ')}</span></div>`
}

function taskCard(result: TaskResult, largest: number, delta: TaskDelta | undefined): string {
  const state = result.pass ? 'pass' : 'fail'
  const error = result.error ? `<pre class="error">${esc(result.error)}</pre>` : ''
  return `<article class="task ${state}" data-status="${state}">
      <header>
        <h2>${esc(result.id)}</h2>
        <span class="pill ${state}">${result.pass ? 'pass' : 'FAIL'}</span>
      </header>
      <div class="metrics">
        ${tokenCell(result, largest)}
        <div class="metric">
          <div class="label">time</div>
          <div class="value">${ms(result.durationMs)}</div>
        </div>
        <div class="metric">
          <div class="label">stray</div>
          <div class="value${result.filesOutsideAllow.length > 0 ? ' bad' : ''}">${result.filesOutsideAllow.length}</div>
        </div>
      </div>
      ${error}
      ${checkList(result)}
      ${strayList(result)}
      ${deltaLine(delta)}
    </article>`
}

const STYLE = `
:root {
  color-scheme: dark light;
  --bg: #0d1117; --card: #161b22; --line: #30363d; --text: #e6edf3;
  --muted: #8b949e; --good: #3fb950; --bad: #f85149; --warn: #d29922; --accent: #58a6ff;
}
@media (prefers-color-scheme: light) {
  :root { --bg: #f6f8fa; --card: #ffffff; --line: #d0d7de; --text: #1f2328;
          --muted: #656d76; --good: #1a7f37; --bad: #cf222e; --warn: #9a6700; --accent: #0969da; }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 40px 24px 64px; background: var(--bg); color: var(--text);
  font: 14px/1.5 ui-sans-serif, system-ui, "Segoe UI", "Microsoft YaHei", sans-serif;
}
.wrap { max-width: 940px; margin: 0 auto; }
header.top { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
.brand { font-size: 20px; font-weight: 650; letter-spacing: -0.01em; }
.brand span { color: var(--accent); }
.meta { color: var(--muted); font-size: 13px; }
.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--line);
  border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
.summary > div { background: var(--card); padding: 14px 16px; }
.summary .k { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.summary .v { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
.summary .v small { font-size: 14px; color: var(--muted); font-weight: 400; }
.good { color: var(--good); } .bad { color: var(--bad); } .muted { color: var(--muted); }
.toolbar { display: flex; gap: 8px; margin-bottom: 14px; }
.toolbar button {
  background: transparent; color: var(--muted); border: 1px solid var(--line);
  padding: 5px 12px; border-radius: 999px; font: inherit; font-size: 13px; cursor: pointer;
}
.toolbar button.on { color: var(--text); border-color: var(--accent); }
main { display: grid; gap: 14px; }
.task { background: var(--card); border: 1px solid var(--line); border-left: 3px solid var(--line);
  border-radius: 10px; padding: 16px 18px; }
.task.pass { border-left-color: var(--good); }
.task.fail { border-left-color: var(--bad); }
.task header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.task h2 { margin: 0; font-size: 15px; font-weight: 600; font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
.pill { font-size: 12px; padding: 2px 9px; border-radius: 999px; border: 1px solid; font-weight: 600; }
.pill.pass { color: var(--good); border-color: color-mix(in srgb, var(--good) 45%, transparent); }
.pill.fail { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 45%, transparent); }
.metrics { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 18px; margin-top: 14px; }
.metric .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.metric .value { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.metric .sub { color: var(--muted); font-size: 12px; }
.bar { height: 4px; border-radius: 2px; background: var(--line); margin: 6px 0 4px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent); }
.bar i.bad { background: var(--bad); }
.checks { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 6px; }
.checks li { display: grid; grid-template-columns: 18px auto; gap: 6px; align-items: start; font-size: 13px; }
.checks .mark { font-weight: 700; }
.checks li.ok .mark { color: var(--good); }
.checks li.no .mark { color: var(--bad); }
.checks pre, pre.error {
  grid-column: 2; margin: 4px 0 0; padding: 8px 10px; background: var(--bg); border: 1px solid var(--line);
  border-radius: 6px; color: var(--muted); font-size: 12px; white-space: pre-wrap; word-break: break-word;
  max-height: 180px; overflow: auto;
}
pre.error { color: var(--bad); margin-top: 12px; }
.stray { margin-top: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.stray .label { color: var(--bad); font-size: 12px; }
.stray code { background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 1px 7px; font-size: 12px; }
.delta { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--line); display: flex; gap: 10px;
  font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.delta .label { color: var(--muted); text-transform: uppercase; font-size: 11px; letter-spacing: .06em; }
.empty { color: var(--muted); font-size: 13px; margin-top: 12px; }
footer { color: var(--muted); font-size: 12px; margin-top: 28px; text-align: center; }
@media (max-width: 640px) {
  body { padding: 24px 14px 48px; }
  .summary { grid-template-columns: repeat(2, 1fr); }
  .metrics { grid-template-columns: 1fr 1fr; }
}
`

const SCRIPT = `
const buttons = document.querySelectorAll('[data-filter]')
buttons.forEach((button) => {
  button.addEventListener('click', () => {
    buttons.forEach((other) => other.classList.toggle('on', other === button))
    const mode = button.dataset.filter
    document.querySelectorAll('.task').forEach((task) => {
      task.style.display = mode === 'fail' && task.dataset.status === 'pass' ? 'none' : ''
    })
  })
})
`

/** One self-contained HTML file: no assets, no CDN, works offline. */
export function renderHtml(input: HtmlInput): string {
  const { results, adapter } = input
  const generatedAt = input.generatedAt ?? new Date()
  const passed = results.filter((result) => result.pass).length
  const totalTokens = results.reduce((sum, result) => sum + tokens(result), 0)
  const totalStray = results.reduce((sum, result) => sum + result.filesOutsideAllow.length, 0)
  const totalTime = results.reduce((sum, result) => sum + result.durationMs, 0)
  const largest = Math.max(0, ...results.map(tokens))
  const allPass = passed === results.length
  const deltas = new Map((input.deltas ?? []).map((delta) => [delta.id, delta]))

  const stamp = generatedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  const baselineNote = input.baseline
    ? `<div class="meta">compared against ${esc(input.baseline.recordedAt.replace('T', ' ').slice(0, 16))} (${esc(input.baseline.adapter)})</div>`
    : ''

  const cards = results
    .map((result) => taskCard(result, largest, deltas.get(result.id)))
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentdrift · ${passed}/${results.length} passed</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="brand">agent<span>drift</span></div>
    <div class="meta">adapter <b>${esc(adapter)}</b> · ${esc(stamp)} · ${results.length} tasks</div>
    ${baselineNote}
  </header>

  <section class="summary">
    <div><span class="k">passed</span><span class="v ${allPass ? 'good' : 'bad'}">${passed}<small>/${results.length}</small></span></div>
    <div><span class="k">tokens</span><span class="v">${int(totalTokens)}</span></div>
    <div><span class="k">stray files</span><span class="v ${totalStray > 0 ? 'bad' : ''}">${totalStray}</span></div>
    <div><span class="k">wall time</span><span class="v">${ms(totalTime)}</span></div>
  </section>

  <div class="toolbar">
    <button data-filter="all" class="on">All ${results.length}</button>
    <button data-filter="fail">Failed ${results.length - passed}</button>
  </div>

  <main>
${cards}
  </main>

  <footer>generated by agentdrift · pass = checks green, nothing outside allow, inside budget</footer>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`
}

export async function writeHtml(path: string, input: HtmlInput): Promise<string> {
  await mkdir(dirname(path), { recursive: true })
  const html = renderHtml(input)
  await writeFile(path, html, 'utf8')
  return path
}
