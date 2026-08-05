import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'
import { saveFile, getExtension, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from '@/lib/fileStorage'

/**
 * POST /api/seller/upload-file?productId=xxx
 *
 * Upload a downloadable file for a product. Seller-only.
 * Multipart form data: { file: File, version?: string }
 *
 * Returns the created ProductFile record.
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

    const { searchParams } = new URL(req.url)
    const productId = searchParams.get('productId')
    if (!productId) {
      return NextResponse.json({ error: 'Thiếu productId' }, { status: 400 })
    }

    // Verify the product exists and belongs to this seller
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { sellerId: true, title: true },
    })
    if (!product) {
      return NextResponse.json({ error: 'Không tìm thấy sản phẩm' }, { status: 404 })
    }
    if (product.sellerId !== userId) {
      return NextResponse.json({ error: 'Bạn không có quyền sửa sản phẩm này' }, { status: 403 })
    }

    // Parse form
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const version = (formData.get('version') as string | null)?.trim() || null

    if (!file) {
      return NextResponse.json({ error: 'Thiếu file upload' }, { status: 400 })
    }

    // Validate extension
    const ext = getExtension(file.name)
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext as any)) {
      return NextResponse.json(
        { error: `Định dạng .${ext} không hỗ trợ. Cho phép: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    // Save to storage
    const stored = await saveFile(file, file.name)

    // Insert into DB
    const productFile = await db.productFile.create({
      data: {
        productId,
        fileName: stored.fileName,
        filePath: stored.filePath,
        fileSize: stored.fileSize,
        fileType: stored.fileType,
        version,
      },
    })

    return NextResponse.json({
      file: productFile,
      message: `Đã upload file cho sản phẩm "${product.title}"`,
    })
  } catch (error: any) {
    console.error('[POST /api/seller/upload-file] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Lỗi upload file' },
      { status: 500 }
    )
  }
}
