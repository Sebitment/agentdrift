const useColor = !process.env.NO_COLOR && process.env.TERM !== 'dumb';
function paint(code, text) {
    return useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
}
/** Terminal width, counting CJK glyphs as two columns. */
function displayWidth(text) {
    let width = 0;
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        const wide = code >= 0x1100 &&
            (code <= 0x115f ||
                (code >= 0x2e80 && code <= 0xa4cf) ||
                (code >= 0xac00 && code <= 0xd7a3) ||
                (code >= 0xf900 && code <= 0xfaff) ||
                (code >= 0xfe30 && code <= 0xfe6f) ||
                (code >= 0xff00 && code <= 0xff60) ||
                (code >= 0xffe0 && code <= 0xffe6));
        width += wide ? 2 : 1;
    }
    return width;
}
function pad(text, width) {
    return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}
function formatInt(value) {
    return Math.round(value).toLocaleString('en-US');
}
function formatMs(ms) {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
export function buildRows(results) {
    return results.map((result) => {
        const tokens = result.usage.inputTokens + result.usage.outputTokens;
        const stray = result.filesOutsideAllow;
        const plain = [
            result.id,
            result.pass ? 'pass' : 'FAIL',
            `${formatInt(tokens)}${result.usage.estimated ? '~' : ''}`,
            result.usage.usd != null ? `$${result.usage.usd.toFixed(3)}` : '-',
            formatMs(result.durationMs),
            stray.length === 0 ? '0' : `${stray.length} ${stray.join(', ')}`,
        ];
        const painted = [
            result.id,
            result.pass ? paint(32, 'pass') : paint(31, 'FAIL'),
            result.budgetExceeded.length > 0 ? paint(33, plain[2]) : plain[2],
            plain[3],
            plain[4],
            stray.length === 0 ? plain[5] : paint(31, plain[5]),
        ];
        return { plain, painted };
    });
}
function renderTable(headers, rows) {
    const widths = headers.map((header, index) => Math.max(displayWidth(header), ...rows.map((row) => displayWidth(row.plain[index] ?? ''))));
    const headerLine = headers.map((header, index) => pad(header, widths[index])).join('  ').trimEnd();
    const separator = widths.map((width) => '─'.repeat(width)).join('  ');
    const body = rows.map((row) => {
        const cells = row.painted.map((cell, index) => {
            // Pad using the plain text width so ANSI codes do not break alignment.
            const gap = widths[index] - displayWidth(row.plain[index] ?? '');
            return cell + ' '.repeat(Math.max(0, gap));
        });
        return cells.join('  ').trimEnd();
    });
    return [paint(1, headerLine), separator, ...body].join('\n');
}
export function printReport(results) {
    const headers = ['TASK', 'RESULT', 'TOKENS', 'COST', 'TIME', 'STRAY'];
    const table = renderTable(headers, buildRows(results));
    const passed = results.filter((result) => result.pass).length;
    const tokens = results.reduce((sum, result) => sum + result.usage.inputTokens + result.usage.outputTokens, 0);
    const stray = results.reduce((sum, result) => sum + result.filesOutsideAllow.length, 0);
    const time = results.reduce((sum, result) => sum + result.durationMs, 0);
    const summary = [
        `${passed}/${results.length} passed`,
        `${formatInt(tokens)} tokens`,
        `${stray} stray files`,
        formatMs(time),
    ].join('  ·  ');
    const details = [];
    for (const result of results) {
        if (result.pass)
            continue;
        details.push('', paint(1, result.id));
        if (result.error)
            details.push(`  error: ${result.error}`);
        for (const check of result.checks) {
            if (check.ok)
                continue;
            details.push(`  check failed: ${check.name}`);
            if (check.detail)
                details.push(check.detail.split('\n').map((l) => `    ${l}`).join('\n'));
        }
        if (result.filesOutsideAllow.length > 0) {
            details.push(`  files outside allow: ${result.filesOutsideAllow.join(', ')}`);
        }
        for (const budget of result.budgetExceeded)
            details.push(`  budget: ${budget}`);
    }
    const output = [table, '', summary, ...details].join('\n');
    console.log(output);
    return output;
}
export function toJson(results) {
    return JSON.stringify(results, null, 2);
}
function signedInt(value) {
    if (value === 0)
        return '0';
    return `${value > 0 ? '+' : '-'}${formatInt(Math.abs(value))}`;
}
/** One line per task, showing what got better and what got worse. */
export function renderDelta(baseline, deltas) {
    if (deltas.length === 0)
        return '';
    const stamp = baseline.recordedAt.replace('T', ' ').replace(/\..*$/, '').replace('Z', 'UTC');
    const width = Math.max(...deltas.map((delta) => displayWidth(delta.id)));
    const lines = [paint(1, `vs baseline ${stamp} (${baseline.adapter})`)];
    for (const delta of deltas) {
        const parts = [delta.id + ' '.repeat(Math.max(0, width - displayWidth(delta.id)))];
        if (delta.status === 'broken')
            parts.push(paint(31, 'pass -> FAIL'));
        else if (delta.status === 'fixed')
            parts.push(paint(32, 'FAIL -> pass'));
        else if (delta.status === 'new')
            parts.push(paint(36, 'new task'));
        else if (delta.status === 'gone')
            parts.push(paint(33, 'removed'));
        else
            parts.push(paint(delta.pass ? 32 : 31, delta.pass ? 'pass' : 'FAIL'));
        if (delta.status !== 'gone') {
            const pct = delta.tokenPct === null
                ? ''
                : ` (${delta.tokenPct >= 0 ? '+' : ''}${(delta.tokenPct * 100).toFixed(1)}%)`;
            const text = `tokens ${signedInt(delta.tokenDelta)}${pct}`;
            const color = delta.tokenDelta > 0 && (delta.tokenPct ?? 0) > 0.2 ? 31 : delta.tokenDelta > 0 ? 33 : 32;
            parts.push(delta.tokenDelta === 0 ? paint(90, 'tokens 0') : paint(color, text));
            if (delta.strayDelta !== 0) {
                parts.push(paint(delta.strayDelta > 0 ? 31 : 32, `stray ${delta.strayDelta > 0 ? '+' : ''}${delta.strayDelta}`));
            }
        }
        lines.push(`  ${parts.join('  ')}`);
    }
    return lines.join('\n');
}
export function printDelta(baseline, deltas) {
    const output = renderDelta(baseline, deltas);
    if (output)
        console.log(`\n${output}`);
    return output;
}
