import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { uploadImage, ImageValidationError } from '@/lib/imageStorage'

/**
 * POST /api/upload
 *
 * Upload an image file to the public Cloudflare R2 bucket.
 * Requires authentication. Returns the permanent public URL.
 *
 * Accepts multipart/form-data with a "file" field.
 * Max file size: 5MB. Allowed types: image/jpeg, image/png, image/webp, image/gif.
 *
 * The returned URL is persisted in `Product.thumbnail`, so it must stay valid
 * indefinitely — which is why images live in a public bucket rather than behind
 * the presigned URLs that serve paid product files.
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })
    }

    // Parse multipart form data
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy file upload' }, { status: 400 })
    }

    const uploaded = await uploadImage(file, userId)

    return NextResponse.json({
      url: uploaded.url,
      pathname: uploaded.key,
      size: uploaded.size,
      type: uploaded.type,
    })
  } catch (error: any) {
    // A rejected file is the caller's problem and keeps its 400; anything else
    // is ours. The previous blanket "Lỗi upload file" made a missing
    // environment variable indistinguishable from a file that was too large.
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('[POST /api/upload] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Lỗi upload file' },
      { status: 500 }
    )
  }
}
