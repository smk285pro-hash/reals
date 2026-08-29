import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

const OWNER_EMAILS = (process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

async function ensureAdminRole(email: string) {
  if (!OWNER_EMAILS.length || !OWNER_EMAILS.includes(email.toLowerCase())) return
  const user = await db.user.findUnique({ where: { email } })
  if (user && user.role !== 'ADMIN') {
    await db.user.update({ where: { email }, data: { role: 'ADMIN', isSeller: true } })
  }
}

const isProduction = process.env.NODE_ENV === 'production'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mật khẩu', type: 'password' },
      },
      async authorize(credentials) {
        if (isProduction && OWNER_EMAILS.includes(credentials?.email?.toLowerCase() || '')) {
          throw new Error('Admin phải đăng nhập bằng Google để bảo mật')
        }
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Vui lòng nhập email và mật khẩu')
        }
        const user = await db.user.findUnique({ where: { email: credentials.email } })
        if (!user || !user.password) {
          throw new Error('Email hoặc mật khẩu không đúng')
        }
        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) {
          throw new Error('Email hoặc mật khẩu không đúng')
        }
        return { id: user.id, email: user.email, name: user.name, image: user.avatar }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  // Don't override pages — let NextAuth use its default sign-in UI
  // This avoids redirect loops with custom pages
  // pages: {
  //   signIn: '/',
  //   error: '/',
  // },
  callbacks: {
    async signIn({ user, account, profile }) {
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
      if (account) {
        const dbUser = await db.user.findUnique({ where: { email: token.email! } })
        if (dbUser) {
          token.id = dbUser.id
          token.role = dbUser.role
          token.isSeller = dbUser.isSeller
          token.picture = dbUser.image || dbUser.avatar || token.picture
        }
      }
      // Refresh role on every JWT read
      if (token.email && !account) {
        try {
          const dbUser = await db.user.findUnique({
            where: { email: token.email as string },
            select: { role: true, isSeller: true },
          })
          if (dbUser) {
            token.role = dbUser.role
            token.isSeller = dbUser.isSeller
          }
        } catch {}
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
  debug: !isProduction,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
