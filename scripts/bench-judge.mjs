#!/usr/bin/env node
/**
 * Third-stage benchmark: grade review quality with a model as judge.
 *
 * The regex grader in bench-hard.mjs was wrong, not the models. It demanded
 * particular wording, so claude-opus-5 scored 1/4 for an answer that actually
 * found the unpaid-purchase hole, cache exposure, 404/403 enumeration and the
 * missing rate limit. Semantic grading is the only kind that works here.
 *
 * Usage: node scripts/bench-judge.mjs [model...]
 */
const BASE = process.env.OPENAI_BASE_URL || 'https://htmustc.id.vn/v1'
const KEY = process.env.HTMUSTC_API_KEY || process.env.OPENAI_API_KEY
if (!KEY) {
  console.error('Set HTMUSTC_API_KEY first:  source ~/.htmustc-env')
  process.exit(1)
}

const JUDGE = 'claude-opus-4-8'

const TASK = `Review this Next.js route for security problems. List ONLY real exploitable issues, most severe first, one per line, no preamble.

export async function GET(req,{params}){const {id}=await params;const session=await getServerSession(authOptions);if(!session?.user)return NextResponse.json({error:1},{status:401});const userId=session.user.id;const product=await db.product.findUnique({where:{id},select:{id:true,isFree:true,price:true,sellerId:true,fileKey:true}});if(!product)return NextResponse.json({error:1},{status:404});if(product.sellerId!==userId){if(!product.isFree){const purchase=await db.purchase.findUnique({where:{userId_productId:{userId,productId:id}}});if(!purchase)return NextResponse.json({error:1},{status:403})}}const url=await getSignedUrl(product.fileKey,{expiresIn:86400});return NextResponse.redirect(url)}`

const RUBRIC = `You are grading a security review. The reference findings are:

A. Entitlement inferred from a Purchase row existing, with no check that payment
   completed or was not refunded — a self-created or abandoned purchase grants access.
B. Signed URL TTL of 86400s is a shareable bearer credential; anyone with the link
   downloads the paid file for 24h.
C. price/isFree can disagree (price=0 with isFree=false), so the paid branch runs for
   a product that is effectively free, or vice versa.
D. No published/deleted/banned check on the product before serving the file.
E. Any additional REAL issue: 404-vs-403 enumeration, missing Cache-Control on the
   redirect, no rate limiting.

Award 1 point per distinct reference finding covered (A-D), plus up to 2 points for
E. Ignore wording. Do not award points for vague or speculative claims.
Penalize 1 point for any confidently stated finding that is factually wrong.

Reply with ONLY a JSON object, no prose:
{"score": <0-6>, "covered": ["A","B",...], "wrong": <count>, "note": "<12 words max>"}`

async function ask(model, prompt, maxTokens = 1200) {
  const t0 = Date.now()
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
    signal: AbortSignal.timeout(300000),
  })
  const ms = Date.now() - t0
  if (!r.ok) throw new Error(`http ${r.status}`)
  const j = await r.json()
  return { text: j.choices?.[0]?.message?.content || '', ms, tokens: j.usage?.completion_tokens ?? 0 }
}

const MODELS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5',
     'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gemini-3.6-flash']

const rows = []
for (const model of MODELS) {
  try {
    const ans = await ask(model, TASK)
    const graded = await ask(JUDGE, `${RUBRIC}\n\n--- REVIEW TO GRADE ---\n${ans.text}`, 300)
    const m = graded.text.match(/\{[\s\S]*\}/)
    const g = m ? JSON.parse(m[0]) : { score: -1, covered: [], wrong: 0, note: 'unparseable' }
    rows.push({ model, ms: ans.ms, tokens: ans.tokens, ...g })
    console.log(`  ${model.padEnd(20)} ${String(ans.ms).padStart(6)}ms  ${g.score}/6  [${(g.covered || []).join('')}]  wrong=${g.wrong}  ${g.note || ''}`)
  } catch (e) {
    console.log(`  ${model.padEnd(20)} ERR ${String(e.message).slice(0, 40)}`)
  }
}

console.log('\n--- ranked: score desc, then latency asc ---')
rows.sort((a, b) => b.score - a.score || a.ms - b.ms)
  .forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r.model.padEnd(20)} ${r.score}/6  ${r.ms}ms  ${r.tokens}tok`))
console.log(`\nJSON:${JSON.stringify(rows)}`)
