import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, token, password } = body

    if (!email || !token || !password) {
      return NextResponse.json(
        { error: 'Thiếu thông tin cần thiết' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Mật khẩu phải có ít nhất 6 ký tự' },
        { status: 400 }
      )
    }

    // Find the verification token
    const verificationToken = await db.verificationToken.findUnique({
      where: { token },
    })

    if (!verificationToken || verificationToken.identifier !== email) {
      return NextResponse.json(
        { error: 'Token không hợp lệ hoặc đã hết hạn' },
        { status: 400 }
      )
    }

    if (verificationToken.expires < new Date()) {
      // Clean up expired token
      await db.verificationToken.delete({ where: { token } })
      return NextResponse.json(
        { error: 'Token đã hết hạn. Vui lòng yêu cầu đặt lại mật khẩu mới.' },
        { status: 400 }
      )
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Update user password
    await db.user.update({
      where: { email },
      data: { password: hashedPassword },
    })

    // Delete used token
    await db.verificationToken.delete({ where: { token } })

    return NextResponse.json(
      { message: 'Mật khẩu đã được đặt lại thành công!' },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Reset password error:', error)
    return NextResponse.json(
      { error: 'Có lỗi xảy ra khi đặt lại mật khẩu' },
      { status: 500 }
    )
  }
}
