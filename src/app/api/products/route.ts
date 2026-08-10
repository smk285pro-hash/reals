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
    const isAdmin = user.role === 'ADMIN'
    if (!user.isSeller && !isAdmin) {
      return NextResponse.json({ error: 'Bạn cần được duyệt làm seller trước khi đăng sản phẩm' }, { status: 403 })
    }

    // Keep `isFree` and `price` from contradicting each other. The seller form
    // lets the price stay at 0 without the "Miễn phí" toggle being on, which
    // used to save price=0 alongside isFree=false — a row the UI read as paid
    // (and locked behind a purchase) while the server read as free. Deriving one
    // flag from the other here means a single question, "is this free?", has a
    // single answer everywhere downstream.
    const rawPrice = body.price == null ? 0 : Math.max(0, Number(body.price) || 0)
    const isFree = !!body.isFree || rawPrice <= 0
    const price = isFree ? 0 : rawPrice

    const product = await db.product.create({
      data: {
        title: body.title.trim(),
        description: body.description || '',
        price,
        isFree,
        format: body.format || 'JSFX',
        categorySlug: body.categorySlug || 'effects',
        // No placeholder default. This used to fall back to a hardcoded
        // Unsplash URL that has since 404'd, and because the fallback was
        // written on create, a product saved before its thumbnail was uploaded
        // kept the dead link forever — the later upload never overwrote it.
        // Empty means "no thumbnail"; the render sites handle that.
        thumbnail: body.thumbnail || '',
        videoUrl: body.videoUrl || null,
        duration: body.duration || null,
        tags: body.tags || '',
        featured: body.featured || false,
        published: isAdmin ? true : false,
        reviewStatus: isAdmin ? 'APPROVED' : 'PENDING',
        sellerId: userId,
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
