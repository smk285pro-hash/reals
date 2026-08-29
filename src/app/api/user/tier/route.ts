// GET /api/user/tier — tier info cho stem-app.
//
// Auth: Authorization: Bearer <bridge token> (SSO token do
// /api/auth/stem/authorize cấp). Endpoint này nằm ngoài /api/auth/* nên
// được middleware rate-limit 500 req/phút/IP như các API khác.
import { NextRequest, NextResponse } from 'next/server'
import { verifyBridgeToken } from '@/lib/stem-sso'
import { getUserTierInfo } from '@/lib/tiers'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  }

  const payload = await verifyBridgeToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  try {
    const info = await getUserTierInfo(payload.id)
    return NextResponse.json(info)
  } catch (error) {
    console.error('[GET /api/user/tier] DB error:', error)
    return NextResponse.json({ error: 'DB unavailable' }, { status: 503 })
  }
}
