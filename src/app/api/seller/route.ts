import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

// GET products for the currently logged-in seller (own channel)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  const userId = (session.user as any).id

  // Get only this user's products (including unpublished)
  const [products, total, categories] = await Promise.all([
    db.product.findMany({
      where: { sellerId: userId },
      include: { seller: { select: { id: true, name: true, image: true, avatar: true, isSeller: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.product.count({ where: { sellerId: userId } }),
    db.category.findMany({ orderBy: { order: 'asc' } }),
  ])

  return NextResponse.json({ products, total, categories })
}
