import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'
import { deleteFile } from '@/lib/fileStorage'

/**
 * DELETE /api/products/[id]/file?fileId=xxx
 *
 * Delete a downloadable file from a product. Seller (owner) or admin only.
 * Removes DB record AND the underlying file on disk.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }
    const userId = (session.user as any).id
    const userRole = (session.user as any).role

    const { id: productId } = await params

    const { searchParams } = new URL(req.url)
    const fileId = searchParams.get('fileId')
    if (!fileId) {
      return NextResponse.json({ error: 'Thiếu fileId' }, { status: 400 })
    }

    // Find the file
    const file = await db.productFile.findUnique({
      where: { id: fileId },
      include: { product: { select: { sellerId: true, title: true } } },
    })
    if (!file || file.productId !== productId) {
      return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 404 })
    }

    // Permission check: seller owner OR admin
    if (file.product.sellerId !== userId && userRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Bạn không có quyền xóa file này' }, { status: 403 })
    }

    // Delete file on disk
    await deleteFile(file.filePath)

    // Delete DB record
    await db.productFile.delete({ where: { id: fileId } })

    return NextResponse.json({
      message: `Đã xóa file "${file.fileName}"`,
    })
  } catch (error: any) {
    console.error('[DELETE /api/products/[id]/file] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Lỗi xóa file' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/products/[id]/file
 *
 * List all downloadable files attached to a product. Public for read;
 * sellers use this to manage their own files, buyers see file metadata.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params

    const files = await db.productFile.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        version: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ files })
  } catch (error: any) {
    console.error('[GET /api/products/[id]/file] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải danh sách file' }, { status: 500 })
  }
}
