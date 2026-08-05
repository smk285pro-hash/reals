import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const category = url.searchParams.get('category')
  const search = url.searchParams.get('search')
  const sort = url.searchParams.get('sort') || 'latest'
  const free = url.searchParams.get('free')
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = parseInt(url.searchParams.get('limit') || '20')

  const where: Record<string, unknown> = { published: true }

  if (category && category !== 'all') {
    where.categorySlug = category
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { tags: { contains: search } },
      { format: { contains: search } },
    ]
  }

  if (free === 'true') {
    where.isFree = true
  }

  const orderBy: Record<string, string> = {}
  switch (sort) {
    case 'popular':
      orderBy.views = 'desc'
      break
    case 'price-asc':
      orderBy.price = 'asc'
      break
    case 'price-desc':
      orderBy.price = 'desc'
      break
    case 'rating':
      orderBy.rating = 'desc'
      break
    case 'best-selling':
      orderBy.sales = 'desc'
      break
    default:
      orderBy.createdAt = 'desc'
  }

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: { seller: { select: { id: true, name: true, image: true, avatar: true, isSeller: true } } },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.product.count({ where }),
  ])

  const categories = await db.category.findMany({ orderBy: { order: 'asc' } })

  return NextResponse.json({ products, total, page, limit, categories })
}

// POST - Create new product (authenticated - assigns to logged-in user)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại' }, { status: 401 })
    }

    const body = await req.json()

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập tên sản phẩm' }, { status: 400 })
    }

    // Verify category exists
    if (body.categorySlug) {
      const catExists = await db.category.findUnique({ where: { slug: body.categorySlug } })
      if (!catExists) {
        return NextResponse.json({ error: `Danh mục "${body.categorySlug}" không tồn tại` }, { status: 400 })
      }
    }

    // Ensure the user is a seller
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 })
    }
    if (!user.isSeller) {
      await db.user.update({ where: { id: userId }, data: { isSeller: true } })
    }

    const product = await db.product.create({
      data: {
        title: body.title.trim(),
        description: body.description || '',
        price: body.price || 0,
        isFree: body.isFree || false,
        format: body.format || 'JSFX',
        categorySlug: body.categorySlug || 'effects',
        thumbnail: body.thumbnail || 'https://images.unsplash.com/photo-1598488035243-1a23a6e36919?w=640&h=360&fit=crop',
        videoUrl: body.videoUrl || null,
        duration: body.duration || null,
        tags: body.tags || '',
        featured: body.featured || false,
        published: body.published ?? true,
        sellerId: userId, // Always assign to the logged-in user
      },
      include: { seller: { select: { id: true, name: true, image: true, avatar: true, isSeller: true } } },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/products] Error:', error)
    const msg = error?.code === 'P2003' ? 'Danh mục không tồn tại' : 'Lỗi tạo sản phẩm'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
