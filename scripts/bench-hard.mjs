#!/usr/bin/env node
/**
 * Second-stage benchmark: separate reasoning quality among the models that
 * passed the easy probe. Speed alone cannot decide role assignment — a fast
 * model that misses a security hole is worse than a slow one that finds it.
 *
 * The task is the real vulnerability found in this repo: a download route that
 * checks for a Purchase row but never verifies the purchase was actually paid.
 * A model earns a point for each of the three things that matter.
 */
const BASE = process.env.OPENAI_BASE_URL || 'https://htmustc.id.vn/v1'
const KEY = process.env.HTMUSTC_API_KEY || process.env.OPENAI_API_KEY
if (!KEY) {
  console.error('Set HTMUSTC_API_KEY first:  source ~/.htmustc-env')
  process.exit(1)
}

const PROMPT = `Review this Next.js route handler for security problems.

export async function GET(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'no' }, { status: 401 })
  const userId = session.user.id

  const product = await db.product.findUnique({
    where: { id },
    select: { id: true, isFree: true, price: true, sellerId: true, fileKey: true },
  })
  if (!product) return NextResponse.json({ error: 'no' }, { status: 404 })

  if (product.sellerId !== userId) {
    if (!product.isFree) {
      const purchase = await db.purchase.findUnique({
        where: { userId_productId: { userId, productId: id } },
      })
      if (!purchase) return NextResponse.json({ error: 'buy it' }, { status: 403 })
    }
  }

  const url = await getSignedUrl(product.fileKey, { expiresIn: 86400 })
  return NextResponse.redirect(url)
}

List ONLY real exploitable issues, most severe first, one per line, no preamble.`

// Scored on findings that a competent reviewer must reach.
const CHECKS = [
  { name: 'unpaid-purchase-row', re: /(purchase|record|row)[^.\n]{0,80}(not|never|without|isn.t|no)[^.\n]{0,40}(paid|payment|complete|status|verif)|status[^.\n]{0,30}(not|never)[^.\n]{0,20}check|assumes[^.\n]{0,40}paid|forg|self-?creat|create[^.\n]{0,30}own[^.\n]{0,20}purchase/i },
  { name: 'price-zero-paid-gap', re: /price[^.\n]{0,30}(0|zero)|isFree[^.\n]{0,40}(price|inconsist|contradict)|paid[^.\n]{0,20}but[^.\n]{0,20}price/i },
  { name: 'long-lived-signed-url', re: /(86400|24[ -]?hour|expir|long[- ]lived|signed url[^.\n]{0,40}(share|leak|reus))/i },
  { name: 'no-admin-path', re: /admin|moderat|role/i },
]

const MODELS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5',
     'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gemini-3.6-flash']

const rows = []
for (const model of MODELS) {
  const t0 = Date.now()
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: PROMPT }], max_tokens: 1200 }),
      signal: AbortSignal.timeout(240000),
    })
    const ms = Date.now() - t0
    if (!r.ok) { console.log(`  ${model.padEnd(20)} http ${r.status}`); continue }
    const j = await r.json()
    const text = j.choices?.[0]?.message?.content || ''
    const hits = CHECKS.filter((c) => c.re.test(text)).map((c) => c.name)
    rows.push({ model, ms, score: hits.length, hits, tokens: j.usage?.completion_tokens ?? 0 })
    console.log(`  ${model.padEnd(20)} ${String(ms).padStart(6)}ms  score ${hits.length}/4  ${hits.join(',')}`)
  } catch (e) {
    console.log(`  ${model.padEnd(20)} ERR ${String(e.message).slice(0, 40)}`)
  }
}

console.log('\n--- ranked by score, then speed ---')
rows.sort((a, b) => b.score - a.score || a.ms - b.ms)
  .forEach((r) => console.log(`  ${r.model.padEnd(20)} ${r.score}/4  ${r.ms}ms`))
