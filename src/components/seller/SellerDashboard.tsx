'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Star, Search,
  Package, ArrowLeft, Upload, Save, X, ChevronDown
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/stores'
import type { Product, Category } from '@/types'
import { toast } from 'sonner'

interface ProductFormData {
  title: string
  description: string
  price: number
  isFree: boolean
  format: string
  categorySlug: string
  thumbnail: string
  duration: string
  tags: string
  featured: boolean
  published: boolean
}

const emptyForm: ProductFormData = {
  title: '',
  description: '',
  price: 0,
  isFree: false,
  format: 'JSFX',
  categorySlug: 'jsfx',
  thumbnail: '',
  duration: '',
  tags: '',
  featured: false,
  published: true,
}

const formatOptions = ['JSFX', 'ReaScript Lua', 'ReaScript Python', 'C++ Extension', 'Template']

function formatViews(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export function SellerDashboard() {
  const { setActiveCategory } = useAppStore()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/seller')
      const data = await res.json()
      setProducts(data.products)
      setCategories(data.categories)
    } catch {
      toast.error('Lỗi tải sản phẩm')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const filtered = products.filter((p) =>
    p.title.toLowerCase().includes(searchQ.toLowerCase()) ||
    p.format.toLowerCase().includes(searchQ.toLowerCase())
  )

  // Toggle publish
  const togglePublish = async (product: Product) => {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, published: !product.published }),
      })
      if (res.ok) {
        setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, published: !p.published } : p))
        toast.success(product.published ? 'Đã ẩn sản phẩm' : 'Đã đăng sản phẩm')
      }
    } catch {
      toast.error('Lỗi cập nhật')
    }
  }

  // Delete product
  const deleteProduct = async (id: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== id))
        toast.success('Đã xóa sản phẩm')
        setDeleteConfirm(null)
      }
    } catch {
      toast.error('Lỗi xóa sản phẩm')
    }
  }

  // Open form for edit
  const openEdit = (product: Product) => {
    setEditingId(product.id)
    setForm({
      title: product.title,
      description: product.description,
      price: product.price,
      isFree: product.isFree,
      format: product.format,
      categorySlug: product.categorySlug,
      thumbnail: product.thumbnail,
      duration: product.duration || '',
      tags: product.tags,
      featured: product.featured,
      published: product.published,
    })
    setShowForm(true)
  }

  // Open form for create
  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  // Save (create or update)
  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Vui lòng nhập tên sản phẩm')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        // Update
        const res = await fetch(`/api/products/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          const updated = await res.json()
          setProducts((prev) => prev.map((p) => p.id === editingId ? updated : p))
          toast.success('Đã cập nhật sản phẩm')
        }
      } else {
        // Create
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          const newProduct = await res.json()
          setProducts((prev) => [newProduct, ...prev])
          toast.success('Đã đăng sản phẩm mới')
        }
      }
      setShowForm(false)
    } catch {
      toast.error('Lỗi lưu sản phẩm')
    } finally {
      setSaving(false)
    }
  }

  // Thumbnail preview options
  const thumbnailPresets = [
    'https://images.unsplash.com/photo-1598488035243-1a23a6e36919?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1558618660-7c0c3b1a4e93?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1511379928520-ba4c0e00a8db?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1516289587443-44c3f05e5c4f?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1584900501285-24ab11a14c6c?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1493225452364-bab4a9fcd274?w=640&h=360&fit=crop',
  ]

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#f1f1f1]">
      {/* Header */}
      <div className="border-b border-[#303030] bg-[#0f0f0f] px-4 py-4 md:px-6">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="text-[#aaa] hover:bg-[#272727] hover:text-white"
                onClick={() => setActiveCategory('all')}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-lg font-bold text-white">Seller Dashboard</h1>
                <p className="text-xs text-[#888]">Quản lý sản phẩm của bạn</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-lg bg-[#1f1f1f] px-3 py-2 sm:flex">
                <Search className="h-4 w-4 text-[#888]" />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Tìm sản phẩm..."
                  className="bg-transparent text-sm text-white outline-none placeholder:text-[#666]"
                />
              </div>
              <Button
                className="gap-2 rounded-lg bg-[#f5a623] px-4 text-black hover:bg-[#e09515]"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Đăng sản phẩm</span>
              </Button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-4 flex gap-4">
            <div className="rounded-lg bg-[#1f1f1f] px-4 py-2">
              <span className="text-xs text-[#888]">Tổng</span>
              <span className="ml-2 text-lg font-bold text-white">{products.length}</span>
            </div>
            <div className="rounded-lg bg-[#1f1f1f] px-4 py-2">
              <span className="text-xs text-[#888]">Đăng</span>
              <span className="ml-2 text-lg font-bold text-[#3fb950]">{products.filter((p) => p.published).length}</span>
            </div>
            <div className="rounded-lg bg-[#1f1f1f] px-4 py-2">
              <span className="text-xs text-[#888]">Ẩn</span>
              <span className="ml-2 text-lg font-bold text-[#ff6b6b]">{products.filter((p) => !p.published).length}</span>
            </div>
            <div className="rounded-lg bg-[#1f1f1f] px-4 py-2">
              <span className="text-xs text-[#888]">Miễn phí</span>
              <span className="ml-2 text-lg font-bold text-[#3ea6ff]">{products.filter((p) => p.isFree).length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6">
        {/* Product Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowForm(false)}>
            <div
              className="mx-4 max-h-[90vh] w-full max-w-[700px] overflow-y-auto rounded-2xl border border-[#303030] bg-[#0f0f0f] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">
                  {editingId ? 'Chỉnh sửa sản phẩm' : 'Đăng sản phẩm mới'}
                </h2>
                <Button variant="ghost" size="icon" className="text-[#aaa] hover:bg-[#272727]" onClick={() => setShowForm(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#ccc]">Tên sản phẩm *</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="VD: TapeDrift JSFX - Saturation ấm cho Vocal"
                    className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#ccc]">Mô tả</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Mô tả chi tiết sản phẩm..."
                    rows={3}
                    className="w-full rounded-lg border border-[#303030] bg-[#1a1a1a] p-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#3ea6ff]"
                  />
                </div>

                {/* Price + Free toggle */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-[#ccc]">Giá ($)</label>
                    <Input
                      type="number"
                      value={form.isFree ? 0 : form.price}
                      onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                      disabled={form.isFree}
                      className="border-[#303030] bg-[#1a1a1a] text-white disabled:opacity-50"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                        form.isFree
                          ? 'border-[#3fb950] bg-[#3fb950]/20 text-[#3fb950]'
                          : 'border-[#303030] bg-[#1a1a1a] text-[#888] hover:border-[#555]'
                      }`}
                      onClick={() => setForm({ ...form, isFree: !form.isFree, price: form.isFree ? form.price : 0 })}
                    >
                      {form.isFree ? '✓ Miễn phí' : 'Miễn phí'}
                    </button>
                  </div>
                </div>

                {/* Format + Category */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-[#ccc]">Định dạng</label>
                    <select
                      value={form.format}
                      onChange={(e) => setForm({ ...form, format: e.target.value })}
                      className="w-full rounded-lg border border-[#303030] bg-[#1a1a1a] p-2.5 text-sm text-white outline-none focus:border-[#3ea6ff]"
                    >
                      {formatOptions.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-[#ccc]">Danh mục</label>
                    <select
                      value={form.categorySlug}
                      onChange={(e) => setForm({ ...form, categorySlug: e.target.value })}
                      className="w-full rounded-lg border border-[#303030] bg-[#1a1a1a] p-2.5 text-sm text-white outline-none focus:border-[#3ea6ff]"
                    >
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Thumbnail */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#ccc]">Thumbnail URL</label>
                  <Input
                    value={form.thumbnail}
                    onChange={(e) => setForm({ ...form, thumbnail: e.target.value })}
                    placeholder="https://..."
                    className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]"
                  />
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {thumbnailPresets.map((url, i) => (
                      <button
                        key={i}
                        className={`h-12 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${form.thumbnail === url ? 'border-[#f5a623]' : 'border-transparent'}`}
                        onClick={() => setForm({ ...form, thumbnail: url })}
                      >
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                  {form.thumbnail && (
                    <div className="mt-2 aspect-video w-full max-w-[300px] overflow-hidden rounded-lg bg-[#333]">
                      <img src={form.thumbnail} alt="Preview" className="h-full w-full object-cover" />
                    </div>
                  )}
                </div>

                {/* Duration + Tags */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-[#ccc]">Thời lượng video</label>
                    <Input
                      value={form.duration}
                      onChange={(e) => setForm({ ...form, duration: e.target.value })}
                      placeholder="12:45"
                      className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-[#ccc]">Tags (cách dấu phẩy)</label>
                    <Input
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                      placeholder="saturation,tape,vocal"
                      className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]"
                    />
                  </div>
                </div>

                {/* Featured + Published */}
                <div className="flex gap-4">
                  <button
                    className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                      form.featured
                        ? 'border-[#f5a623] bg-[#f5a623]/20 text-[#f5a623]'
                        : 'border-[#303030] bg-[#1a1a1a] text-[#888] hover:border-[#555]'
                    }`}
                    onClick={() => setForm({ ...form, featured: !form.featured })}
                  >
                    {form.featured ? '✓ Nổi bật' : 'Nổi bật'}
                  </button>
                  <button
                    className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                      form.published
                        ? 'border-[#3fb950] bg-[#3fb950]/20 text-[#3fb950]'
                        : 'border-[#303030] bg-[#1a1a1a] text-[#888] hover:border-[#555]'
                    }`}
                    onClick={() => setForm({ ...form, published: !form.published })}
                  >
                    {form.published ? '✓ Đăng ngay' : 'Lưu nháp'}
                  </button>
                </div>

                <Separator className="bg-[#303030]" />

                {/* Save */}
                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    className="flex-1 text-[#aaa] hover:bg-[#272727] hover:text-white"
                    onClick={() => setShowForm(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    className="flex-1 gap-2 rounded-lg bg-[#f5a623] text-black hover:bg-[#e09515]"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Đăng sản phẩm'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setDeleteConfirm(null)}>
            <div className="mx-4 w-full max-w-[400px] rounded-2xl border border-[#303030] bg-[#0f0f0f] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white">Xóa sản phẩm?</h3>
              <p className="mt-2 text-sm text-[#aaa]">Hành động này không thể hoàn tác. Sản phẩm sẽ bị xóa vĩnh viễn.</p>
              <div className="mt-4 flex gap-3">
                <Button variant="ghost" className="flex-1 text-[#aaa] hover:bg-[#272727]" onClick={() => setDeleteConfirm(null)}>
                  Hủy
                </Button>
                <Button className="flex-1 bg-red-600 text-white hover:bg-red-700" onClick={() => deleteProduct(deleteConfirm)}>
                  Xóa vĩnh viễn
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Product List Table */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg bg-[#1f1f1f]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-[#888]">
            <Package className="h-16 w-16 opacity-30" />
            <p className="text-lg font-medium">{searchQ ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm'}</p>
            <Button className="gap-2 rounded-lg bg-[#f5a623] text-black hover:bg-[#e09515]" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Đăng sản phẩm đầu tiên
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((product) => (
              <div
                key={product.id}
                className={`group flex items-center gap-4 rounded-xl border border-[#303030] bg-[#1a1a1a] p-4 transition-all hover:border-[#444] ${!product.published ? 'opacity-60' : ''}`}
              >
                {/* Thumbnail */}
                <img
                  src={product.thumbnail}
                  alt={product.title}
                  className="hidden h-14 w-24 shrink-0 rounded-lg object-cover sm:block"
                />

                {/* Info */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-[#f1f1f1]">{product.title}</h3>
                    {product.featured && <Star className="h-3.5 w-3.5 fill-[#f5a623] text-[#f5a623]" />}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#aaa]">
                    <Badge variant="outline" className="border-[#303030] bg-[#0f0f0f] text-[#3ea6ff]">
                      {product.format}
                    </Badge>
                    <Badge variant="outline" className="border-[#303030] bg-[#0f0f0f] text-[#888]">
                      {product.categorySlug}
                    </Badge>
                    <span>{formatViews(product.views)} views</span>
                    <span>•</span>
                    <span>{product.sales} đã bán</span>
                  </div>
                </div>

                {/* Price */}
                <div className="shrink-0 text-right">
                  <span className={`text-sm font-bold ${product.isFree ? 'text-[#3fb950]' : 'text-[#f5a623]'}`}>
                    {product.isFree ? 'FREE' : `$${product.price}`}
                  </span>
                </div>

                {/* Status */}
                <div className="hidden shrink-0 md:block">
                  <Badge className={`${product.published ? 'bg-[#3fb950]/20 text-[#3fb950]' : 'bg-[#ff6b6b]/20 text-[#ff6b6b]'}`}>
                    {product.published ? 'Đang đăng' : 'Đã ẩn'}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${product.published ? 'text-[#3fb950] hover:bg-[#3fb950]/10' : 'text-[#888] hover:bg-[#272727]'}`}
                    onClick={() => togglePublish(product)}
                    title={product.published ? 'Ẩn sản phẩm' : 'Đăng sản phẩm'}
                  >
                    {product.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-[#3ea6ff] hover:bg-[#3ea6ff]/10"
                    onClick={() => openEdit(product)}
                    title="Chỉnh sửa"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400 hover:bg-red-400/10"
                    onClick={() => setDeleteConfirm(product.id)}
                    title="Xóa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
