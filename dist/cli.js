#!/usr/bin/env node
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTasks } from "./task.js";
import { runTask } from "./runner.js";
import { mockAdapter } from "./adapters/mock.js";
import { claudeAdapter } from "./adapters/claude.js";
import { printReport, renderDelta, toJson, printDelta } from "./report.js";
import { DEFAULT_BASELINE, diffResults, readBaseline, regressions, writeBaseline } from "./baseline.js";
import { writeHtml } from "./html.js";
import { matchGlob } from "./glob.js";
function parseArgs(argv) {
    const flags = {};
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) {
            rest.push(arg);
            continue;
        }
        const body = arg.slice(2);
        const eq = body.indexOf('=');
        if (eq >= 0) {
            flags[body.slice(0, eq)] = body.slice(eq + 1);
        }
        else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            flags[body] = argv[++i];
        }
        else {
            flags[body] = true;
        }
    }
    return { flags, rest };
}
const HELP = `agentdrift — regression tests for coding agents

Usage
  agentdrift run [options]      run every task in the task folder
  agentdrift list [--tasks d]   list tasks without running them

Options
  --tasks <dir>      task folder (default: tasks)
  --only <ids>       comma separated task ids or globs, e.g. fix-sum,rename-*
  --adapter <name>   claude | mock (default: claude)
  --json             print machine readable results to stdout
  --quiet            no per-task progress on stderr
  --exit-zero        always exit 0, even when tasks fail
  --baseline         compare this run against the saved baseline
  --save-baseline    save this run as the new baseline
  --baseline-file <file>  baseline path (default: .agentdrift/baseline.json)
  --fail-on-regression    exit 1 on pass->fail, token jump >20%, or new stray files
  --html <file>      write a self-contained HTML report
  -h, --help         show this help

Tasks live in <dir>/<id>/ and contain task.mjs, mock.json and repo/.
`;
function makeAdapter(id) {
    if (id === 'mock')
        return mockAdapter();
    if (id === 'claude')
        return claudeAdapter();
    return null;
}
async function main() {
    const { flags, rest } = parseArgs(process.argv.slice(2));
    const command = rest[0] ?? 'run';
    if (flags.help || flags.h || command === 'help') {
        process.stdout.write(HELP);
        return;
    }
    const tasksDir = String(flags.tasks ?? 'tasks');
    const loaded = await loadTasks(tasksDir);
    const only = typeof flags.only === 'string'
        ? flags.only.split(',').map((part) => part.trim()).filter(Boolean)
        : null;
    const selected = only
        ? loaded.filter((item) => only.some((pattern) => matchGlob(pattern, item.task.id)))
        : loaded;
    if (selected.length === 0) {
        const hint = only ? ` matching --only ${only.join(',')}` : '';
        console.error(`No tasks found in "${tasksDir}"${hint}.`);
        process.exitCode = 2;
        return;
    }
    if (command === 'list') {
        for (const { task } of selected) {
            const checks = task.checks?.length ?? 0;
            const allow = task.allow?.join(', ') ?? '*';
            console.log(`${task.id}  ·  ${checks} check(s)  ·  allow: ${allow}`);
        }
        return;
    }
    if (command !== 'run') {
        console.error(`Unknown command "${command}". Try: agentdrift --help`);
        process.exitCode = 2;
        return;
    }
    const adapterId = String(flags.adapter ?? 'claude');
    const adapter = makeAdapter(adapterId);
    if (!adapter) {
        console.error(`Unknown adapter "${adapterId}". Available: claude, mock`);
        process.exitCode = 2;
        return;
    }
    const health = await adapter.detect();
    if (!health.ok) {
        console.error(`Adapter "${adapter.id}" is not available. Install the CLI or run with --adapter mock.`);
        process.exitCode = 2;
        return;
    }
    const workRoot = join(process.cwd(), '.agentdrift', 'work');
    const baselinePath = String(flags['baseline-file'] ?? DEFAULT_BASELINE);
    const saveBaseline = Boolean(flags['save-baseline']);
    const compare = Boolean(flags.baseline);
    let baseline = null;
    if (compare) {
        baseline = await readBaseline(baselinePath);
        if (!baseline) {
            console.error(`No baseline at ${baselinePath}. Run once with --save-baseline first.`);
            process.exitCode = 2;
            return;
        }
    }
    const results = [];
    for (const item of selected) {
        if (!flags.quiet)
            process.stderr.write(`▶ ${item.task.id} … `);
        const result = await runTask(item, adapter, workRoot);
        if (!flags.quiet)
            process.stderr.write(result.pass ? 'ok\n' : 'FAIL\n');
        results.push(result);
    }
    const deltas = baseline ? diffResults(baseline, results) : [];
    if (flags.json) {
        console.log(toJson(results));
        if (baseline) {
            const text = renderDelta(baseline, deltas);
            if (text)
                console.error(text);
        }
    }
    else {
        printReport(results);
        if (baseline)
            printDelta(baseline, deltas);
    }
    if (baseline && flags['fail-on-regression']) {
        const worse = regressions(deltas);
        if (worse.length > 0) {
            console.error(`\n${worse.length} regression(s): ${worse.map((delta) => delta.id).join(', ')}`);
            process.exitCode = 1;
        }
    }
    const htmlPath = typeof flags.html === 'string' ? flags.html : null;
    if (htmlPath) {
        await writeHtml(htmlPath, { results, adapter: adapter.id, baseline, deltas });
        console.error(`report written to ${htmlPath}`);
    }
    await writeLastRun(results, adapter.id, deltas);
    if (saveBaseline) {
        await writeBaseline(baselinePath, adapter.id, results);
        console.error(`baseline saved to ${baselinePath}`);
    }
    const failed = results.filter((result) => !result.pass).length;
    if (failed > 0 && !flags['exit-zero'])
        process.exitCode = 1;
}
/** Machine-readable snapshot for editors and scripts (the VS Code panel reads it). */
async function writeLastRun(results, adapterId, deltas) {
    const dir = join(process.cwd(), '.agentdrift');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'last-run.json'), `${JSON.stringify({ adapter: adapterId, finishedAt: new Date().toISOString(), deltas, results }, null, 2)}\n`);
}
main().catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    if (process.env.AGENTDRIFT_DEBUG)
        console.error(error instanceof Error ? error.stack : '');
    process.exitCode = 2;
});
