import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// Support multiple owner emails (comma-separated)
const OWNER_EMAILS = (process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

// Auto-promote owner email to ADMIN on first Google login
async function ensureAdminRole(email: string) {
  if (!OWNER_EMAILS.length || !OWNER_EMAILS.includes(email.toLowerCase())) return

  const user = await db.user.findUnique({ where: { email } })
  if (user && user.role !== 'ADMIN') {
    await db.user.update({
      where: { email },
      data: { role: 'ADMIN', isSeller: true },
    })
    console.log(`[Auth] Auto-promoted ${email} to ADMIN (OWNER_EMAILS match)`)
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  providers: [
    // Google OAuth — primary auth method (more secure than password)
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: true, // Allow linking Google account to existing email
    }),
    // Credentials — fallback for dev/demo, disabled in production if Google is configured
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mật khẩu', type: 'password' },
      },
      async authorize(credentials) {
        // Block credential login for admin account in production
        if (process.env.NODE_ENV === 'production' && OWNER_EMAILS.includes(credentials?.email?.toLowerCase() || '')) {
          throw new Error('Admin phải đăng nhập bằng Google để bảo mật')
        }

        if (!credentials?.email || !credentials?.password) {
          throw new Error('Vui lòng nhập email và mật khẩu')
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user || !user.password) {
          throw new Error('Email hoặc mật khẩu không đúng')
        }

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) {
          throw new Error('Email hoặc mật khẩu không đúng')
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/', // Use modal instead of redirect
    error: '/',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // On Google sign-in, auto-promote owner to ADMIN
      if (account?.provider === 'google' && user.email) {
        await ensureAdminRole(user.email)
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role || 'USER'
        token.isSeller = (user as any).isSeller || false
      }
      // On sign in, fetch latest user data (including role)
      if (account) {
        const dbUser = await db.user.findUnique({
          where: { email: token.email! },
        })
        if (dbUser) {
          token.id = dbUser.id
          token.role = dbUser.role
          token.isSeller = dbUser.isSeller
          token.picture = dbUser.image || dbUser.avatar || token.picture
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).isSeller = token.isSeller
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
