import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Vui lòng nhập đầy đủ thông tin' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Mật khẩu phải có ít nhất 6 ký tự' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email này đã được đăng ký. Vui lòng đăng nhập.' },
        { status: 409 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user
    const user = await db.user.create({
      data: {
        name: name || email.split('@')[0],
        email,
        password: hashedPassword,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || email)}&background=f5a623&color=000&size=128`,
      },
    })

    return NextResponse.json(
      {
        message: 'Đăng ký thành công!',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Register error:', error)
    return NextResponse.json(
      { error: 'Có lỗi xảy ra khi đăng ký' },
      { status: 500 }
    )
  }
}
