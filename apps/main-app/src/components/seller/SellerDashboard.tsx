'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Star, Search,
  Package, ArrowLeft, Save, X, LogIn, RefreshCw, AlertCircle, Store,
  Youtube, Upload, Loader2, CheckCircle2
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { Thumbnail } from '@/components/product/Thumbnail'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/stores'
import type { Product, Category } from '@/types'
import { toast } from 'sonner'

type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type StatusFilter = 'ALL' | ReviewStatus

interface ProductFormData {
  title: string
  description: string
  price: number
  isFree: boolean
  format: string
  categorySlug: string
  thumbnail: string
  videoUrl: string
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
  categorySlug: 'effects',
  thumbnail: '',
  videoUrl: '',
  duration: '',
  tags: '',
  featured: false,
  published: false, // New products default to unpublished (draft) — review starts as PENDING
}

const formatOptions = ['JSFX', 'ReaScript Lua', 'ReaScript Python', 'C++ Extension', 'Template']

function formatViews(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

/** Review status badge renderer */
function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  switch (status) {
    case 'PENDING':
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30">
          ⏳ Chờ duyệt
        </Badge>
      )
    case 'APPROVED':
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          ✓ Đã duyệt
        </Badge>
      )
    case 'REJECTED':
      return (
        <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">
          ✗ Bị từ chối
        </Badge>
      )
  }
}

// Auth guard component
function LoginGuard() {
  const { setLoginModalOpen } = useAppStore()
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-[#303030] bg-[#181818] p-12">
        <div className="rounded-full bg-[#f5a623]/10 p-4">
          <LogIn className="h-12 w-12 text-[#f5a623]" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#f1f1f1]">Đăng nhập để tiếp tục</h2>
          <p className="mt-2 text-sm text-[#888]">Bạn cần đăng nhập để quản lý sản phẩm</p>
        </div>
        <Button
          className="gap-2 rounded-lg bg-[#f5a623] px-8 text-black font-semibold hover:bg-[#e09515]"
          onClick={() => setLoginModalOpen(true)}
        >
          <LogIn className="h-4 w-4" />
          Đăng nhập
        </Button>
      </div>
    </div>
  )
}

export function SellerDashboard() {
  const { setActiveCategory, setSellerApplyModalOpen } = useAppStore()
  const { status: authStatus, data: session, update: updateSession } = useSession()
  const isAdmin = (session?.user as any)?.role === 'ADMIN'
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductFormData>(emptyForm)
  const [priceInput, setPriceInput] = useState('0')
  const [saving, setSaving] = useState(false)
  const [resubmittingId, setResubmittingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Verify seller status from server on mount (not just session cache)
  // This catches cases where admin changed the user's seller status but session is stale
  const [serverSellerStatus, setServerSellerStatus] = useState<boolean | null>(null)
  useEffect(() => {
    if (authStatus !== 'authenticated') return
    fetch('/api/seller/apply', { method: 'GET' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const serverIsSeller = data.isSeller === true
          setServerSellerStatus(serverIsSeller)
          // If server and session disagree, force refresh session to sync
          const sessionIsSeller = (session?.user as any)?.isSeller === true
          if (serverIsSeller !== sessionIsSeller) {
            updateSession?.()
          }
        }
      })
      .catch(() => {})
  }, [authStatus])

  // Use server-verified status when available, otherwise fall back to session
  const isVerifiedSeller = serverSellerStatus !== null ? serverSellerStatus : (session?.user as any)?.isSeller === true

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/seller')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products || [])
        setCategories(data.categories || [])
      } else {
        const err = await res.json().catch(() => ({}))
        console.error('[fetchProducts] Error:', res.status, err)
        setProducts([])
        setCategories([])
        if (res.status === 401) {
          toast.error('Vui lòng đăng nhập lại')
        } else {
          toast.error(err.error || 'Lỗi tải sản phẩm')
        }
      }
    } catch (e) {
      console.error('[fetchProducts] Catch:', e)
      setProducts([])
      setCategories([])
      toast.error('Lỗi kết nối server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Auth guard
  if (authStatus === 'unauthenticated') {
    return <LoginGuard />
  }

  // Seller guard - if user is not an approved seller, show registration prompt
  if (authStatus === 'authenticated' && !isVerifiedSeller) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-[#303030] bg-[#181818] p-12 max-w-md text-center">
          <div className="rounded-full bg-[#f5a623]/10 p-4">
            <Store className="h-12 w-12 text-[#f5a623]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#f1f1f1]">Bạn cần đăng ký Seller</h2>
            <p className="mt-2 text-sm text-[#888]">
              Để đăng và quản lý sản phẩm, bạn cần đăng ký tài khoản Seller và được admin duyệt.
            </p>
          </div>
          <Button
            className="gap-2 rounded-lg bg-[#f5a623] px-8 text-black font-semibold hover:bg-[#e09515]"
            onClick={() => setSellerApplyModalOpen(true)}
          >
            <Store className="h-4 w-4" />
            Đăng ký Seller
          </Button>
          <Button
            variant="ghost"
            className="text-[#888] hover:text-[#f1f1f1]"
            onClick={() => setActiveCategory('all')}
          >
            ← Quay lại trang chủ
          </Button>
        </div>
      </div>
    )
  }

  // Derive counts
  const pendingCount = products.filter((p) => p.reviewStatus === 'PENDING').length
  const approvedCount = products.filter((p) => p.reviewStatus === 'APPROVED').length
  const rejectedCount = products.filter((p) => p.reviewStatus === 'REJECTED').length

  // Filtered products: search + status filter
  const filtered = products.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchQ.toLowerCase()) ||
      p.format.toLowerCase().includes(searchQ.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || p.reviewStatus === statusFilter
    return matchesSearch && matchesStatus
  })

  // Toggle publish
  const togglePublish = async (product: Product) => {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, published: !product.published }),
      })
      if (res.ok) {
        toast.success(product.published ? 'Đã ẩn sản phẩm' : 'Đã đăng sản phẩm')
        await fetchProducts()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || `Lỗi cập nhật (${res.status})`)
      }
    } catch {
      toast.error('Lỗi kết nối server')
    }
  }

  // Delete product
  const deleteProduct = async (id: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Đã xóa sản phẩm')
        setDeleteConfirm(null)
        await fetchProducts()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || `Lỗi xóa sản phẩm (${res.status})`)
      }
    } catch {
      toast.error('Lỗi kết nối server')
    }
  }

  // Re-submit a rejected product for review
  const handleResubmit = async (id: string) => {
    setResubmittingId(id)
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewStatus: 'PENDING', reviewNote: null }),
      })
      if (res.ok) {
        toast.success('Đã gửi lại để duyệt')
        await fetchProducts()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || `Lỗi gửi lại (${res.status})`)
      }
    } catch {
      toast.error('Lỗi kết nối server')
    } finally {
      setResubmittingId(null)
    }
  }

  // Open form for edit
  const openEdit = (product: Product) => {
    setEditingId(product.id)
    setPriceInput(String(product.price ?? 0))
    setForm({
      title: product.title,
      description: product.description,
      price: product.price,
      isFree: product.isFree,
      format: product.format,
      categorySlug: product.categorySlug,
      thumbnail: product.thumbnail,
      videoUrl: product.videoUrl || '',
      duration: product.duration || '',
      tags: product.tags,
      featured: product.featured,
      published: product.published,
    })
    // If product has a YouTube URL, auto-fetch thumbnails
    if (product.videoUrl) {
      fetchYoutubeThumbnails(product.videoUrl)
    } else {
      setYtThumbnails([])
      setYtVideoId(null)
    }
    // Load downloadable files attached to this product
    fetchProductFiles(product.id)
    setShowForm(true)
  }

  // Open form for create
  const openCreate = () => {
    setEditingId(null)
    setPriceInput('0')
    setPendingProductFile(null)
    setForm(emptyForm)
    setYtThumbnails([])
    setYtVideoId(null)
    setProductFiles([])
    setFileVersion('')
    setShowForm(true)
  }

  // Save (create or update)
  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Vui lòng nhập tên sản phẩm')
      return
    }
    if (!form.categorySlug) {
      toast.error('Vui lòng chọn danh mục')
      return
    }
    setSaving(true)
    try {
      let success = false
      if (editingId) {
        const res = await fetch(`/api/products/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          toast.success('Đã cập nhật sản phẩm')
          success = true
        } else {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error || `Lỗi cập nhật (${res.status})`)
        }
      } else {
        // New products always start as PENDING for review
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, reviewStatus: 'PENDING' }),
        })
        if (res.ok) {
          const created = await res.json()
          if (pendingProductFile && created?.id) {
            const uploadData = new FormData()
            uploadData.append('file', pendingProductFile)
            const uploadRes = await fetch(`/api/seller/upload-file?productId=${created.id}`, {
              method: 'POST',
              body: uploadData,
            })
            if (!uploadRes.ok) toast.error('Sản phẩm đã tạo nhưng upload file thất bại')
          }
          toast.success(isAdmin ? 'Đã đăng sản phẩm và hiển thị ngay' : 'Đã đăng sản phẩm mới — đang chờ duyệt')
          success = true
        } else {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error || `Lỗi đăng sản phẩm (${res.status})`)
        }
      }
      if (success) {
        setShowForm(false)
        setPendingProductFile(null)
        await fetchProducts()
      }
    } catch (e) {
      console.error('[handleSave] Error:', e)
      toast.error('Lỗi kết nối server')
    } finally {
      setSaving(false)
    }
  }

  // YouTube thumbnail fetching state
  const [ytThumbnails, setYtThumbnails] = useState<{ quality: string; label: string; url: string }[]>([])
  const [ytLoading, setYtLoading] = useState(false)
  const [ytVideoId, setYtVideoId] = useState<string | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Downloadable file state
  interface ProductFileMeta {
    id: string
    fileName: string
    fileSize: number
    fileType: string
    version: string | null
    createdAt: string
  }
  const [productFiles, setProductFiles] = useState<ProductFileMeta[]>([])
  const [pendingProductFile, setPendingProductFile] = useState<File | null>(null)
  const [fileUploading, setFileUploading] = useState(false)
  const [fileVersion, setFileVersion] = useState('')
  const productFileInputRef = useRef<HTMLInputElement>(null)

  // Fetch YouTube thumbnails when videoUrl changes
  const fetchYoutubeThumbnails = async (url: string) => {
    if (!url.trim()) {
      setYtThumbnails([])
      setYtVideoId(null)
      return
    }
    setYtLoading(true)
    try {
      const res = await fetch(`/api/youtube/thumbnails?url=${encodeURIComponent(url.trim())}`)
      if (res.ok) {
        const data = await res.json()
        setYtThumbnails(data.thumbnails || [])
        setYtVideoId(data.videoId || null)
        // Auto-set the best quality thumbnail as the product thumbnail
        if (data.thumbnails?.length > 0 && !form.thumbnail) {
          setForm(f => ({ ...f, thumbnail: data.thumbnails[0].url }))
        }
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Không thể lấy thumbnail YouTube')
        setYtThumbnails([])
        setYtVideoId(null)
      }
    } catch {
      toast.error('Lỗi kết nối server')
      setYtThumbnails([])
      setYtVideoId(null)
    } finally {
      setYtLoading(false)
    }
  }

  // Handle custom thumbnail file upload
  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Chỉ chấp nhận file ảnh (JPG, PNG, WebP, GIF)')
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File quá lớn, tối đa 5MB')
      return
    }

    setUploadLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        setForm(f => ({ ...f, thumbnail: data.url }))
        toast.success('Đã upload thumbnail thành công')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Lỗi upload file')
      }
    } catch {
      toast.error('Lỗi kết nối server')
    } finally {
      setUploadLoading(false)
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Format bytes → human-readable
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  // Fetch downloadable files attached to a product (after edit modal opens)
  const fetchProductFiles = async (productId: string) => {
    try {
      const res = await fetch(`/api/products/${productId}/file`)
      if (res.ok) {
        const data = await res.json()
        setProductFiles(data.files || [])
      } else {
        setProductFiles([])
      }
    } catch {
      setProductFiles([])
    }
  }

  // Upload a downloadable file (zip/lua/jsfx/...)
  const handleProductFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!editingId) {
      setPendingProductFile(file)
      toast.success(`Đã chọn file "${file.name}" — sẽ upload sau khi tạo sản phẩm`)
      if (productFileInputRef.current) productFileInputRef.current.value = ''
      return
    }

    setFileUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (fileVersion.trim()) formData.append('version', fileVersion.trim())

      const res = await fetch(`/api/seller/upload-file?productId=${editingId}`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        setProductFiles((prev) => [data.file, ...prev])
        setFileVersion('')
        toast.success(`Đã upload "${file.name}"`)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Lỗi upload file')
      }
    } catch {
      toast.error('Lỗi kết nối server')
    } finally {
      setFileUploading(false)
      if (productFileInputRef.current) productFileInputRef.current.value = ''
    }
  }

  // Delete a downloadable file
  const handleProductFileDelete = async (fileId: string, fileName: string) => {
    if (!editingId) return
    if (!confirm(`Xóa file "${fileName}"? Hành động không thể hoàn tác.`)) return
    try {
      const res = await fetch(`/api/products/${editingId}/file?fileId=${fileId}`, { method: 'DELETE' })
      if (res.ok) {
        setProductFiles((prev) => prev.filter((f) => f.id !== fileId))
        toast.success(`Đã xóa "${fileName}"`)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Lỗi xóa file')
      }
    } catch {
      toast.error('Lỗi kết nối server')
    }
  }

  // Auto-scan YouTube thumbnails when videoUrl changes (debounced)
  const ytDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (ytDebounceRef.current) clearTimeout(ytDebounceRef.current)
    if (!form.videoUrl.trim()) {
      setYtThumbnails([])
      setYtVideoId(null)
      return
    }
    // Debounce 600ms — wait for user to finish typing/pasting
    ytDebounceRef.current = setTimeout(() => {
      fetchYoutubeThumbnails(form.videoUrl)
    }, 600)
    return () => {
      if (ytDebounceRef.current) clearTimeout(ytDebounceRef.current)
    }
  }, [form.videoUrl])

  const statusFilterOptions: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'ALL', label: 'Tất cả', count: products.length },
    { value: 'PENDING', label: 'Chờ duyệt', count: pendingCount },
    { value: 'APPROVED', label: 'Đã duyệt', count: approvedCount },
    { value: 'REJECTED', label: 'Bị từ chối', count: rejectedCount },
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
          <div className="mt-4 flex flex-wrap gap-4">
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
            <div className="rounded-lg bg-[#1f1f1f] px-4 py-2">
              <span className="text-xs text-amber-400">Chờ duyệt</span>
              <span className="ml-2 text-lg font-bold text-amber-400">{pendingCount}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6">
        {/* Pending products notice banner */}
        {!loading && pendingCount > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
            <span className="text-sm font-medium text-amber-300">
              Bạn có <strong>{pendingCount}</strong> sản phẩm đang chờ duyệt
            </span>
          </div>
        )}

        {/* Status filter tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {statusFilterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                statusFilter === opt.value
                  ? 'bg-[#f5a623] text-black'
                  : 'bg-[#1f1f1f] text-[#aaa] hover:bg-[#272727] hover:text-white'
              }`}
            >
              {opt.label}
              <span className={`ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-xs ${
                statusFilter === opt.value
                  ? 'bg-black/20 text-black'
                  : 'bg-[#303030] text-[#888]'
              }`}>
                {opt.count}
              </span>
            </button>
          ))}
        </div>

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

              {/* New product review notice */}
              {!editingId && !isAdmin && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Sản phẩm mới sẽ được gửi để duyệt trước khi hiển thị công khai.
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#ccc]">Tên sản phẩm *</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="VD: TapeDrift JSFX - Saturation ấm cho Vocal"
                    className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]"
                  />
                </div>

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

                <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-[#ccc]">Giá ($)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.isFree ? '0' : priceInput}
                      onChange={(e) => {
                        const value = e.target.value
                        setPriceInput(value)
                        setForm({
                          ...form,
                          price: value === '' ? 0 : Math.max(0, Number(value) || 0),
                          isFree: value !== '' && Number(value) <= 0 ? true : form.isFree,
                        })
                      }}
                      disabled={form.isFree}
                      className="border-[#303030] bg-[#1a1a1a] text-white disabled:opacity-50"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      className={`w-full whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-medium transition-all sm:w-auto ${
                        form.isFree
                          ? 'border-[#3fb950] bg-[#3fb950]/20 text-[#3fb950]'
                          : 'border-[#303030] bg-[#1a1a1a] text-[#888] hover:border-[#555]'
                      }`}
                      onClick={() => {
                        const nextFree = !form.isFree
                        setForm({ ...form, isFree: nextFree, price: nextFree ? 0 : Math.max(0, Number(priceInput) || 0) })
                        if (nextFree) setPriceInput('0')
                      }}
                    >
                      {form.isFree ? '✓ Miễn phí' : 'Miễn phí'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
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

                {/* YouTube Video URL — auto-scan thumbnails on paste/change */}
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium text-[#ccc]">
                    <Youtube className="h-4 w-4 text-red-500" />
                    Link YouTube Video
                  </label>
                  <div className="relative">
                    <Input
                      value={form.videoUrl}
                      onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                      placeholder="https://www.youtube.com/watch?v=... hoặc https://youtu.be/..."
                      className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]"
                    />
                    {ytLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-red-400" />
                      </div>
                    )}
                  </div>
                  {ytVideoId && !ytLoading && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Đã tìm thấy video — chọn thumbnail bên dưới
                    </div>
                  )}
                </div>

                {/* Thumbnail */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#ccc]">Thumbnail</label>
                  <div className="space-y-3">
                    {/* Upload or URL input */}
                    <div className="flex gap-2">
                      <Input
                        value={form.thumbnail}
                        onChange={(e) => setForm({ ...form, thumbnail: e.target.value })}
                        placeholder="URL thumbnail hoặc upload file bên dưới"
                        className="flex-1 border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0 gap-2 border-[#303030] bg-[#1a1a1a] text-[#3ea6ff] hover:bg-[#272727] hover:text-[#3ea6ff]"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadLoading}
                      >
                        {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        <span className="hidden sm:inline">{uploadLoading ? 'Đang upload...' : 'Upload'}</span>
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleThumbnailUpload}
                        className="hidden"
                      />
                    </div>

                    {/* YouTube thumbnails (auto-suggested) */}
                    {ytThumbnails.length > 0 && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-red-400">
                          <Youtube className="h-3.5 w-3.5" />
                          Thumbnail từ YouTube — chọn 1 ảnh:
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {ytThumbnails.map((thumb, i) => (
                            <button
                              key={i}
                              className={`group relative h-20 w-[120px] shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                                form.thumbnail === thumb.url
                                  ? 'border-red-500 ring-1 ring-red-500/50'
                                  : 'border-[#303030] hover:border-red-400'
                              }`}
                              onClick={() => setForm({ ...form, thumbnail: thumb.url })}
                            >
                              <img src={thumb.url} alt={thumb.label} className="h-full w-full object-cover" />
                              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center text-[9px] text-white">
                                {thumb.label}
                              </div>
                              {form.thumbnail === thumb.url && (
                                <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500">
                                  <CheckCircle2 className="h-3 w-3 text-white" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Preview */}
                    {form.thumbnail && (
                      <div className="mt-1 aspect-video w-full max-w-[360px] overflow-hidden rounded-lg bg-[#333]">
                        <Thumbnail
                          src={form.thumbnail}
                          alt="Preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>

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

                <div className="flex flex-col gap-3 sm:flex-row">
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

                {/* ============ Downloadable File Section ============ */}
                <Separator className="bg-[#303030]" />
                <div className="rounded-xl border border-[#303030] bg-[#0f0f0f] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4 text-[#f5a623]" />
                    <h3 className="text-sm font-semibold text-white">File tải về</h3>
                    {productFiles.length > 0 && (
                      <Badge className="bg-[#f5a623]/20 text-[#f5a623]">{productFiles.length}</Badge>
                    )}
                  </div>

                  {!editingId && pendingProductFile && (
                    <p className="mb-3 text-xs text-emerald-400">✓ Đã chọn: {pendingProductFile.name} — sẽ upload sau khi tạo sản phẩm</p>
                  )}
                  <>
                      {/* Upload row */}
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          value={fileVersion}
                          onChange={(e) => setFileVersion(e.target.value)}
                          placeholder="Phiên bản (VD: 1.0.0) — tùy chọn"
                          className="flex-1 border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]"
                        />
                        <input
                          ref={productFileInputRef}
                          type="file"
                          accept=".zip,.rar,.7z,.lua,.eel,.jsfx,.py,.reaperconfigzip,.reaperconfig,.rpl,.txt,.md,.pdf"
                          onChange={handleProductFileUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          className="shrink-0 gap-2 bg-[#3ea6ff] text-white hover:bg-[#3ea6ff]/80"
                          onClick={() => productFileInputRef.current?.click()}
                          disabled={fileUploading}
                        >
                          {fileUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          {fileUploading ? 'Đang upload...' : 'Upload file'}
                        </Button>
                      </div>

                      {/* File list */}
                      {productFiles.length === 0 ? (
                        <p className="text-xs text-[#666]">Chưa có file nào. Buyer sẽ không thể tải về cho đến khi bạn upload ít nhất 1 file.</p>
                      ) : (
                        <div className="space-y-2">
                          {productFiles.map((f) => (
                            <div
                              key={f.id}
                              className="flex items-center gap-3 rounded-lg border border-[#303030] bg-[#1a1a1a] p-3"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f5a623]/20 text-[#f5a623]">
                                <Package className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-[#f1f1f1]">{f.fileName}</span>
                                  {f.version && (
                                    <Badge variant="outline" className="border-[#303030] text-[#888]">v{f.version}</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-[#888]">
                                  {formatFileSize(f.fileSize)} • {f.fileType.toUpperCase()} • {new Date(f.createdAt).toLocaleDateString('vi-VN')}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 shrink-0 text-red-400 hover:bg-red-400/10"
                                onClick={() => handleProductFileDelete(f.id, f.fileName)}
                                title="Xóa file"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="mt-3 text-[10px] text-[#666]">
                        Hỗ trợ: .zip, .rar, .7z, .lua, .eel, .jsfx, .py, .reaperconfigzip, .txt, .md, .pdf — tối đa 500MB
                      </p>
                  </>
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
            <p className="text-lg font-medium">
              {searchQ || statusFilter !== 'ALL'
                ? 'Không tìm thấy sản phẩm'
                : 'Chưa có sản phẩm'}
            </p>
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
                className={`group rounded-xl border border-[#303030] bg-[#1a1a1a] p-4 transition-all hover:border-[#444] ${!product.published ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-4">
                  <Thumbnail
                    src={product.thumbnail}
                    alt={product.title}
                    className="hidden h-14 w-24 shrink-0 rounded-lg object-cover sm:block"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-medium text-[#f1f1f1]">{product.title}</h3>
                      {product.featured && <Star className="h-3.5 w-3.5 shrink-0 fill-[#f5a623] text-[#f5a623]" />}
                      <ReviewStatusBadge status={product.reviewStatus} />
                    </div>
                    {/* Review note for rejected products */}
                    {product.reviewStatus === 'REJECTED' && product.reviewNote && (
                      <div className="mt-1 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 break-words">
                        <span className="font-medium">Lý do:</span> {product.reviewNote}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#aaa]">
                      <Badge variant="outline" className="border-[#303030] bg-[#0f0f0f] text-[#3ea6ff]">
                        {product.format}
                      </Badge>
                      <Badge variant="outline" className="border-[#303030] bg-[#0f0f0f] text-[#888]">
                        {product.categorySlug}
                      </Badge>
                      <span className="shrink-0">{formatViews(product.views)} views</span>
                      <span className="shrink-0">•</span>
                      <span className="shrink-0">{product.sales} đã bán</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`text-sm font-bold ${product.isFree ? 'text-[#3fb950]' : 'text-[#f5a623]'}`}>
                      {product.isFree ? 'FREE' : `$${product.price}`}
                    </span>
                    <div className="mt-1 md:hidden">
                      <Badge className={`${product.published ? 'bg-[#3fb950]/20 text-[#3fb950]' : 'bg-[#ff6b6b]/20 text-[#ff6b6b]'}`}>
                        {product.published ? 'Đang đăng' : 'Đã ẩn'}
                      </Badge>
                    </div>
                  </div>
                  <div className="hidden shrink-0 md:block">
                    <Badge className={`${product.published ? 'bg-[#3fb950]/20 text-[#3fb950]' : 'bg-[#ff6b6b]/20 text-[#ff6b6b]'}`}>
                      {product.published ? 'Đang đăng' : 'Đã ẩn'}
                    </Badge>
                  </div>
                </div>
                {/* Action buttons row — below content on mobile */}
                <div className="mt-3 flex items-center justify-end gap-1 border-t border-[#303030] pt-3">
                  {/* Re-submit button for rejected products */}
                  {product.reviewStatus === 'REJECTED' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-amber-400 hover:bg-amber-400/10"
                      onClick={() => handleResubmit(product.id)}
                      disabled={resubmittingId === product.id}
                      title="Gửi lại để duyệt"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${resubmittingId === product.id ? 'animate-spin' : ''}`} />
                      <span className="text-xs">Gửi lại</span>
                    </Button>
                  )}
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
