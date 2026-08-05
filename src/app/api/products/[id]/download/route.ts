import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'
import { getLocalFilePath } from '@/lib/fileStorage'
import { readFile as fsReadFile } from 'fs/promises'

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
 * Returns the raw file as a streaming download (Content-Disposition: attachment).
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

    // Resolve absolute path & verify file exists
    let absPath: string
    try {
      absPath = getLocalFilePath(file.filePath)
      await fsReadFile(absPath) // throws ENOENT if missing
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return NextResponse.json(
          { error: 'File không tồn tại trên storage. Vui lòng liên hệ admin.' },
          { status: 404 }
        )
      }
      throw err
    }

    // Build a safe filename for the download header
    const safeTitle = product.title
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s+/g, '_')
      .slice(0, 60) || 'product'
    const downloadName = `${safeTitle}${file.version ? `_v${file.version}` : ''}.${file.fileType}`

    // Stream the file from disk to client (avoids loading large files into memory).
    // We use Node's createReadStream wrapped into a ReadableStream so NextResponse
    // can pipe it directly.
    const { createReadStream } = await import('node:fs')
    const nodeStream = createReadStream(absPath)

    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        nodeStream.on('end', () => controller.close())
        nodeStream.on('error', (err) => controller.error(err))
      },
      cancel() {
        nodeStream.destroy()
      },
    })

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(file.fileSize),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error: any) {
    console.error('[GET /api/products/[id]/download] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Lỗi tải file' },
      { status: 500 }
    )
  }
}
