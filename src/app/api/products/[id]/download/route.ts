import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'
import { createDownloadUrl } from '@/lib/fileStorage'

/**
 * GET /api/products/[id]/download
 *
 * Download the primary file of a product.
 *
 * Auth rules:
 *  - User must be logged in
 *  - If product is FREE: any logged-in user can download
 *  - If product is PAID: user must have a Purchase record
 *
 * Returns a 307 redirect to a short-lived presigned R2 URL. The redirect is the
 * only way the object leaves storage — the bucket is private, and the URL
 * expires in 15 minutes, so a link cannot be usefully shared. Redirecting also
 * sidesteps Vercel's ~4.5MB function response cap, which a 500MB plugin would
 * otherwise hit.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Vui lòng đăng nhập để tải file' }, { status: 401 })
    }
    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })
    }

    const { id: productId } = await params

    // Find product
    const product = await db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        title: true,
        isFree: true,
        price: true,
        sellerId: true,
        published: true,
        reviewStatus: true,
      },
    })
    if (!product) {
      return NextResponse.json({ error: 'Không tìm thấy sản phẩm' }, { status: 404 })
    }

    // Seller owner can always download their own files
    const isOwner = product.sellerId === userId
    const userRole = (session.user as any).role
    const isAdmin = userRole === 'ADMIN'

    // Permission check for non-owners
    if (!isOwner && !isAdmin) {
      if (product.isFree) {
        // Free products: any logged-in user can download
        // (Even if unpublished — let the owner share link with reviewers)
      } else {
        // Paid products: must have purchase record
        const purchase = await db.purchase.findUnique({
          where: { userId_productId: { userId, productId } },
        })
        if (!purchase) {
          return NextResponse.json(
            { error: 'Bạn chưa mua sản phẩm này', needPurchase: true },
            { status: 403 }
          )
        }
      }
    }

    // Find the latest file attached to this product
    const file = await db.productFile.findFirst({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    })
    if (!file) {
      return NextResponse.json(
        { error: 'Sản phẩm chưa có file đính kèm. Vui lòng liên hệ seller.' },
        { status: 404 }
      )
    }

    // Build a safe filename for the download header
    const safeTitle = product.title
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s+/g, '_')
      .slice(0, 60) || 'product'
    const downloadName = `${safeTitle}${file.version ? `_v${file.version}` : ''}.${file.fileType}`

    // Mint a short-lived presigned URL and hand the transfer to R2. The grant
    // was verified above; the URL carries no identity of its own, which is why
    // the TTL is minutes rather than hours.
    const url = await createDownloadUrl({
      key: file.filePath,
      filename: downloadName,
    })

    // 307 keeps the method and is not cached by intermediaries, so an expired
    // URL is never replayed from a cache after the TTL passes.
    return NextResponse.redirect(url, {
      status: 307,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error: any) {
    console.error('[GET /api/products/[id]/download] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Lỗi tải file' },
      { status: 500 }
    )
  }
}
