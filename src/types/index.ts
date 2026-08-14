export interface Product {
  id: string
  slug: string | null
  title: string
  description: string
  price: number
  isFree: boolean
  format: string
  categorySlug: string
  thumbnail: string
  videoUrl: string | null
  duration: string | null
  views: number
  sales: number
  rating: number
  sellerId: string
  seller: Seller
  tags: string
  featured: boolean
  published: boolean
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewNote: string | null
  createdAt: string
  updatedAt: string
}

export interface Seller {
  id: string
  name: string | null
  avatar: string | null
  isSeller: boolean
}

export interface Category {
  id: string
  name: string
  slug: string
  icon: string | null
  order: number
}

export interface CartItemType {
  id: string
  product: Product
  quantity: number
}
