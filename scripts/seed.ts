import { db } from '@/lib/db'

async function seed() {
  // Create categories
  const categories = await Promise.all([
    db.category.upsert({ where: { slug: 'jsfx' }, update: {}, create: { name: 'JSFX', slug: 'jsfx', icon: 'cpu', order: 1 } }),
    db.category.upsert({ where: { slug: 'reascript' }, update: {}, create: { name: 'ReaScript', slug: 'reascript', icon: 'file-code', order: 2 } }),
    db.category.upsert({ where: { slug: 'extension' }, update: {}, create: { name: 'Extension', slug: 'extension', icon: 'puzzle', order: 3 } }),
    db.category.upsert({ where: { slug: 'mixing' }, update: {}, create: { name: 'Mixing', slug: 'mixing', icon: 'sliders', order: 4 } }),
    db.category.upsert({ where: { slug: 'game-audio' }, update: {}, create: { name: 'Game Audio', slug: 'game-audio', icon: 'gamepad-2', order: 5 } }),
    db.category.upsert({ where: { slug: 'midi' }, update: {}, create: { name: 'MIDI', slug: 'midi', icon: 'music', order: 6 } }),
    db.category.upsert({ where: { slug: 'template' }, update: {}, create: { name: 'Template', slug: 'template', icon: 'layout-template', order: 7 } }),
  ])

  // Create sellers
  const seller = await db.user.upsert({
    where: { email: 'reaforge@example.com' },
    update: {},
    create: { email: 'reaforge@example.com', name: 'ReaForge', bio: 'Chuyên gia JSFX & ReaScript cho REAPER', isSeller: true },
  })
  const seller2 = await db.user.upsert({
    where: { email: 'mixlab@example.com' },
    update: {},
    create: { email: 'mixlab@example.com', name: 'MixLab Audio', bio: 'Mixing & Mastering tools', isSeller: true },
  })
  const seller3 = await db.user.upsert({
    where: { email: 'soundcraft@example.com' },
    update: {},
    create: { email: 'soundcraft@example.com', name: 'SoundCraft Studio', bio: 'Premium audio plugins & extensions', isSeller: true },
  })

  const thumbs = [
    'https://images.unsplash.com/photo-1598488035243-1a23a6e36919?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1558618660-7c0c3b1a4e93?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1511379928520-ba4c0e00a8db?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1516289587443-44c3f05e5c4f?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1584900501285-24ab11a14c6c?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1493225452364-bab4a9fcd274?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1524678375300-39c8a8dd5a0a?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1598488035243-1a23a6e36919?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1558618660-7c0c3b1a4e93?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1511379928520-ba4c0e00a8db?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1516289587443-44c3f05e5c4f?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1584900501285-24ab11a14c6c?w=640&h=360&fit=crop',
  ]

  const products = [
    { title: 'TapeDrift JSFX - Saturation ấm cho Vocal & Drum Bus', description: 'Plugin JSFX mô phỏng tape saturation cổ điển với điều khiển bias, hysteresis và oversampling. Phù hợp cho vocal chain và drum bus. Tạo màu âm ấm đặc trưng analog mà không bị artifact.', price: 29, isFree: false, format: 'JSFX', categorySlug: 'jsfx', thumbnail: thumbs[0], duration: '12:45', views: 15200, sales: 340, rating: 4.8, sellerId: seller.id, tags: 'saturation,tape,vocal,analog', featured: true },
    { title: 'Adaptive Layer Builder - Tự động sinh variation cho Game Audio', description: 'ReaScript tự động tạo layer variation cho game audio. Hỗ trợ random pitch, volume và time stretch. Tích hợp với REAPER region manager.', price: 45, isFree: false, format: 'ReaScript Lua', categorySlug: 'game-audio', thumbnail: thumbs[1], duration: '08:20', views: 8200, sales: 210, rating: 4.6, sellerId: seller.id, tags: 'game-audio,layers,variation,auto', featured: true },
    { title: 'Pitch Drift Mini - Hiệu ứng drift nhẹ miễn phí cho Synth', description: 'JSFX miễn phí tạo hiệu ứng pitch drift nhẹ cho synthesizer. Lý tưởng cho ambient và lo-fi production. CPU usage cực thấp.', price: 0, isFree: true, format: 'JSFX', categorySlug: 'jsfx', thumbnail: thumbs[2], duration: '05:10', views: 32000, sales: 5200, rating: 4.9, sellerId: seller.id, tags: 'pitch,drift,free,ambient,lofi', featured: true },
    { title: 'Batch Render Pro Extension - Render hàng loạt region cực nhanh', description: 'C++ Extension render hàng loạt region với naming convention tùy chỉnh. Hỗ trợ parallel render, metadata tagging và auto-filename.', price: 59, isFree: false, format: 'C++ Extension', categorySlug: 'extension', thumbnail: thumbs[3], duration: '22:30', views: 4500, sales: 180, rating: 4.7, sellerId: seller.id, tags: 'render,batch,region,export', featured: true },
    { title: 'MIDI Humanizer - Groove tự nhiên cho piano roll trong 1 click', description: 'ReaScript thêm swing, velocity variation và timing offset cho MIDI notes. Biết nhận diện genre và tự điều chỉnh parameter.', price: 25, isFree: false, format: 'ReaScript Lua', categorySlug: 'midi', thumbnail: thumbs[4], duration: '10:05', views: 12000, sales: 560, rating: 4.5, sellerId: seller.id, tags: 'midi,humanize,groove,swing', featured: false },
    { title: 'Glue Bus Comp - Bus compressor trong suốt cho Mix Bus', description: 'JSFX glue compressor mô phỏng SSL bus comp. Tính năng: auto makeup gain, sidechain filter, và 3 mode (Stereo/Dual/Mid-Side).', price: 49, isFree: false, format: 'JSFX', categorySlug: 'mixing', thumbnail: thumbs[5], duration: '18:42', views: 9800, sales: 290, rating: 4.8, sellerId: seller2.id, tags: 'compressor,bus,mixing,ssl,glue', featured: true },
    { title: 'Spectral Analyzer Pro - Phân tích FFT thời gian thực', description: 'JSFX spectrum analyzer với spectrogram, peak hold và frequency masking. Hỗ trợ overlay nhiều track cùng lúc.', price: 35, isFree: false, format: 'JSFX', categorySlug: 'mixing', thumbnail: thumbs[6], duration: '15:30', views: 7600, sales: 195, rating: 4.4, sellerId: seller2.id, tags: 'analyzer,spectrum,fft,metering', featured: false },
    { title: 'ReaLearn Template Pack - 50 template cho mọi genre', description: 'Bộ 50 project template cho REAPER: Pop, Rock, EDM, Orchestral, Podcast, Game Audio. Đi kèm routing template và FX chain.', price: 39, isFree: false, format: 'Template', categorySlug: 'template', thumbnail: thumbs[7], duration: '25:00', views: 5400, sales: 420, rating: 4.3, sellerId: seller3.id, tags: 'template,project,genre,routing', featured: false },
    { title: 'Auto-Fade Smart - Tự động crossfade cho edit workflow', description: 'ReaScript tự động tạo crossfade khi split/crop item. Detect zero-crossing và điều chỉnh fade shape theo material.', price: 0, isFree: true, format: 'ReaScript Python', categorySlug: 'reascript', thumbnail: thumbs[8], duration: '07:15', views: 18500, sales: 3800, rating: 4.7, sellerId: seller.id, tags: 'crossfade,edit,auto,free', featured: true },
    { title: 'Spatial Panner 3D - 3D audio panner cho Dolby Atmos', description: 'JSFX 3D panner với distance attenuation, Doppler và HRTF preview. Xuất ADM BWF cho Dolby Atmos renderer.', price: 79, isFree: false, format: 'JSFX', categorySlug: 'mixing', thumbnail: thumbs[9], duration: '30:00', views: 3200, sales: 85, rating: 4.9, sellerId: seller3.id, tags: 'spatial,3d,atmos,panner,dolby', featured: true },
    { title: 'MIDI Chord Detect - Nhận diện & sửa chord tự động', description: 'ReaScript phân tích MIDI notes, nhận diện chord (triad, 7th, extensions) và gợi ý sửa lỗi harmony.', price: 19, isFree: false, format: 'ReaScript Lua', categorySlug: 'midi', thumbnail: thumbs[10], duration: '09:40', views: 14100, sales: 620, rating: 4.6, sellerId: seller2.id, tags: 'midi,chord,theory,detect', featured: false },
    { title: 'Limiter-X - True peak limiter với look-ahead', description: 'JSFX true peak limiter với 4x oversampling, look-ahead buffer và ISP metering. Tối ưu cho mastering chain.', price: 55, isFree: false, format: 'JSFX', categorySlug: 'mixing', thumbnail: thumbs[11], duration: '14:20', views: 6700, sales: 155, rating: 4.8, sellerId: seller3.id, tags: 'limiter,mastering,true-peak,oversampling', featured: true },
  ]

  for (const p of products) {
    await db.product.create({ data: p })
  }

  console.log(`✅ Seeded ${categories.length} categories, 3 sellers, ${products.length} products`)
}

seed().catch(console.error).finally(() => db.$disconnect())
