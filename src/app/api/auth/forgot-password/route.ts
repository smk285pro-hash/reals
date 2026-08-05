import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Vui lòng nhập email' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: { email },
    })

    if (!user) {
      // Don't reveal if user exists or not
      return NextResponse.json(
        { message: 'Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' },
        { status: 200 }
      )
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 3600000) // 1 hour

    // Save token
    await db.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    })

    // In production, send email via Resend API
    // For now, return the token for demo purposes
    const resendApiKey = process.env.RESEND_API_KEY
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    
    if (resendApiKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'ReaTube Store <noreply@reals.media>',
            to: email,
            subject: 'Đặt lại mật khẩu - ReaTube Store',
            html: `
              <div style="max-width:600px;margin:0 auto;padding:20px;font-family:sans-serif;background:#0f0f0f;color:#f1f1f1;border-radius:12px">
                <h1 style="color:#f5a623;font-size:24px;margin-bottom:16px">Đặt lại mật khẩu</h1>
                <p style="color:#aaa;font-size:16px;line-height:1.6">
                  Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản ReaTube Store.
                </p>
                <a href="${siteUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}" 
                   style="display:inline-block;background:#f5a623;color:#000;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;margin:20px 0">
                  Đặt lại mật khẩu
                </a>
                <p style="color:#888;font-size:14px">
                  Liên kết này sẽ hết hạn sau 1 giờ. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.
                </p>
              </div>
            `,
          }),
        })
        
        if (!response.ok) {
          console.error('Failed to send email:', await response.text())
        }
      } catch (emailError) {
        console.error('Email send error:', emailError)
      }
    }

    return NextResponse.json(
      { 
        message: 'Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.',
        // In development, include token for testing
        ...(process.env.NODE_ENV === 'development' && { token, debugUrl: `${siteUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}` }),
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Forgot password error:', error)
    return NextResponse.json(
      { error: 'Có lỗi xảy ra' },
      { status: 500 }
    )
  }
}
