import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // List all users
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isSeller: true },
    orderBy: { email: 'asc' },
  })

  console.log('📋 All users:')
  users.forEach(u => {
    console.log(`  ${u.email} | ${u.name || '(no name)'} | role=${u.role} | isSeller=${u.isSeller}`)
  })

  // Find and delete the old admin@reatube.store
  const oldAdmin = await prisma.user.findUnique({ where: { email: 'admin@reatube.store' } })
  if (oldAdmin) {
    console.log(`\n🗑️ Deleting old admin@reatube.store (id: ${oldAdmin.id})`)
    // Cascade delete: sessions, accounts, products, reviews
    await prisma.session.deleteMany({ where: { userId: oldAdmin.id } })
    await prisma.account.deleteMany({ where: { userId: oldAdmin.id } })
    await prisma.review.deleteMany({ where: { userId: oldAdmin.id } })
    const oldProducts = await prisma.product.findMany({ where: { sellerId: oldAdmin.id }, select: { id: true } })
    for (const p of oldProducts) {
      await prisma.review.deleteMany({ where: { productId: p.id } })
    }
    await prisma.product.deleteMany({ where: { sellerId: oldAdmin.id } })
    await prisma.user.delete({ where: { id: oldAdmin.id } })
    console.log('✅ Deleted admin@reatube.store')
  } else {
    console.log('\n⚠️ admin@reatube.store not found')
  }

  // Also find and delete demo@reatube.store if exists
  const oldDemo = await prisma.user.findUnique({ where: { email: 'demo@reatube.store' } })
  if (oldDemo) {
    console.log(`\n🗑️ Deleting old demo@reatube.store (id: ${oldDemo.id})`)
    await prisma.session.deleteMany({ where: { userId: oldDemo.id } })
    await prisma.account.deleteMany({ where: { userId: oldDemo.id } })
    await prisma.review.deleteMany({ where: { userId: oldDemo.id } })
    const oldProducts = await prisma.product.findMany({ where: { sellerId: oldDemo.id }, select: { id: true } })
    for (const p of oldProducts) {
      await prisma.review.deleteMany({ where: { productId: p.id } })
    }
    await prisma.product.deleteMany({ where: { sellerId: oldDemo.id } })
    await prisma.user.delete({ where: { id: oldDemo.id } })
    console.log('✅ Deleted demo@reatube.store')
  } else {
    console.log('\n⚠️ demo@reatube.store not found')
  }

  // Also delete admin@reals.media (the credential-based admin - security risk)
  const credAdmin = await prisma.user.findUnique({ where: { email: 'admin@reals.media' } })
  if (credAdmin) {
    console.log(`\n🗑️ Deleting credential admin@reals.media (id: ${credAdmin.id}) - should use Google OAuth only`)
    await prisma.session.deleteMany({ where: { userId: credAdmin.id } })
    await prisma.account.deleteMany({ where: { userId: credAdmin.id } })
    await prisma.review.deleteMany({ where: { userId: credAdmin.id } })
    const oldProducts = await prisma.product.findMany({ where: { sellerId: credAdmin.id }, select: { id: true } })
    for (const p of oldProducts) {
      await prisma.review.deleteMany({ where: { productId: p.id } })
    }
    await prisma.product.deleteMany({ where: { sellerId: credAdmin.id } })
    await prisma.user.delete({ where: { id: credAdmin.id } })
    console.log('✅ Deleted admin@reals.media')
  }

  // Show remaining users
  const remaining = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isSeller: true },
    orderBy: { email: 'asc' },
  })

  console.log('\n📋 Remaining users:')
  remaining.forEach(u => {
    console.log(`  ${u.email} | ${u.name || '(no name)'} | role=${u.role} | isSeller=${u.isSeller}`)
  })
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
