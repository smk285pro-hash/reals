#!/usr/bin/env node
/**
 * Benchmark every reachable model on the gateway: latency, throughput, and
 * whether it can answer a real code question correctly.
 *
 * Role assignment downstream depends on measured numbers rather than on
 * reputation, because the gateway's routing and quotas change what is actually
 * fast here — a model that is quick elsewhere may be slow or throttled on this
 * key.
 *
 * Usage: node scripts/bench-models.mjs
 */
const BASE = process.env.OPENAI_BASE_URL || 'https://htmustc.id.vn/v1'
const KEY = process.env.HTMUSTC_API_KEY || process.env.OPENAI_API_KEY

if (!KEY) {
  console.error('Set HTMUSTC_API_KEY first:  source ~/.htmustc-env')
  process.exit(1)
}

// A question with one unambiguous right answer, so grading needs no judgement.
// It mirrors the actual bug fixed in this repo: a price/isFree invariant.
const PROMPT = `A product row has two fields: price (number) and isFree (boolean).
A bug let rows exist with price=0 AND isFree=false. The UI shows a locked
"buy" button when isFree is false, but the server treats price<=0 as free and
allows download. State in ONE short sentence where the fix belongs: at the
write site (when saving) or the read sites (each UI check)? Then answer with
the single word WRITE or READ on its own final line.`

async function bench(model) {
  const t0 = Date.now()
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: PROMPT }],
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(180000),
    })
    const ms = Date.now() - t0
    if (!r.ok) return { model, ok: false, ms, note: `http ${r.status}` }
    const j = await r.json()
    const text = (j.choices?.[0]?.message?.content || '').trim()
    const out = j.usage?.completion_tokens ?? 0
    const last = text.split(/\n/).filter(Boolean).pop() || ''
    const correct = /\bWRITE\b/i.test(last) && !/\bREAD\b/i.test(last)
    return {
      model,
      ok: true,
      ms,
      tokens: out,
      tps: out && ms ? +(out / (ms / 1000)).toFixed(1) : 0,
      correct,
      chars: text.length,
    }
  } catch (e) {
    return { model, ok: false, ms: Date.now() - t0, note: String(e.message).slice(0, 40) }
  }
}

const MODELS = [
  'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6',
  'claude-sonnet-5', 'claude-sonnet-4.6', 'claude-haiku-4.5',
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.5-review',
  'gpt-5.4', 'gpt-5.4-mini', 'gemini-3.6-flash',
  'kimi-k2.7', 'deepseek-v4-pro', 'deepseek-v4-flash', 'qwen3.7-max',
  'qwen3.8-max', 'glm-5.2',
]

// Sequential: concurrent requests would contend and distort the latency numbers
// this whole exercise exists to measure.
const rows = []
for (const m of MODELS) {
  const r = await bench(m)
  rows.push(r)
  const status = r.ok ? `${String(r.ms).padStart(6)}ms  ${String(r.tps).padStart(5)} tok/s  ${r.correct ? 'PASS' : 'fail'}` : `${String(r.ms).padStart(6)}ms  ${r.note}`
  console.log(`  ${m.padEnd(20)} ${status}`)
}

const good = rows.filter((r) => r.ok && r.correct).sort((a, b) => a.ms - b.ms)
console.log('\n--- reachable AND correct, fastest first ---')
good.forEach((r) => console.log(`  ${r.model.padEnd(20)} ${r.ms}ms  ${r.tps} tok/s`))
console.log(`\nJSON:${JSON.stringify(rows)}`)
