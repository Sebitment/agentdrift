/**
 * Minimal glob matcher: `*` stays inside a path segment, `**` crosses
 * segments, `?` matches one character. No dependencies on purpose.
 */
export function matchGlob(pattern, file) {
    const p = pattern.replace(/\\/g, '/');
    const f = file.replace(/\\/g, '/');
    let re = '';
    for (let i = 0; i < p.length; i++) {
        const ch = p[i];
        if (ch === '*') {
            if (p[i + 1] === '*') {
                i++;
                if (p[i + 1] === '/') {
                    i++;
                    re += '(?:.*/)?';
                }
                else {
                    re += '.*';
                }
            }
            else {
                re += '[^/]*';
            }
        }
        else if (ch === '?') {
            re += '[^/]';
        }
        else if ('.+^$()[]{}|\\'.includes(ch)) {
            re += '\\' + ch;
        }
        else {
            re += ch;
        }
    }
    return new RegExp(`^${re}$`).test(f);
}
export function matchAny(patterns, file) {
    return patterns.some((pattern) => matchGlob(pattern, file));
}
