import { spawn } from 'node:child_process';
const BASE_ARGS = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'acceptEdits',
];
/**
 * Claude Code adapter. Experimental: it shells out to the `claude` binary and
 * parses its stream-json events. Unavailable in CI unless the CLI is installed.
 */
export function claudeAdapter(opts = {}) {
    const bin = opts.bin ?? process.env.AGENTGATE_CLAUDE_BIN ?? 'claude';
    const shell = process.platform === 'win32';
    return {
        id: 'claude',
        async detect() {
            return new Promise((resolve) => {
                const child = spawn(`${bin} --version`, { shell });
                let out = '';
                child.stdout?.on('data', (chunk) => (out += String(chunk)));
                child.on('error', () => resolve({ ok: false }));
                child.on('close', (code) => {
                    resolve({ ok: code === 0, version: out.trim().split(/\r?\n/)[0] });
                });
            });
        },
        run({ cwd, prompt, timeoutMs }) {
            return new Promise((resolve) => {
                const started = Date.now();
                const usage = { inputTokens: 0, outputTokens: 0 };
                let transcript = '';
                let error;
                let pending = '';
                const args = [...BASE_ARGS, ...(opts.extraArgs ?? [])];
                // One command string with the prompt on stdin: no shell escaping of user
                // text, and no DEP0190 (args array + shell:true) on modern Node.
                const child = spawn([bin, ...args].join(' '), { cwd, shell });
                child.stdin?.end(prompt);
                const timer = setTimeout(() => {
                    error = `timed out after ${Math.round(timeoutMs / 1000)}s`;
                    child.kill('SIGKILL');
                }, timeoutMs);
                function consume(line) {
                    const text = line.trim();
                    if (!text.startsWith('{'))
                        return;
                    try {
                        const event = JSON.parse(text);
                        const raw = (event.usage ?? event.message?.usage);
                        if (raw) {
                            usage.inputTokens += raw.input_tokens ?? 0;
                            usage.outputTokens += raw.output_tokens ?? 0;
                        }
                        if (typeof event.total_cost_usd === 'number')
                            usage.usd = event.total_cost_usd;
                    }
                    catch {
                        // Non-JSON line: ignore.
                    }
                }
                child.stdout?.on('data', (chunk) => {
                    const text = String(chunk);
                    transcript += text;
                    pending += text;
                    const lines = pending.split(/\r?\n/);
                    pending = lines.pop() ?? '';
                    for (const line of lines)
                        consume(line);
                });
                child.stderr?.on('data', (chunk) => {
                    transcript += String(chunk);
                });
                child.on('error', (err) => {
                    clearTimeout(timer);
                    resolve({
                        exitCode: 1,
                        usage,
                        transcript,
                        durationMs: Date.now() - started,
                        error: err.message,
                    });
                });
                child.on('close', (code) => {
                    clearTimeout(timer);
                    if (pending)
                        consume(pending);
                    resolve({
                        exitCode: code ?? 1,
                        usage,
                        transcript: transcript.slice(-20000),
                        durationMs: Date.now() - started,
                        error,
                    });
                });
            });
        },
    };
}
