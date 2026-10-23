import * as vscode from 'vscode'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { groups, parseLastRun, totals, descriptionOf, tooltipOf, type LastRun, type TaskResult } from './model'
import { describeSource, resolveCli } from './locate'

const LAST_RUN = join('.agentdrift', 'last-run.json')
const REPORT = join('.agentdrift', 'report.html')

interface Settings {
  adapter: string
  tasks: string
  baseline: boolean
  cliCommand: string
}

type Node =
  | { kind: 'group'; key: 'failed' | 'passed'; label: string; tasks: TaskResult[] }
  | { kind: 'task'; result: TaskResult }
  | { kind: 'empty' }

class TaskTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>()
  readonly onDidChangeTreeData = this.changed.event

  constructor(private readonly runs: () => LastRun | undefined) {}

  refresh(): void {
    this.changed.fire(undefined)
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded)
      item.contextValue = 'agentdrift.group'
      item.iconPath = new vscode.ThemeIcon(node.key === 'failed' ? 'error' : 'pass')
      return item
    }
    if (node.kind === 'empty') {
      const item = new vscode.TreeItem('No run yet — click to run tasks', vscode.TreeItemCollapsibleState.None)
      item.iconPath = new vscode.ThemeIcon('play')
      item.command = { command: 'agentdrift.run', title: 'Run tasks' }
      return item
    }
    const result = node.result
    const item = new vscode.TreeItem(result.id, vscode.TreeItemCollapsibleState.None)
    item.id = result.id
    item.description = descriptionOf(result)
    item.tooltip = tooltipOf(result)
    item.iconPath = new vscode.ThemeIcon(result.pass ? 'pass' : 'error')
    item.contextValue = 'agentdrift.task'
    item.command = { command: 'agentdrift.openReport', title: 'Open report' }
    return item
  }

  getChildren(node?: Node): Node[] {
    const run = this.runs()
    if (!run) return node ? [] : [{ kind: 'empty' }]
    if (!node) return groups(run).map((g): Node => ({ kind: 'group', ...g }))
    if (node.kind === 'group') return node.tasks.map((result): Node => ({ kind: 'task', result }))
    return []
  }
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

function settings(): Settings {
  const cfg = vscode.workspace.getConfiguration('agentdrift')
  return {
    adapter: cfg.get<string>('adapter', 'mock'),
    tasks: cfg.get<string>('tasks', 'tasks'),
    baseline: cfg.get<boolean>('baseline', false),
    cliCommand: cfg.get<string>('cliCommand', ''),
  }
}

function quoteArgument(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value
}

/** Builds the shell command for one run. `html` is relative to the workspace root. */
export function buildCommand(command: string, run: Settings, only?: string, saveBaseline = false): string {
  const args = ['run', '--adapter', run.adapter, '--tasks', run.tasks, '--html', quoteArgument(REPORT)]
  if (saveBaseline) args.push('--save-baseline')
  else if (run.baseline) args.push('--baseline')
  if (only) args.push('--only', quoteArgument(only))
  return `${command} ${args.join(' ')}`
}

function runShell(command: string, cwd: string, token?: vscode.CancellationToken): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true })
    child.stdout.on('data', (chunk: Buffer) => channel.append(chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => channel.append(chunk.toString()))
    const cancel = token?.onCancellationRequested(() => child.kill())
    const done = (code: number | null, failure?: Error) => {
      cancel?.dispose()
      if (failure) channel.appendLine(`[spawn failed] ${failure.message}`)
      channel.appendLine(`[exit ${code ?? 'null'}]`)
      resolve(code)
    }
    child.on('error', (error) => done(null, error))
    child.on('close', (code) => done(code))
  })
}

let current: LastRun | undefined
let tree: TaskTree
let status: vscode.StatusBarItem
let channel: vscode.OutputChannel

async function loadRun(): Promise<LastRun | undefined> {
  const root = workspaceRoot()
  if (!root) return undefined
  try {
    current = parseLastRun(await readFile(join(root, LAST_RUN), 'utf8'))
    return current
  } catch {
    current = undefined
    return undefined
  }
}

function updateStatus(): void {
  const root = workspaceRoot()
  if (!root) {
    status.hide()
    return
  }
  if (!current) {
    status.text = '$(beaker) agentdrift —'
    status.tooltip = 'No run yet'
    status.backgroundColor = undefined
  } else {
    const t = totals(current)
    status.text = `$(beaker) agentdrift ${t.passed}/${t.total}`
    status.tooltip = `${t.failed} failed · ${t.tokens.toLocaleString('en-US')} tokens · ${t.stray} stray\nClick to open the report`
    status.backgroundColor = t.failed > 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined
  }
  status.show()
}

async function runTasks(options: { only?: string; saveBaseline?: boolean } = {}): Promise<void> {
  const root = workspaceRoot()
  if (!root) {
    void vscode.window.showErrorMessage('agentdrift: open a folder first')
    return
  }
  const run = settings()
  const cli = resolveCli(root, run.cliCommand)
  if (cli.source === 'npx') {
    const install = await vscode.window.showWarningMessage(
      'agentdrift: no local install found, falling back to npx. Install it for faster and offline runs.',
      'npm i -D agentdrift',
      'Continue',
    )
    if (install === 'npm i -D agentdrift') {
      channel.show(true)
      channel.appendLine(`$ npm i -D agentdrift`)
      await runShell(`npm i -D agentdrift`, root)
      await loadRun()
      tree.refresh()
      updateStatus()
      return
    }
    if (!install) return
  }

  const command = buildCommand(cli.command, run, options.only, options.saveBaseline)
  channel.show(true)
  channel.appendLine(`$ ${command}`)
  channel.appendLine(`  (cli: ${cli.command} via ${describeSource(cli)})`)
  status.text = '$(sync~spin) agentdrift running'
  status.show()

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'agentdrift', cancellable: true },
    async (_progress, token) => {
      const code = await runShell(command, root, token)
      if (code !== null && code > 1) {
        void vscode.window.showErrorMessage(`agentdrift: run failed (exit ${code}) — see the Output panel`)
      }
    },
  )

  await loadRun()
  tree.refresh()
  updateStatus()
  if (current) {
    const t = totals(current)
    const message = `${t.passed}/${t.total} passed · ${t.tokens.toLocaleString('en-US')} tokens · ${t.stray} stray`
    if (t.failed > 0) {
      void vscode.window.showWarningMessage(`agentdrift: ${message}`, 'Open report').then((choice) => {
        if (choice) void openReport()
      })
    } else {
      void vscode.window.showInformationMessage(`agentdrift: ${message}`)
    }
  }
}

async function openReport(): Promise<void> {
  const root = workspaceRoot()
  if (!root) return
  let html: string
  try {
    html = await readFile(join(root, REPORT), 'utf8')
  } catch {
    const choice = await vscode.window.showWarningMessage('agentdrift: no report yet', 'Run tasks')
    if (choice) await runTasks()
    return
  }
  const panel = vscode.window.createWebviewPanel('agentdrift.report', 'agentdrift report', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })
  // The report is fully self-contained (inline CSS + one inline script), so it needs no local roots.
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline';">`
  panel.webview.html = html.includes('<head>') ? html.replace('<head>', `<head>${csp}`) : html
}

export function activate(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel('agentdrift')
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  status.command = 'agentdrift.openReport'
  status.tooltip = 'agentdrift'

  void loadRun().then(updateStatus)

  tree = new TaskTree(() => current)
  context.subscriptions.push(
    channel,
    status,
    vscode.window.registerTreeDataProvider('agentdrift.tasks', tree),
    vscode.commands.registerCommand('agentdrift.run', () => void runTasks()),
    vscode.commands.registerCommand('agentdrift.runTask', (node?: { kind?: string; result?: TaskResult } | string) => {
      const id = typeof node === 'string' ? node : node?.result?.id
      void runTasks({ only: id })
    }),
    vscode.commands.registerCommand('agentdrift.saveBaseline', () => void runTasks({ saveBaseline: true })),
    vscode.commands.registerCommand('agentdrift.refresh', async () => {
      await loadRun()
      tree.refresh()
      updateStatus()
    }),
    vscode.commands.registerCommand('agentdrift.openReport', () => void openReport()),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await loadRun()
      tree.refresh()
      updateStatus()
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration('agentdrift')) return
      await loadRun()
      tree.refresh()
      updateStatus()
    }),
  )

  const watcher = vscode.workspace.createFileSystemWatcher('**/.agentdrift/last-run.json')
  watcher.onDidChange(async () => {
    await loadRun()
    tree.refresh()
    updateStatus()
  })
  context.subscriptions.push(watcher)
}

export function deactivate(): void {
  // nothing to dispose: everything is registered in context.subscriptions
}
