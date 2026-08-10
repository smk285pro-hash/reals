import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

interface CheckoutItem {
  productId: string
  price: number
  isFree: boolean
}

/**
 * POST /api/checkout/complete
 *
 * Mark a list of cart items as purchased. Creates Purchase records
 * (idempotent — if user already owns a product, no duplicate is created).
 *
 * Body: { items: CheckoutItem[] }
 *
 * PAID PRODUCTS ARE REJECTED HERE. No payment provider is wired up yet, so
 * there is nothing that could have collected money before this route runs — the
 * checkout UI's card form is a mockup and never transmits anything. A Purchase
 * row is what `GET /api/products/[id]/download` treats as proof of payment, so
 * minting one for a priced product would hand out paid files for free to anyone
 * who can log in. Free products are unaffected: their grant is "logged in",
 * which this route can legitimately establish.
 *
 * When a real provider is added, the paid branch below becomes a webhook that
 * creates the Purchase after the charge settles. The download route needs no
 * change — it already asks the right question.
 *
 * `isFree`/`price` are read from the database, never from the request body, so a
 * forged `{ isFree: true }` cannot talk its way past the check.
 *
 * Returns the list of purchased product IDs + the user's full purchase history.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }
    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const items: CheckoutItem[] = Array.isArray(body?.items) ? body.items : []

    if (items.length === 0) {
      return NextResponse.json({ error: 'Giỏ hàng trống' }, { status: 400 })
    }

    // Verify each product exists, is published, and price matches (snapshot)
    const productIds = items.map((i) => i.productId)
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, price: true, isFree: true, published: true, sellerId: true },
    })

    const purchased: { productId: string; price: number }[] = []
    const skipped: { productId: string; reason: string }[] = []

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId)
      if (!product) {
        skipped.push({ productId: item.productId, reason: 'Sản phẩm không tồn tại' })
        continue
      }
      if (!product.published) {
        skipped.push({ productId: item.productId, reason: 'Sản phẩm chưa được đăng' })
        continue
      }

      // Payment gate. Trust the stored price, not the client's claim about it.
      // Sellers may also take their own paid products, since they own the files
      // already and blocking them would only be theatre.
      const isPaid = !product.isFree && product.price > 0
      if (isPaid && product.sellerId !== userId) {
        skipped.push({
          productId: product.id,
          reason: 'Chưa hỗ trợ thanh toán — sản phẩm có phí tạm thời chưa mua được',
        })
        continue
      }

      // Check if user already owns this product (idempotent)
      const existing = await db.purchase.findUnique({
        where: { userId_productId: { userId, productId: product.id } },
      })
      if (existing) {
        // Already owned — skip silently, no error
        skipped.push({ productId: product.id, reason: 'Đã sở hữu' })
        continue
      }

      // Create purchase record with price snapshot
      await db.purchase.create({
        data: {
          userId,
          productId: product.id,
          price: product.isFree ? 0 : product.price,
        },
      })
      purchased.push({ productId: product.id, price: product.isFree ? 0 : product.price })

      // Increment sales counter
      await db.product.update({
        where: { id: product.id },
        data: { sales: { increment: 1 } },
      })

      // Notify the seller about the new sale
      try {
        const sellerProduct = await db.product.findUnique({
          where: { id: product.id },
          select: { title: true, sellerId: true },
        })
        if (sellerProduct) {
          await db.notification.create({
            data: {
              userId: sellerProduct.sellerId,
              type: 'NEW_SALE',
              title: 'Bạn có đơn hàng mới 🎉',
              message: `Sản phẩm "${sellerProduct.title}" vừa được mua.`,
              link: '/?category=seller',
              read: false,
            },
          })
        }
      } catch (notifErr) {
        console.error('[checkout/complete] notification error:', notifErr)
      }
    }

    // Return user's full purchase list (for client to update UI)
    const userPurchases = await db.purchase.findMany({
      where: { userId },
      select: {
        productId: true,
        price: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      purchased,
      skipped,
      purchases: userPurchases,
    })
  } catch (error: any) {
    console.error('[POST /api/checkout/complete] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Lỗi xử lý thanh toán' },
      { status: 500 }
    )
  }
}
