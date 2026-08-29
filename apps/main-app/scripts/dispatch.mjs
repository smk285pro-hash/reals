#!/usr/bin/env node
/**
 * Dispatch a task to one of the configured agents, optionally in its own
 * visible console window so progress can be watched live.
 *
 * Usage:
 *   node scripts/dispatch.mjs <role> "<task>"          # inline, capture output
 *   node scripts/dispatch.mjs <role> "<task>" --window # separate window
 *   node scripts/dispatch.mjs --list
 *
 * Roles are defined in .agents/roles.json. Each role pins a CLI, a model and a
 * sandbox setting, so a task cannot accidentally run with write access.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const ROOT = resolve(import.meta.dirname, '..')
const ROLES = JSON.parse(readFileSync(join(ROOT, '.agents', 'roles.json'), 'utf8'))
const LOGS = join(ROOT, '.agents', 'logs')
mkdirSync(LOGS, { recursive: true })

const argv = process.argv.slice(2)
if (argv[0] === '--list' || argv.length === 0) {
  console.log('Roles:\n')
  for (const [name, r] of Object.entries(ROLES.roles)) {
    const mode = r.sandbox || r.permissionMode || '?'
    const write = mode === 'workspace-write' ? ' WRITE' : ''
    console.log(`  ${name.padEnd(11)} ${r.cli.padEnd(7)} ${r.model.padEnd(18)} ${mode.padEnd(16)}${write}  ${r.purpose}`)
  }
  console.log(`\nMax parallel: ${ROLES.maxParallel} (gateway returns 500 above this)`)
  process.exit(0)
}

const [role, task] = argv
const useWindow = argv.includes('--window')
const cfg = ROLES.roles[role]
if (!cfg) {
  console.error(`Unknown role "${role}". Run --list to see roles.`)
  process.exit(1)
}
if (!task) {
  console.error('Provide a task string.')
  process.exit(1)
}

// The rules file is prepended to every task: an agent that has not read the
// constraints will violate them, and there is no way to enforce them remotely.
const RULES = readFileSync(join(ROOT, '.agents', 'RULES.md'), 'utf8')
const prompt = [
  `# Your role: ${role}`,
  cfg.systemPrompt,
  '',
  '# Project rules (binding)',
  RULES,
  '',
  '# Your task',
  task,
].join('\n')

const startedAt = Date.now()
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const logFile = join(LOGS, `${role}-${stamp}.log`)
const promptFile = join(LOGS, `${role}-${stamp}.prompt.txt`)
writeFileSync(promptFile, prompt)

/**
 * Build the argv for the underlying CLI.
 *
 * On Windows these CLIs are installed as .cmd shims, which spawn() cannot
 * execute without a shell — and a shell is exactly what must be avoided with an
 * arbitrary prompt. Resolving the .cmd path and invoking it through cmd.exe /c
 * with argv kept separate gets both: no shell interpolation of the prompt, and a
 * launchable target.
 */
function buildCommand() {
  const npmDir = join(process.env.APPDATA || '', 'npm')
  const shim = (name) => {
    const cmd = join(npmDir, `${name}.cmd`)
    return existsSync(cmd) ? cmd : name
  }

  if (cfg.cli === 'codex') {
    return [shim('codex'), ['exec', '--sandbox', cfg.sandbox, '--skip-git-repo-check',
      '-m', cfg.model, '-C', ROOT, prompt]]
  }
  if (cfg.cli === 'claude') {
    // Claude Code CLI speaks the Anthropic protocol, which this gateway also
    // serves — that is what makes claude-* reachable at all here. `plan` mode is
    // read-only, enforced by the CLI rather than by the prompt.
    const bin = process.platform === 'win32'
      ? join(homedir(), '.local', 'bin', 'claude.exe')
      : 'claude'
    return [existsSync(bin) ? bin : 'claude',
      ['-p', prompt, '--model', cfg.model, '--permission-mode', cfg.permissionMode || 'plan']]
  }
  if (cfg.cli === 'opencode') {
    // Kept for completeness; unusable through this gateway (see _limits).
    return [shim('opencode'), ['run', '-m', `htmustc/${cfg.model}`, prompt]]
  }
  throw new Error(`Unsupported cli ${cfg.cli}`)
}

// Resolved before the window branch below, which bakes it into the .cmd runner.
const KEY = process.env.HTMUSTC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
if (!KEY) {
  console.error('No key in env. Run:  source ~/.htmustc-env')
  process.exit(1)
}

let [bin, args] = buildCommand()

// Node refuses to spawn a .cmd file directly (the CVE-2024-27980 mitigation),
// and running it through a shell would interpolate the prompt. cmd.exe /c with
// argv kept as separate array entries is the remaining option.
if (process.platform === 'win32' && bin.toLowerCase().endsWith('.cmd')) {
  args = ['/c', bin, ...args]
  bin = process.env.COMSPEC || 'cmd.exe'
}

if (useWindow) {
  // A visible window needs the prompt on disk, not on the command line: Windows
  // caps a command line at ~8k chars and the rules file alone approaches that.
  const runner = join(LOGS, `${role}-${stamp}.cmd`)
  // Two window modes.
  //
  // --tui opens the CLI's real interface with the task preloaded, so the run can
  // be watched and steered by hand. Nothing is piped: `tee` would swallow the
  // TUI's control codes and leave a blank window, so there is no log file and
  // the completion marker fires when the window closes, not when the agent
  // answers. Claude writes its own transcript to ~/.claude/projects/ anyway.
  //
  // Default is headless, which streams to a log this script can read back.
  const interactive = argv.includes('--tui')
  const cliLine = interactive
    ? cfg.cli === 'codex'
      ? `codex --sandbox ${cfg.sandbox} --skip-git-repo-check -m ${cfg.model} -C '${ROOT}' "$(cat '${promptFile}')"`
      : `claude --model ${cfg.model} --permission-mode ${cfg.permissionMode || 'plan'} "$(cat '${promptFile}')"`
    : cfg.cli === 'codex'
      ? `codex exec --sandbox ${cfg.sandbox} --skip-git-repo-check -m ${cfg.model} -C '${ROOT}' < '${promptFile}'`
      : cfg.cli === 'claude'
        ? `claude -p "$(cat '${promptFile}')" --model ${cfg.model} --permission-mode ${cfg.permissionMode || 'plan'}`
        : `opencode run -m htmustc/${cfg.model} "$(cat '${promptFile}')"`
  writeFileSync(
    runner,
    [
      '@echo off',
      `title AGENT: ${role} [${cfg.model}]`,
      `echo ============================================`,
      `echo  AGENT   : ${role}`,
      `echo  CLI     : ${cfg.cli}   MODEL: ${cfg.model}`,
      `echo  SANDBOX : ${cfg.sandbox}`,
      `echo  LOG     : ${logFile}`,
      `echo ============================================`,
      `echo.`,
      // The key is sourced inside bash rather than written into this .cmd file.
      // Baking it in worked, but left the live credential sitting in plain text
      // under .agents/logs/ after every run.
      interactive
        ? `bash -lc "source ~/.htmustc-env && ${cliLine.replace(/"/g, '\\"')}"`
        : `bash -lc "source ~/.htmustc-env && ${cliLine.replace(/"/g, '\\"')}" 2>&1 | tee "${logFile}"`,
      // Completion marker. Without it the caller has no signal that the detached
      // window has finished and has to guess a fixed sleep — which wasted most
      // of a minute on every dispatch during setup.
      `> "${logFile}.done" echo %ERRORLEVEL%`,
      'echo.',
      'echo === agent finished ===',
      // In TUI mode the user closes the window themselves; pausing would just
      // add a keypress. In headless mode the window would vanish with the output.
      ...(interactive ? [] : ['pause']),
    ].join('\r\n')
  )
  spawnSync('powershell', ['-NoProfile', '-Command',
    `Start-Process cmd.exe -ArgumentList '/c','"${runner}"' -WindowStyle Normal`],
    { stdio: 'inherit' })
  console.log(`Launched ${role} in its own window.`)
  console.log(`  log: ${logFile}`)

  if (!argv.includes('--wait')) process.exit(0)

  // Poll the completion marker instead of sleeping a guessed duration. Runs
  // finish anywhere from 11s to 60s depending on the model, so a fixed sleep is
  // either wrong or wasteful — usually both.
  const doneFile = `${logFile}.done`
  const deadline = Date.now() + 10 * 60 * 1000
  process.stdout.write('  waiting')
  while (Date.now() < deadline) {
    if (existsSync(doneFile)) {
      const secs = ((Date.now() - startedAt) / 1000).toFixed(0)
      console.log(`\n  done in ${secs}s`)
      const body = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
      // eslint-disable-next-line no-control-regex
      console.log(body.replace(/\x1b\[[0-9;]*m/g, '').trim())
      process.exit(0)
    }
    await new Promise((r) => setTimeout(r, 2000))
    process.stdout.write('.')
  }
  console.log('\n  timed out after 10min; check the window and the log')
  process.exit(1)
}

// shell:false — the prompt is arbitrary text containing quotes, newlines and
// backticks. With a shell it would be concatenated into a command line and
// either break or execute part of itself. Passing argv directly avoids both.
// stdin must be closed, not inherited: codex exec treats an open stdin as "more
// prompt is coming" and blocks forever waiting for EOF.
// Claude Code reads ANTHROPIC_*; codex reads HTMUSTC_API_KEY via env_key. Both
// are set so a role can switch CLI without the caller changing anything.
const childEnv = {
  ...process.env,
  HTMUSTC_API_KEY: KEY,
  ANTHROPIC_API_KEY: KEY,
  ANTHROPIC_AUTH_TOKEN: KEY,
  ANTHROPIC_BASE_URL: ROLES.gateway?.anthropic || 'https://htmustc.id.vn',
}

const child = spawn(bin, args, {
  cwd: ROOT,
  shell: false,
  env: childEnv,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
child.stdout.on('data', (d) => { out += d; process.stdout.write(d) })
child.stderr.on('data', (d) => { out += d; process.stderr.write(d) })
child.on('close', (code) => {
  writeFileSync(logFile, out)
  console.log(`\n[${role}] exit=${code}  log=${logFile}`)
})
