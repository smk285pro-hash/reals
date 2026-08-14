#!/usr/bin/env node
/**
 * Run up to 3 agents in parallel, each in its own window, and return when the
 * last one finishes — not after a guessed sleep.
 *
 * Usage:
 *   node scripts/fanout.mjs '[["auditor","task one"],["scout","task two"]]'
 *
 * Why this exists: dispatch.mjs --window detaches, so the caller had no
 * completion signal and fell back to `sleep 110`. Agents finish between 11s and
 * 60s, so that was wrong in both directions — idle waiting on fast runs, and
 * truncated output on slow ones. Each runner now writes <log>.done on exit and
 * this polls for those markers.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const LOGS = join(ROOT, '.agents', 'logs')
const MAX = JSON.parse(readFileSync(join(ROOT, '.agents', 'roles.json'), 'utf8')).maxParallel || 3

let jobs
try {
  jobs = JSON.parse(process.argv[2] || '')
} catch {
  console.error('Pass a JSON array: \'[["role","task"],...]\'')
  process.exit(1)
}
if (!Array.isArray(jobs) || jobs.length === 0) {
  console.error('Pass a JSON array: \'[["role","task"],...]\'')
  process.exit(1)
}
if (jobs.length > MAX) {
  // Above this the gateway returns 500 rather than queueing, so refuse loudly
  // instead of letting a third of the work fail silently.
  console.error(`Refusing ${jobs.length} jobs: the gateway fails above ${MAX} concurrent.`)
  process.exit(1)
}

const before = new Set(readdirSync(LOGS).filter((f) => f.endsWith('.log')))
const started = Date.now()

for (const [role, task] of jobs) {
  spawnSync(process.execPath, [join(ROOT, 'scripts', 'dispatch.mjs'), role, task, '--window'],
    { cwd: ROOT, stdio: 'inherit' })
}

/** Log files created by this invocation, one per job. */
function newLogs() {
  return readdirSync(LOGS).filter((f) => f.endsWith('.log') && !before.has(f))
}

const deadline = started + 12 * 60 * 1000
process.stdout.write(`\nwaiting for ${jobs.length} agents`)
while (Date.now() < deadline) {
  const logs = newLogs()
  const finished = logs.filter((f) => existsSync(join(LOGS, `${f}.done`)))
  if (logs.length >= jobs.length && finished.length >= jobs.length) break
  await new Promise((r) => setTimeout(r, 2000))
  process.stdout.write('.')
}

console.log(`\n\n=== all done in ${((Date.now() - started) / 1000).toFixed(0)}s ===\n`)

for (const f of newLogs().sort((a, b) => statSync(join(LOGS, a)).mtimeMs - statSync(join(LOGS, b)).mtimeMs)) {
  const role = f.split('-')[0]
  const body = readFileSync(join(LOGS, f), 'utf8')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .filter((l) => l.trim() && !/^(===|codex$|tokens used|\s*\d+$)/.test(l.trim()))
    .join('\n')
  console.log(`--- ${role} ---\n${body.trim()}\n`)
}
