// Prisma Client singleton with explicit env loading for Next.js compatibility
// Next.js may not pass DATABASE_URL to Prisma runtime correctly in dev mode
import { PrismaClient } from '@prisma/client'

// Load env vars if not already available (fixes Next.js + Prisma runtime issue)
if (!process.env.DATABASE_URL) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require('dotenv')
    dotenv.config({ path: '.env.local' })
    dotenv.config()
  } catch {
    // dotenv not available, env vars must be set externally
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
