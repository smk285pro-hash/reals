import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // 1. Create categories
  const categories = [
    { name: 'Effects', slug: 'effects', icon: '🎵', order: 1 },
    { name: 'Instruments', slug: 'instruments', icon: '🎹', order: 2 },
    { name: 'MIDI', slug: 'midi', icon: '🎛️', order: 3 },
    { name: 'Utility', slug: 'utility', icon: '🔧', order: 4 },
    { name: 'Templates', slug: 'templates', icon: '📄', order: 5 },
    { name: 'Scripts', slug: 'scripts', icon: '📝', order: 6 },
    { name: 'Themes', slug: 'themes', icon: '🎨', order: 7 },
    { name: 'Tutorials', slug: 'tutorials', icon: '📚', order: 8 },
  ]

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    })
  }
  console.log(`✅ Created ${categories.length} categories`)

  // 2. Create admin/seller user
  const hashedPassword = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@reatube.store' },
    update: {},
    create: {
      email: 'admin@reatube.store',
      name: 'ReaTube Admin',
      avatar: 'https://ui-avatars.com/api/?name=ReaTube+Admin&background=f5a623&color=fff&size=128',
      bio: 'Quản trị viên ReaTube Store',
      isSeller: true,
      password: hashedPassword,
    },
  })
  console.log(`✅ Created admin user: admin@reatube.store / admin123`)

  // 3. Create a demo seller
  const demoPassword = await bcrypt.hash('demo123', 12)
  const demoSeller = await prisma.user.upsert({
    where: { email: 'demo@reatube.store' },
    update: {},
    create: {
      email: 'demo@reatube.store',
      name: 'REAPER Developer',
      avatar: 'https://ui-avatars.com/api/?name=REAPER+Dev&background=6366f1&color=fff&size=128',
      bio: 'Chuyên phát triển plugin và script cho REAPER DAW',
      isSeller: true,
      password: demoPassword,
    },
  })
  console.log(`✅ Created demo seller: demo@reatube.store / demo123`)

  // 4. Create sample products
  const products = [
    {
      title: 'ReaVerb Pro - Cabinet Impulse Loader',
      description: 'Plugin tải impulse response cao cấp cho REAPER. Hỗ trợ WAV, AIFF, FLAC với preview trực tiếp. Tích hợp 50+ cabinet IR mẫu từ các amp huyền thoại. Low-latency realtime processing.',
      price: 19.99,
      isFree: false,
      format: 'JSFX',
      categorySlug: 'effects',
      thumbnail: 'https://placehold.co/640x360/1a1a2e/f5a623?text=ReaVerb+Pro',
      videoUrl: 'https://www.youtube.com/watch?v=demo1',
      duration: '3:45',
      views: 1250,
      sales: 89,
      rating: 4.8,
      sellerId: demoSeller.id,
      tags: 'reverb,impulse,cabinet,IR,effects',
      featured: true,
      published: true,
    },
    {
      title: 'MIDI Chord Creator',
      description: 'Tự động tạo progressions hợp âm trên MIDI track. Hỗ trợ 30+ scales, voice leading thông minh, và export sang notation. Tương thích VST3 và standalone.',
      price: 0,
      isFree: true,
      format: 'ReaScript',
      categorySlug: 'midi',
      thumbnail: 'https://placehold.co/640x360/1a1a2e/6366f1?text=Chord+Creator',
      videoUrl: 'https://www.youtube.com/watch?v=demo2',
      duration: '5:12',
      views: 2340,
      sales: 567,
      rating: 4.6,
      sellerId: demoSeller.id,
      tags: 'midi,chord,progression,music,theory',
      featured: true,
      published: true,
    },
    {
      title: 'ReaSynth Gold - Analog Synth',
      description: 'Synthesizer analog mô phỏng cho REAPER. 2 oscillators với unison, multimode filter, 3 ADSR envelopes, 3 LFOs, built-in effects chain. CPU-efficient design.',
      price: 29.99,
      isFree: false,
      format: 'VST3',
      categorySlug: 'instruments',
      thumbnail: 'https://placehold.co/640x360/1a1a2e/ec4899?text=ReaSynth+Gold',
      videoUrl: 'https://www.youtube.com/watch?v=demo3',
      duration: '7:30',
      views: 890,
      sales: 45,
      rating: 4.9,
      sellerId: demoSeller.id,
      tags: 'synth,analog,oscillator,filter,instrument',
      featured: true,
      published: true,
    },
    {
      title: 'Auto-Align Tracks',
      description: 'Tự động căn chỉnh thời gian giữa các track (drum substitution, multi-mic alignment). Detect transients chính xác đến sample-level. Batch processing cho cả project.',
      price: 14.99,
      isFree: false,
      format: 'ReaScript',
      categorySlug: 'utility',
      thumbnail: 'https://placehold.co/640x360/1a1a2e/22c55e?text=Auto+Align',
      videoUrl: 'https://www.youtube.com/watch?v=demo4',
      duration: '2:18',
      views: 670,
      sales: 34,
      rating: 4.5,
      sellerId: demoSeller.id,
      tags: 'align,time,transient,utility,batch',
      featured: false,
      published: true,
    },
    {
      title: 'Dark Theme Pro',
      description: 'Theme tối chuyên nghiệp cho REAPER 7. Tối ưu mắt cho session dài, DPI-aware, 150+ icon custom. Hỗ trợ multi-monitor setups.',
      price: 4.99,
      isFree: false,
      format: 'Theme',
      categorySlug: 'themes',
      thumbnail: 'https://placehold.co/640x360/1a1a2e/8b5cf6?text=Dark+Theme+Pro',
      videoUrl: null,
      duration: null,
      views: 340,
      sales: 120,
      rating: 4.3,
      sellerId: demoSeller.id,
      tags: 'theme,dark,dpi,icons,ui',
      featured: false,
      published: true,
    },
    {
      title: 'Mastering Chain Template',
      description: 'Template mastering chuyên nghiệp với chain FX tối ưu: EQ → Compressor → Limiter → Metering. Presets cho Pop, Rock, EDM, Classical.',
      price: 0,
      isFree: true,
      format: 'Template',
      categorySlug: 'templates',
      thumbnail: 'https://placehold.co/640x360/1a1a2e/f59e0b?text=Mastering+Chain',
      videoUrl: 'https://www.youtube.com/watch?v=demo6',
      duration: '10:00',
      views: 1890,
      sales: 450,
      rating: 4.7,
      sellerId: demoSeller.id,
      tags: 'mastering,template,eq,compressor,limiter',
      featured: true,
      published: true,
    },
  ]

  for (const product of products) {
    const existing = await prisma.product.findFirst({ where: { title: product.title } })
    if (!existing) {
      await prisma.product.create({ data: product })
    }
  }
  console.log(`✅ Created ${products.length} sample products`)

  console.log('\n🎉 Seed completed successfully!')
  console.log('\n📋 Account Info:')
  console.log('   Admin: admin@reatube.store / admin123')
  console.log('   Demo:  demo@reatube.store / demo123')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
