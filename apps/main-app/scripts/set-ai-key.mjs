#!/usr/bin/env node
/**
 * Point every installed CLI agent at the htmustc gateway with one key.
 *
 * Usage:  node scripts/set-ai-key.mjs <API_KEY>
 *         node scripts/set-ai-key.mjs --check     (verify, no writes)
 *
 * The gateway speaks three wire protocols on the same host, and each CLI wants
 * a different one, so they are configured separately rather than through a
 * single shared variable:
 *
 *   codex     -> /v1/responses        (wire_api = "responses")
 *   gemini    -> /v1                  (OpenAI-compatible mode)
 *   opencode  -> /v1/chat/completions (via @ai-sdk/openai-compatible)
 *
 * Existing config is merged, never replaced — codex's config.toml carries ten
 * [projects.*] trust entries that must survive, and opencode's file already
 * defines a Cloudflare provider that is left intact as a fallback.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HOST = 'https://htmustc.id.vn'
const OPENAI_BASE = `${HOST}/v1`
const HOME = homedir()

// codex speaks the OpenAI Responses API, and the gateway only serves GPT models
// there — claude-* returns 500 and kimi returns 403 on /v1/responses, while all
// of them work on /v1/chat/completions. So codex gets its own default.
const CODEX_MODEL = 'gpt-5.6-sol'

// Only the models this key can actually reach, verified with a live probe.
// GET /v1/models advertises 21, but kimi/deepseek/glm return 403 (not on this
// plan) and qwen returns 500, so listing them would just offer dead options.
// Ordered best-first; [0] becomes the default.
const MODELS = [
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-sonnet-4.6',
  'claude-haiku-4.5',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gemini-3.6-flash',
]

const arg = process.argv[2]
const CHECK_ONLY = arg === '--check'
const KEY = CHECK_ONLY ? null : arg

if (!arg) {
  console.error('Usage: node scripts/set-ai-key.mjs <API_KEY>')
  console.error('       node scripts/set-ai-key.mjs --check')
  process.exit(1)
}
if (!CHECK_ONLY && (KEY.length < 8 || KEY.startsWith('-'))) {
  console.error('That does not look like a key. Pass the key as the first argument.')
  process.exit(1)
}

const done = []
const skipped = []

/** Back up a file once, so a bad run is always recoverable. */
function backup(path) {
  const bak = `${path}.bak-before-htmustc`
  if (existsSync(path) && !existsSync(bak)) copyFileSync(path, bak)
}

function writeFile(path, body) {
  mkdirSync(join(path, '..'), { recursive: true })
  backup(path)
  writeFileSync(path, body)
}

/**
 * codex — TOML. Rewrites the top-level keys and the [model_providers.htmustc]
 * block while preserving every other line, notably the [projects.*] entries.
 * The key goes in env_key so it is read from the environment at run time rather
 * than sitting in a config file.
 */
function configureCodex() {
  const path = join(HOME, '.codex', 'config.toml')
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''

  // Drop the lines this script owns; keep everything else verbatim.
  const owned = /^(model|model_provider|model_reasoning_effort)\s*=/
  const kept = []
  let inOwnedBlock = false
  for (const line of existing.split(/\r?\n/)) {
    if (/^\[model_providers\./.test(line)) {
      inOwnedBlock = true
      continue
    }
    if (inOwnedBlock) {
      if (/^\[/.test(line)) inOwnedBlock = false
      else continue
    }
    if (owned.test(line)) continue
    kept.push(line)
  }

  const header = [
    `model = "${CODEX_MODEL}"`,
    'model_provider = "htmustc"',
    'model_reasoning_effort = "medium"',
    '',
    '[model_providers.htmustc]',
    'name = "htmustc"',
    `base_url = "${OPENAI_BASE}"`,
    'wire_api = "responses"',
    'env_key = "HTMUSTC_API_KEY"',
    '',
  ].join('\n')

  writeFile(path, header + kept.join('\n').replace(/\n{3,}/g, '\n\n').trimStart() + '\n')
  done.push(`codex     -> ${path}`)
}

/**
 * gemini — cannot use this gateway.
 *
 * gemini-cli 0.43.0 validates authType against exactly four values:
 * oauth-personal, gemini-api-key, vertex-ai, cloud-shell. There is no
 * openai-compatible mode, so pointing it at a third-party base URL is not
 * possible in this version — setting selectedType to anything else makes the
 * CLI exit with "Invalid auth method selected". Any prior attempt at that is
 * reverted here so the CLI keeps working with a real Google key.
 */
function configureGemini() {
  const path = join(HOME, '.gemini', 'settings.json')
  if (!existsSync(path)) {
    skipped.push('gemini    -> no OpenAI-compatible mode in 0.43.0; not configured')
    return
  }
  let cfg
  try {
    cfg = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))
  } catch {
    skipped.push(`gemini    -> ${path} is not valid JSON, left untouched`)
    return
  }
  // Undo the unsupported value rather than leaving the CLI unusable.
  if (cfg?.security?.auth?.selectedType === 'openai') {
    delete cfg.security.auth.selectedType
    writeFile(path, JSON.stringify(cfg, null, 2) + '\n')
    skipped.push('gemini    -> reverted unsupported authType; needs a Google key')
  } else {
    skipped.push('gemini    -> no OpenAI-compatible mode in 0.43.0; not configured')
  }
}

/**
 * opencode — opencode.json. Adds an htmustc provider alongside whatever is
 * already configured; the existing Cloudflare provider keeps working.
 */
function configureOpencode() {
  const path = join(HOME, '.config', 'opencode', 'opencode.json')
  let cfg = {}
  if (existsSync(path)) {
    try {
      cfg = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))
    } catch (e) {
      skipped.push(`opencode  -> ${path} is not valid JSON, left untouched`)
      return
    }
  }
  cfg.$schema = cfg.$schema || 'https://opencode.ai/config.json'
  cfg.provider = cfg.provider || {}
  cfg.provider.htmustc = {
    npm: '@ai-sdk/openai-compatible',
    name: 'htmustc',
    options: { baseURL: OPENAI_BASE, apiKey: '{env:HTMUSTC_API_KEY}' },
    models: Object.fromEntries(MODELS.map((m) => [m, { name: m }])),
  }
  cfg.model = `htmustc/${MODELS[0]}`
  writeFile(path, JSON.stringify(cfg, null, 2) + '\n')
  done.push(`opencode  -> ${path}`)
}

/** Persist the key for the current user so every CLI above can read it. */
function persistKey() {
  if (!KEY) return
  const path = join(HOME, '.htmustc-env')
  writeFile(
    path,
    [
      '# Shared gateway credentials. Source this, or let the CLIs read it.',
      `export HTMUSTC_API_KEY=${KEY}`,
      `export OPENAI_API_KEY=${KEY}`,
      `export OPENAI_BASE_URL=${OPENAI_BASE}`,
      `export ANTHROPIC_API_KEY=${KEY}`,
      `export ANTHROPIC_BASE_URL=${HOST}`,
      `export ANTHROPIC_AUTH_TOKEN=${KEY}`,
      '',
    ].join('\n')
  )
  done.push(`shared    -> ${path}`)
}

/** Live check: does the gateway accept this key on all three protocols? */
async function verify(key) {
  const results = []
  const probe = async (label, url, body, headers) => {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
      results.push(`  ${label.padEnd(22)} http=${r.status}${r.ok ? ' OK' : ''}`)
    } catch (e) {
      results.push(`  ${label.padEnd(22)} FAILED ${String(e.message).slice(0, 60)}`)
    }
  }

  const auth = key ? { authorization: `Bearer ${key}` } : {}
  await probe('chat/completions', `${OPENAI_BASE}/chat/completions`, {
    model: MODELS[0], messages: [{ role: 'user', content: 'hi' }], max_tokens: 5,
  }, auth)
  // Probed with CODEX_MODEL, not MODELS[0]: this endpoint rejects non-GPT models.
  await probe('responses (codex)', `${OPENAI_BASE}/responses`, {
    model: CODEX_MODEL, input: 'hi',
  }, auth)
  await probe('messages (anthropic)', `${HOST}/v1/messages`, {
    model: 'claude-sonnet-5', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }],
  }, key ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : {})

  console.log(results.join('\n'))
}

if (CHECK_ONLY) {
  console.log(`Probing ${HOST} (401 without a key means the endpoint is alive)`)
  await verify(process.env.HTMUSTC_API_KEY || null)
  // No process.exit here: Node on Windows asserts if a fetch handle is still
  // closing when the process is torn down. Falling off the end is clean.
} else {
  configureCodex()
  configureGemini()
  configureOpencode()
  persistKey()

  console.log('Configured:')
  console.log(done.map((d) => `  ${d}`).join('\n'))
  if (skipped.length) {
    console.log('Skipped:')
    console.log(skipped.map((s) => `  ${s}`).join('\n'))
  }
  console.log(`\nDefault model: ${MODELS[0]}   (${MODELS.length} available)`)
  console.log('Backups written alongside each file as *.bak-before-htmustc')
  console.log('\nVerifying key against the gateway...')
  await verify(KEY)
  console.log(`
To load the key in this shell and in new terminals:
  source ~/.htmustc-env

Then, read-only so neither agent can write to the repo:
  codex exec --sandbox read-only --skip-git-repo-check "..."   # ${CODEX_MODEL}
  opencode run -m htmustc/${MODELS[0]} "..."
`)
}
