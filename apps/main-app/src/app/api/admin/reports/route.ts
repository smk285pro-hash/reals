import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

// GET /api/admin/reports - List reports with filters
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const url = req.nextUrl
    const status = url.searchParams.get('status') || 'PENDING'
    const type = url.searchParams.get('type') || ''
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')

    const where: any = {}
    if (status && status !== 'ALL') where.status = status
    if (type) where.type = type

    const [reports, total] = await Promise.all([
      db.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true, email: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.report.count({ where }),
    ])

    // Enrich with target info
    const enriched = await Promise.all(
      reports.map(async (r) => {
        let target: any = null
        try {
          if (r.type === 'PRODUCT') {
            target = await db.product.findUnique({
              where: { id: r.targetId },
              select: { id: true, title: true, thumbnail: true, seller: { select: { name: true, email: true } } },
            })
          } else if (r.type === 'USER') {
            target = await db.user.findUnique({
              where: { id: r.targetId },
              select: { id: true, name: true, email: true, avatar: true },
            })
          } else if (r.type === 'REVIEW') {
            target = await db.review.findUnique({
              where: { id: r.targetId },
              select: { id: true, comment: true, rating: true, user: { select: { name: true, email: true } } },
            })
          }
        } catch {}
        return { ...r, target }
      })
    )

    return NextResponse.json({ reports: enriched, total, page, limit })
  } catch (error: any) {
    console.error('[GET /api/admin/reports] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải báo cáo' }, { status: 500 })
  }
}

// PUT /api/admin/reports - Update report status (review/dismiss/action)
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const body = await req.json()
    const { id, status, adminNote, actionType } = body

    if (!id) return NextResponse.json({ error: 'Thiếu report ID' }, { status: 400 })

    if (!['REVIEWED', 'DISMISSED', 'ACTIONED'].includes(status)) {
      return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
    }

    const report = await db.report.update({
      where: { id },
      data: {
        status,
        adminNote: adminNote || null,
      },
      include: { reporter: { select: { id: true, name: true, email: true } } },
    })

    // If ACTIONED, take additional steps based on actionType
    if (status === 'ACTIONED' && actionType) {
      if (report.type === 'PRODUCT') {
        if (actionType === 'UNPUBLISH') {
          await db.product.update({ where: { id: report.targetId }, data: { published: false } })
        } else if (actionType === 'DELETE') {
          await db.review.deleteMany({ where: { productId: report.targetId } })
          await db.product.delete({ where: { id: report.targetId } })
        }
      } else if (report.type === 'USER') {
        if (actionType === 'BAN') {
          // We don't have a ban field, so we just set role to a banned state
          // For now, delete user's sessions to force logout
          await db.session.deleteMany({ where: { userId: report.targetId } })
          await db.user.update({ where: { id: report.targetId }, data: { name: '[Banned] ' + (await db.user.findUnique({ where: { id: report.targetId } }))?.name } })
        }
      } else if (report.type === 'REVIEW') {
        if (actionType === 'DELETE') {
          await db.review.delete({ where: { id: report.targetId } })
        }
      }
    }

    return NextResponse.json(report)
  } catch (error: any) {
    console.error('[PUT /api/admin/reports] Error:', error)
    return NextResponse.json({ error: 'Lỗi cập nhật báo cáo' }, { status: 500 })
  }
}
