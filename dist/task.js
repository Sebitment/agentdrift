var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
/**
 * A task is a directory: task.mjs (what to ask, how to verify),
 * mock.json (canned agent behaviour for the offline adapter) and
 * repo/ (the starting point the agent gets to edit).
 */
export async function loadTasks(tasksDir) {
    let entries;
    try {
        entries = await readdir(tasksDir, { withFileTypes: true });
    }
    catch {
        throw new Error(`no tasks directory at "${tasksDir}". Run agentdrift from the repo root, or pass --tasks <dir>`);
    }
    const loaded = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const dir = join(tasksDir, entry.name);
        const modulePath = join(dir, 'task.mjs');
        let mod;
        try {
            // Cache-bust so editing a task does not require a restart.
            mod = await import(__rewriteRelativeImportExtension(`${pathToFileURL(modulePath).href}?v=${Date.now()}`));
        }
        catch {
            continue;
        }
        const task = mod.default;
        if (!task || typeof task.id !== 'string' || typeof task.prompt !== 'string') {
            throw new Error(`${modulePath} must default-export { id, prompt }`);
        }
        loaded.push({ task, dir });
    }
    return loaded.sort((a, b) => a.task.id.localeCompare(b.task.id));
}
